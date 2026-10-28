import { Annotation, END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import type { AITool, ChatMessage } from "../../domain/ports/ai-provider";
import { stripUnverified, verifyReply } from "../../domain/reply-verifier";
import { COMMON_RULES } from "../system-prompt";
import { decideVoiceReply, type VoiceDecision, type VoicePolicy } from "@modules/voice/domain/voice-policy";
import { createChatModel } from "./chat-model";
import { resolveAgentModel } from "../agent-model-setting";
import { normalizeToolArgs, toLangChainTools, toolFields } from "./lc-tools";
import { GRAPH_PROFILES, type GraphProfile } from "./profiles";

/**
 * Grafo multiagente por WhatsApp:
 *
 *   router ─┬─ especialista ─ verificador ─┬─ voz ─ END
 *           │   (ventas, pedido, info…)    ├─ (falla 1 vez) ─ vuelve al especialista con la corrección
 *           │                              └─ (falla 2 veces) ─ seguro ─ voz ─ END
 *           │                                 (sin las frases que no pasaron; si no queda nada, humano)
 *           └─ humano ─ END
 *
 * "voz" decide con código fijo si la respuesta ya verificada sale como nota de voz o por texto
 * (ver voice-policy.ts). En el modo por reglas, el router evalúa las reglas de voz en la misma
 * llamada en que clasifica el mensaje, sin una llamada extra a la IA.
 *
 * Qué especialistas hay y qué herramientas usa cada uno depende del perfil del negocio
 * (tienda o intermediación, ver profiles.ts). Los especialistas razonan con IA y usan
 * herramientas; el verificador es código fijo: "el agente razona y el flujo repite los pasos
 * que no pueden fallar".
 */

/** Intención que eligió el router: un especialista del perfil o "humano". */
export type Intent = string;

export interface TraceStep {
  node: string;
  type: "ruta" | "herramienta" | "respuesta" | "verificacion" | "humano" | "voz";
  detail?: string;
  tool?: string;
  args?: unknown;
  result?: string;
  ok?: boolean;
  ms?: number;
}

interface Usage {
  tokensIn: number;
  /** De tokensIn, los que el proveedor sirvió desde su caché (más baratos y rápidos) */
  cachedTokensIn: number;
  tokensOut: number;
  toolCalls: number;
}

export interface GraphTurnResult {
  text: string;
  intent: Intent;
  handoff: boolean;
  /** Por qué pasó a una persona: lo pidió el cliente o una herramienta, o la respuesta no pasó la verificación */
  handoffReason: HandoffReason | null;
  trace: TraceStep[];
  tokensIn: number;
  cachedTokensIn: number;
  tokensOut: number;
  toolCallsUsed: number;
  model: string;
  provider: "openai" | "gemini";
  /** Cómo sale la respuesta: por texto o como nota de voz */
  delivery: VoiceDecision;
}

const MAX_TOOL_STEPS = 5;
const MAX_RETRIES = 1;

export type HandoffReason = "cliente" | "herramienta" | "verificacion";

const last = <T>(_a: T, b: T) => b;
const TEXT_ONLY: VoiceDecision = { voice: false, alsoText: false, reason: "por texto" };

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  intent: Annotation<Intent>({ reducer: last, default: () => "" }),
  reply: Annotation<string>({ reducer: last, default: () => "" }),
  attempts: Annotation<number>({ reducer: last, default: () => 0 }),
  correction: Annotation<string | null>({ reducer: last, default: () => null }),
  handoff: Annotation<boolean>({ reducer: last, default: () => false }),
  handoffReason: Annotation<HandoffReason | null>({ reducer: last, default: () => null }),
  verified: Annotation<boolean>({ reducer: last, default: () => false }),
  voiceSuggested: Annotation<boolean>({ reducer: last, default: () => false }),
  delivery: Annotation<VoiceDecision>({ reducer: last, default: () => TEXT_ONLY }),
  trace: Annotation<TraceStep[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  toolOutputs: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  usage: Annotation<Usage>({
    reducer: (a, b) => ({
      tokensIn: a.tokensIn + b.tokensIn,
      cachedTokensIn: a.cachedTokensIn + b.cachedTokensIn,
      tokensOut: a.tokensOut + b.tokensOut,
      toolCalls: a.toolCalls + b.toolCalls,
    }),
    default: () => ({ tokensIn: 0, cachedTokensIn: 0, tokensOut: 0, toolCalls: 0 }),
  }),
});
type GraphState = typeof State.State;

