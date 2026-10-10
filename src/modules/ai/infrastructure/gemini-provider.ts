import {
  GoogleGenerativeAI,
  type FunctionCall,
  type FunctionDeclaration,
  type Tool,
  SchemaType,
} from "@google/generative-ai";
import { InfrastructureError } from "@shared/domain/errors";
import type {
  AIProvider,
  AITool,
  ChatTurnInput,
  ChatTurnOutput,
} from "../domain/ports/ai-provider";

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
const MAX_TOOL_STEPS = 4;

/**
 * Provider de IA basado en Google Gemini. Implementa el mismo loop de
 * function calling que OpenAIProvider para mantener paridad de
 * comportamiento — los use cases no deben notar la diferencia.
 *
 * Gemini usa una API distinta para tool calling pero el patrón general es
 * el mismo: si la respuesta trae functionCalls, se ejecutan y se
 * realimenta el modelo.
 */
export class GeminiProvider implements AIProvider {
  readonly kind = "gemini" as const;
  private readonly client: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new InfrastructureError("GEMINI_API_KEY no configurado");
    }
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async chat(input: ChatTurnInput): Promise<ChatTurnOutput> {
    const functionDeclarations: FunctionDeclaration[] = input.tools.map((t) =>
      toGeminiFunctionDeclaration(t),
    );
    // Debug: log del schema sanitizado para confirmar que el sanitizer
    // está corriendo correctamente. Quitar cuando esté validado.
    console.log(
      "[gemini] function declarations enviados:",
      JSON.stringify(functionDeclarations, null, 2),
    );
    const tools: Tool[] =
      functionDeclarations.length > 0 ? [{ functionDeclarations }] : [];

    const model = this.client.getGenerativeModel({
      model: DEFAULT_MODEL,
      systemInstruction: input.systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
      // Temperatura baja: respuestas deterministas y fieles al catálogo.
      generationConfig: { temperature: 0.2 },
    });

    // Gemini espera roles "user" y "model" (no "assistant"). Además exige:
    // 1) el primer mensaje del history debe ser "user"
    // 2) los roles deben alternar estrictamente (user/model/user/model/…)
    // OpenAI no es así de estricto. Normalizamos antes de mandar.
    const rawHistory = input.messages.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "model" | "user",
      parts: [{ text: m.content }],
    }));
    const history = normalizeForGemini(rawHistory);

    const lastMessage = history[history.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      throw new InfrastructureError(
        "Gemini: el último mensaje no es del usuario (no hay nada que responder)",
      );
    }

    const chat = model.startChat({ history: history.slice(0, -1) });

    let tokensIn = 0;
    let tokensOut = 0;
    let toolCallsUsed = 0;
    const limit = input.maxToolSteps ?? MAX_TOOL_STEPS;

    let result = await chat.sendMessage(lastMessage.parts);

    for (let step = 0; step <= limit; step++) {
      const response = result.response;
      tokensIn += response.usageMetadata?.promptTokenCount ?? 0;
      tokensOut += response.usageMetadata?.candidatesTokenCount ?? 0;

      const functionCalls = response.functionCalls() ?? [];
      if (functionCalls.length === 0) {
        return {
          text: response.text().trim(),
          toolCallsUsed,
          tokensIn,
          tokensOut,
          model: DEFAULT_MODEL,
        };
      }

      // Ejecutamos cada tool y mandamos los resultados como functionResponses.
      const functionResponses = await Promise.all(
        functionCalls.map(async (call: FunctionCall) => {
          const tool = input.tools.find((t) => t.name === call.name);
          if (!tool) {
            return {
              functionResponse: {
                name: call.name,
                response: { error: `tool "${call.name}" desconocida` },
              },
            };
          }
          try {
            const args = (call.args ?? {}) as Record<string, unknown>;
            const out = await tool.execute(args);
            toolCallsUsed++;
            // Gemini exige que `response` sea un OBJETO (no array, no
            // primitivo). Si la tool devolvió un array o un primitivo,
            // lo envolvemos en { result: ... }.
            let parsed: unknown;
            try {
              parsed = JSON.parse(out);
            } catch {
              parsed = out;
            }
            const responseObj =
              parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
                ? (parsed as object)
                : { result: parsed };
            return {
              functionResponse: {
                name: call.name,
                response: responseObj,
              },
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : "error de tool";
            return {
              functionResponse: { name: call.name, response: { error: message } },
            };
          }
        }),
      );

      result = await chat.sendMessage(functionResponses);
    }

    return {
      text: "Disculpa, no pude procesar tu consulta. Alguien del equipo te va a responder en un momento.",
      toolCallsUsed,
      tokensIn,
      tokensOut,
      model: DEFAULT_MODEL,
    };
  }
}

