import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { InfrastructureError } from "@shared/domain/errors";
import type {
  AIProvider,
  ChatTurnInput,
  ChatTurnOutput,
} from "../domain/ports/ai-provider";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_TOOL_STEPS = 4;

export class OpenAIProvider implements AIProvider {
  readonly kind = "openai" as const;
  private readonly client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new InfrastructureError("OPENAI_API_KEY no configurado");
    }
    this.client = new OpenAI({ apiKey });
  }

  async chat(input: ChatTurnInput): Promise<ChatTurnOutput> {
    const tools: ChatCompletionTool[] = input.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as ChatCompletionTool["function"]["parameters"],
      },
    }));

    const conversation: ChatCompletionMessageParam[] = [
      { role: "system", content: input.systemPrompt },
      ...input.messages.map(
        (m): ChatCompletionMessageParam => ({ role: m.role, content: m.content }),
      ),
    ];

    let tokensIn = 0;
    let tokensOut = 0;
    let toolCallsUsed = 0;
    const limit = input.maxToolSteps ?? MAX_TOOL_STEPS;

    for (let step = 0; step <= limit; step++) {
      const completion = await this.client.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: conversation,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
        // Temperatura baja: priorizamos respuestas deterministas y fieles al
        // catálogo. Reduce el riesgo de que invente precios/productos.
        temperature: 0.2,
      });

      tokensIn += completion.usage?.prompt_tokens ?? 0;
      tokensOut += completion.usage?.completion_tokens ?? 0;

      const choice = completion.choices[0];
      if (!choice) throw new InfrastructureError("OpenAI: respuesta vacía");
      const msg = choice.message;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return {
          text: msg.content?.trim() ?? "",
          toolCallsUsed,
          tokensIn,
          tokensOut,
          model: DEFAULT_MODEL,
        };
      }

      // Empujamos el mensaje del asistente con tool_calls
      conversation.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      });

      // Ejecutamos cada tool en paralelo y agregamos la respuesta
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (call) => {
          if (call.type !== "function") {
            return {
              tool_call_id: call.id,
              content: JSON.stringify({ error: "tool type no soportado" }),
            };
          }
          const tool = input.tools.find((t) => t.name === call.function.name);
          if (!tool) {
            return {
              tool_call_id: call.id,
              content: JSON.stringify({ error: `tool "${call.function.name}" desconocida` }),
            };
          }
          try {
            const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
            const result = await tool.execute(args);
            toolCallsUsed++;
            return { tool_call_id: call.id, content: result };
          } catch (err) {
            const message = err instanceof Error ? err.message : "error de tool";
            return { tool_call_id: call.id, content: JSON.stringify({ error: message }) };
          }
        }),
      );

      for (const r of toolResults) {
        conversation.push({
          role: "tool",
          tool_call_id: r.tool_call_id,
          content: r.content,
        });
      }
    }

    // Se acabaron los pasos sin respuesta final
    return {
      text: "Disculpa, no pude procesar tu consulta. Alguien del equipo te va a responder en un momento.",
      toolCallsUsed,
      tokensIn,
      tokensOut,
      model: DEFAULT_MODEL,
    };
  }
}