const routerSchema = (intents: readonly [string, ...string[]], voiceRules: boolean) => {
  const base = z.object({
    intent: z.enum([...intents, "humano"] as [string, ...string[]]),
    reason: z.string().describe("Por qué, en pocas palabras"),
  });
  return voiceRules
    ? base.extend({ voz: z.boolean().describe("true si, según las reglas de voz, este turno se responde con nota de voz") })
    : base;
};

/**
 * Un error de la herramienta (por ejemplo, el modelo mandó un campo que no existe) vuelve al modelo
 * como resultado, con los campos válidos, para que corrija la llamada: no tumba la respuesta al cliente.
 */
async function invokeTool(t: StructuredToolInterface, name: string, args: Record<string, unknown>): Promise<string> {
  try {
    return String(await t.invoke(normalizeToolArgs(t, args)));
  } catch (err) {
    console.warn(`[ai graph] la herramienta ${name} falló con ${JSON.stringify(args)}:`, err);
    const fields = toolFields(t);
    return JSON.stringify({
      error: `No se pudo ejecutar ${name}: ${err instanceof Error ? err.message : String(err)}`,
      ...(fields.length > 0 ? { camposValidos: fields, nota: "Usa solo estos campos, con estos nombres exactos, y vuelve a intentarlo." } : {}),
    });
  }
}

/** Las herramientas que entregan la conversación a una persona lo indican con "handoff": true. */
function asksForHandoff(output: string): boolean {
  try {
    return (JSON.parse(output) as { handoff?: unknown }).handoff === true;
  } catch {
    return false;
  }
}

function textOf(message: BaseMessage): string {
  const c = message.content;
  if (typeof c === "string") return c;
  return c
    .map((part) => (typeof part === "string" ? part : part.type === "text" ? String(part.text ?? "") : ""))
    .join("");
}

function usageOf(message: BaseMessage): Usage {
  const u = (message as AIMessage).usage_metadata;
  return {
    tokensIn: u?.input_tokens ?? 0,
    cachedTokensIn: u?.input_token_details?.cache_read ?? 0,
    tokensOut: u?.output_tokens ?? 0,
    toolCalls: 0,
  };
}