/**
 * Adapta un AITool genérico al formato FunctionDeclaration de Gemini.
 * Gemini usa un subset de OpenAPI Schema, NO JSON Schema completo: rechaza
 * campos como `additionalProperties`, `$schema`, `$ref`, etc. Por eso
 * sanitizamos recursivamente todo el árbol de schema antes de mandarlo.
 */
function toGeminiFunctionDeclaration(tool: AITool): FunctionDeclaration {
  const params = sanitizeSchema(tool.parameters) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: (params.properties ?? {}) as never,
      required: params.required,
    },
  };
}

/** Campos que Gemini SÍ acepta dentro de un schema. Todo lo demás se descarta. */
const GEMINI_ALLOWED_FIELDS = new Set([
  "type",
  "format",
  "description",
  "nullable",
  "enum",
  "items",
  "properties",
  "required",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
]);

/**
 * Limpia recursivamente un JSON Schema dejando solo lo que Gemini entiende.
 *
 * Distingue dos contextos:
 * - "schema": un objeto schema en sí (filtra keys por allowlist).
 * - "propertyMap": el VALUE de `properties: { ... }`. Sus keys son nombres
 *   de propiedades definidas por el usuario (productId, quantity, etc.),
 *   NO deben filtrarse — solo los values (que sí son schemas).
 */
interface GeminiTurn {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

/**
 * Normaliza el history para cumplir con las reglas de Gemini:
 * 1. Descarta los mensajes "model" iniciales hasta que aparezca uno "user".
 * 2. Si hay dos mensajes consecutivos del mismo rol, los concatena en uno
 *    (Gemini requiere alternancia estricta user/model/user/model/…).
 */
function normalizeForGemini(messages: GeminiTurn[]): GeminiTurn[] {
  // 1. Saltar "model" iniciales
  let start = 0;
  while (start < messages.length && messages[start]!.role === "model") start++;
  const trimmed = messages.slice(start);

  // 2. Mergear consecutivos del mismo rol
  const merged: GeminiTurn[] = [];
  for (const turn of trimmed) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === turn.role) {
      const prevText = prev.parts[0]?.text ?? "";
      const newText = turn.parts[0]?.text ?? "";
      prev.parts = [{ text: `${prevText}\n${newText}`.trim() }];
    } else {
      merged.push({ role: turn.role, parts: [...turn.parts] });
    }
  }
  return merged;
}

function sanitizeSchema(node: unknown, kind: "schema" | "propertyMap" = "schema"): unknown {
  if (Array.isArray(node)) return node.map((item) => sanitizeSchema(item, "schema"));
  if (node === null || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (kind === "propertyMap") {
      // La key es un nombre de propiedad del usuario. Preservar; el value es un schema.
      out[k] = sanitizeSchema(v, "schema");
    } else {
      // Contexto schema: filtramos por allowlist.
      if (!GEMINI_ALLOWED_FIELDS.has(k)) continue;
      // Si la key es "properties", el value es un map de schemas — propagamos el modo.
      out[k] = sanitizeSchema(v, k === "properties" ? "propertyMap" : "schema");
    }
  }
  return out;
}