function truncate(text: string, max = 400): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function runSalesGraph(input: {
  /** Lo fijo del negocio (va al comienzo del prompt, para aprovechar la caché del proveedor) */
  businessContext: string;
  /** Lo que cambia en cada turno: fecha, cliente y su ficha (va al final del prompt) */
  turnContext?: string;
  history: ChatMessage[];
  tools: AITool[];
  /** Perfil del negocio; por defecto, tienda. */
  profile?: GraphProfile;
  /** Reglas del negocio sobre cuándo pasar a una persona (de la base de datos), para el router. */
  handoffRules?: string[];
  /** Lo que se le dice al cliente al pasarlo a una persona (Mi agente); sin esto, el del perfil. */
  handoffMessage?: string | null;
  /** Voz del agente: cuándo responder con nota de voz y si el cliente mandó una */
  voice?: { policy: VoicePolicy; clientSentAudio: boolean };
}): Promise<GraphTurnResult> {
  const profile = input.profile ?? GRAPH_PROFILES.RETAIL;
  const voiceRules =
    !!input.voice?.policy.enabled && input.voice.policy.mode === "RULES" && input.voice.policy.rules.length > 0;
  const { model, modelName, provider } = createChatModel(await resolveAgentModel());
  const lcTools = toLangChainTools(input.tools);
  // Las aclaraciones del perfil van al final, después de las reglas del negocio, para que pesen más
  const routerPrompt = [
    profile.routerPrompt,
    input.handoffRules?.length
      ? `Además, según las reglas del negocio, elige "humano" en estos casos:\n${input.handoffRules.map((r) => `- ${r}`).join("\n")}`
      : "",
    profile.routerExceptions ?? "",
    voiceRules
      ? `Además, decide si este turno se responde con nota de voz (campo "voz"). Responde con voz cuando:\n${input.voice!.policy.rules.map((r) => `- ${r}`).join("\n")}\nEn cualquier otro caso, "voz" es false.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const turnContext = input.turnContext ? `\n\n${input.turnContext}` : "";
  // Lo que escribió el cliente: los montos que dio (presupuesto, oferta) se pueden repetir
  const clientText = input.history.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  // Lo que ya dijo el agente (verificado en su turno): puede repetir datos de un bien que ya mostró
  const previousReplies = input.history.filter((m) => m.role === "assistant").map((m) => m.content).join("\n");

  // ── router: clasifica la intención con salida estructurada ──────────────
  async function router(state: GraphState): Promise<Partial<GraphState>> {
    const started = Date.now();
    const classifier = model.withStructuredOutput(routerSchema(profile.intents, voiceRules), {
      name: "clasificar_mensaje",
      includeRaw: true,
    });
    const transcript = state.messages
      .slice(-8)
      .map((m) => `${m instanceof HumanMessage ? "Cliente" : profile.businessLabel}: ${textOf(m)}`)
      .join("\n");
    const { raw, parsed } = await classifier.invoke([
      new SystemMessage(routerPrompt),
      new HumanMessage(transcript),
    ]);
    const chosen = parsed?.intent as string | undefined;
    const intent: Intent =
      chosen === "humano" || (chosen && profile.specialists[chosen]) ? chosen : profile.defaultIntent;
    const voz = (parsed as { voz?: boolean } | undefined)?.voz === true;
    return {
      intent,
      voiceSuggested: voz,
      usage: usageOf(raw),
      trace: [{
        node: "router",
        type: "ruta",
        detail: `${intent}: ${parsed?.reason ?? "sin razón"}${voiceRules ? (voz ? " · pide voz" : " · sin voz") : ""}`,
        ms: Date.now() - started,
      }],
    };
  }

  // ── especialista: ciclo razonar → herramientas → responder ──────────────
  // Cada especialista del perfil con sus herramientas; el nodo elige según la intención
  const bound = new Map(
    Object.entries(profile.specialists).map(([name, spec]) => {
      // Con los permisos del negocio un especialista puede quedar sin herramientas: responde solo con el contexto
      const available = spec.tools.flatMap((t) => (lcTools.has(t) ? [lcTools.get(t)!] : []));
      return [name, available.length > 0 ? model.bindTools!(available) : model];
    }),
  );

  async function specialist(state: GraphState): Promise<Partial<GraphState>> {
    const name = profile.specialists[state.intent] ? state.intent : profile.defaultIntent;
    const spec = profile.specialists[name]!;
    const withTools = bound.get(name)!;
    const started = Date.now();
    const correction = state.correction
      ? `\n\nCORRECCIÓN OBLIGATORIA: tu respuesta anterior se rechazó porque ${state.correction} Vuelve a consultar las herramientas y usa solo sus datos.`
      : "";
    const messages: BaseMessage[] = [
      new SystemMessage(`${input.businessContext}\n${spec.rules}\n\n${COMMON_RULES}${turnContext}${correction}`),
      ...state.messages,
    ];
    const trace: TraceStep[] = [];
    const outputs: string[] = [];
    const usage: Usage = { tokensIn: 0, cachedTokensIn: 0, tokensOut: 0, toolCalls: 0 };

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const ai = (await withTools.invoke(messages)) as AIMessage;
      const u = usageOf(ai);
      usage.tokensIn += u.tokensIn;
      usage.cachedTokensIn += u.cachedTokensIn;
      usage.tokensOut += u.tokensOut;
      messages.push(ai);

      if (!ai.tool_calls?.length) {
        trace.push({ node: name, type: "respuesta", ms: Date.now() - started });
        return {
          reply: textOf(ai).trim(),
          trace,
          toolOutputs: outputs,
          usage,
          correction: null,
          ...(outputs.some(asksForHandoff) ? { handoff: true, handoffReason: "herramienta" as const } : {}),
        };
      }

      for (const call of ai.tool_calls) {
        const t = lcTools.get(call.name);
        const started = Date.now();
        // Un pedido ya creado en este turno (por ejemplo, antes de un reintento) no se vuelve a crear
        const previousOrder =
          call.name === "create_pending_order"
            ? [...state.toolOutputs, ...outputs].find((o) => o.includes('"orderCode"') && o.includes('"ok":true'))
            : undefined;
        const output = previousOrder
          ? JSON.stringify({ ...JSON.parse(previousOrder), nota: "Este pedido ya se creó en este turno; no se creó otro." })
          : t && spec.tools.includes(call.name)
            ? await invokeTool(t, call.name, call.args)
            : JSON.stringify({ error: `herramienta no disponible para ${name}: ${call.name}` });
        usage.toolCalls += 1;
        outputs.push(output);
        messages.push(new ToolMessage({ content: output, tool_call_id: call.id ?? call.name }));
        trace.push({
          node: name,
          type: "herramienta",
          tool: call.name,
          args: call.args,
          result: truncate(output),
          ms: Date.now() - started,
        });
      }
    }

    trace.push({ node: name, type: "respuesta", detail: "se alcanzó el máximo de pasos sin respuesta" });
    return { reply: "", trace, toolOutputs: outputs, usage, correction: null };
  }

  // ── verificador: código fijo, sin IA ─────────────────────────────────────
  function verificador(state: GraphState): Partial<GraphState> {
    const result = verifyReply(state.reply, {
      toolOutputs: state.toolOutputs,
      // La ficha del cliente (pedidos anteriores) también es evidencia válida de códigos y precios
      businessContext: `${input.businessContext}${turnContext}`,
      clientText,
      previousReplies,
    });
    const step: TraceStep = {
      node: "verificador",
      type: "verificacion",
      ok: result.ok,
      detail: result.ok ? "precios, códigos y características verificados" : result.problems.join(" "),
    };
    if (result.ok) return { verified: true, trace: [step] };
    return {
      verified: false,
      attempts: state.attempts + 1,
      correction: result.problems.join(" "),
      trace: [step],
    };
  }

  function afterVerification(state: GraphState): string {
    if (state.verified) return "voz";
    return state.attempts <= MAX_RETRIES ? "especialista" : "seguro";
  }

  // ── seguro: la verificación falló dos veces ──────────────────────────────
  // Un dato dudoso no es motivo para pasar a una persona: se envía la respuesta sin las frases que no pasaron
  // y se sigue atendiendo. Solo si no queda nada que enviar (por ejemplo, la respuesta venía vacía) pasa a humano.
  function seguro(state: GraphState): Partial<GraphState> {
    const evidence = { toolOutputs: state.toolOutputs, businessContext: `${input.businessContext}${turnContext}`, clientText, previousReplies };
    const kept = stripUnverified(state.reply, evidence);
    const reply = kept || (state.reply.trim() ? profile.safeReply : "");
    if (!reply) return { reply: "" };
    return {
      reply,
      verified: true,
      trace: [{
        node: "seguro",
        type: "verificacion",
        ok: true,
        detail: kept
          ? `se envió sin las frases que no pasaron la verificación: ${state.correction ?? ""}`
          : `ninguna frase pasó la verificación; se envió la respuesta segura: ${state.correction ?? ""}`,
      }],
    };
  }

  // ── voz: texto o nota de voz, con código fijo ────────────────────────────
  function voz(state: GraphState): Partial<GraphState> {
    if (!input.voice?.policy.enabled) return { delivery: TEXT_ONLY };
    const delivery = decideVoiceReply(input.voice.policy, {
      reply: state.reply,
      intent: state.intent,
      clientSentAudio: input.voice.clientSentAudio,
      routerSuggestsVoice: state.voiceSuggested,
    });
    return {
      delivery,
      trace: [{
        node: "voz",
        type: "voz",
        ok: true,
        detail: `${delivery.voice ? (delivery.alsoText ? "nota de voz y texto" : "nota de voz") : "por texto"}: ${delivery.reason}`,
      }],
    };
  }

  // ── humano: entrega a una persona del equipo ─────────────────────────────
  function humano(state: GraphState): Partial<GraphState> {
    return {
      reply: input.handoffMessage?.trim() || profile.handoffMessage,
      handoff: true,
      handoffReason: state.intent === "humano" ? "cliente" : "verificacion",
      trace: [{
        node: "humano",
        type: "humano",
        detail: state.intent === "humano" ? "el cliente lo pidió o está molesto" : "la respuesta no pasó la verificación",
      }],
    };
  }

  const graph = new StateGraph(State)
    .addNode("router", router)
    .addNode("especialista", specialist)
    .addNode("verificador", verificador)
    .addNode("humano", humano)
    .addNode("seguro", seguro)
    .addNode("voz", voz)
    .addEdge(START, "router")
    .addConditionalEdges("router", (s: GraphState) => (s.intent === "humano" ? "humano" : "especialista"), [
      "especialista",
      "humano",
    ])
    .addEdge("especialista", "verificador")
    .addConditionalEdges("verificador", afterVerification, ["especialista", "seguro", "voz"])
    .addConditionalEdges("seguro", (s: GraphState) => (s.reply ? "voz" : "humano"), ["voz", "humano"])
    .addEdge("voz", END)
    .addEdge("humano", END)
    .compile();

  const history: BaseMessage[] = input.history
    .filter((m) => m.role !== "system")
    .map((m) => (m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)));

  const final = await graph.invoke({ messages: history });

  return {
    text: final.reply,
    intent: final.intent,
    handoff: final.handoff,
    handoffReason: final.handoff ? final.handoffReason : null,
    trace: final.trace,
    tokensIn: final.usage.tokensIn,
    cachedTokensIn: final.usage.cachedTokensIn,
    tokensOut: final.usage.tokensOut,
    toolCallsUsed: final.usage.toolCalls,
    model: modelName,
    provider,
    delivery: final.delivery,
  };
}
