import { Annotation, END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { z } from "zod";
import type { AITool, ChatMessage } from "../../domain/ports/ai-provider";
import { verifyReply } from "../../domain/reply-verifier";
import { COMMON_RULES } from "../system-prompt";
import { createChatModel } from "./chat-model";
import { toLangChainTools } from "./lc-tools";

/**
 * Grafo multiagente de ventas por WhatsApp:
 *
 *   router ─┬─ ventas ──┐
 *           ├─ pedido ──┼─ verificador ─┬─ END
 *           ├─ info ────┘       │       └─ (falla 2 veces) ─ humano ─ END
 *           └─ humano ─ END     └─ (falla 1 vez) ─ vuelve al mismo especialista con la corrección
 *
 * Los especialistas razonan con IA y usan herramientas; el verificador es código fijo:
 * "el agente razona y el flujo repite los pasos que no pueden fallar".
 */

export type Intent = "ventas" | "pedido" | "info" | "humano";

export interface TraceStep {
  node: string;
  type: "ruta" | "herramienta" | "respuesta" | "verificacion" | "humano";
  detail?: string;
  tool?: string;
  args?: unknown;
  result?: string;
  ok?: boolean;
  ms?: number;
}

interface Usage {
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
}

export interface GraphTurnResult {
  text: string;
  intent: Intent;
  handoff: boolean;
  trace: TraceStep[];
  tokensIn: number;
  tokensOut: number;
  toolCallsUsed: number;
  model: string;
  provider: "openai" | "gemini";
}

const MAX_TOOL_STEPS = 5;
const MAX_RETRIES = 1;
const HANDOFF_MESSAGE =
  "Ya paso tu mensaje a alguien del equipo 🙌 En un momento te responden por aquí.";

const last = <T>(_a: T, b: T) => b;

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  intent: Annotation<Intent>({ reducer: last, default: () => "ventas" }),
  reply: Annotation<string>({ reducer: last, default: () => "" }),
  attempts: Annotation<number>({ reducer: last, default: () => 0 }),
  correction: Annotation<string | null>({ reducer: last, default: () => null }),
  handoff: Annotation<boolean>({ reducer: last, default: () => false }),
  verified: Annotation<boolean>({ reducer: last, default: () => false }),
  trace: Annotation<TraceStep[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  toolOutputs: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  usage: Annotation<Usage>({
    reducer: (a, b) => ({
      tokensIn: a.tokensIn + b.tokensIn,
      tokensOut: a.tokensOut + b.tokensOut,
      toolCalls: a.toolCalls + b.toolCalls,
    }),
    default: () => ({ tokensIn: 0, tokensOut: 0, toolCalls: 0 }),
  }),
});
type GraphState = typeof State.State;

const SPECIALISTS: Record<Exclude<Intent, "humano">, { tools: string[]; rules: string }> = {
  ventas: {
    tools: ["search_products", "get_business_info"],
    rules: `ERES EL AGENTE DE VENTAS. Ayudas al cliente a encontrar productos y le cotizas.
- Usa search_products antes de mencionar o cotizar cualquier producto. Busca por el tipo de producto en 1 o 2 palabras ("arroz", "jabón rey"); la marca, el tamaño o la presentación revísalos en los resultados.
- Si no hay resultados, intenta una vez más con otra palabra (sinónimo o singular). Si tampoco, di con honestidad que no lo manejas.
- Recomienda máximo 3 productos, con nombre y precio. Si da cantidades, puedes decir el subtotal de cada producto (precio × cantidad).
- Tú no creas pedidos. Si el cliente quiere comprar, confirma productos y cantidades y pregúntale si quiere que se lo deje listo.
- Si solo está consultando, responde sin insistir en la venta.`,
  },
  pedido: {
    tools: ["search_products", "create_pending_order"],
    rules: `ERES EL AGENTE DE PEDIDOS. El cliente quiere comprar.
1. Identifica en la conversación qué productos y cuántas unidades pidió.
2. Llama search_products para obtener los IDs y precios actuales (el historial no trae los IDs).
3. Si el cliente ya confirmó de forma explícita productos y cantidades, crea el pedido con create_pending_order. Si falta un dato (cuál producto exacto, cuántas unidades), pregunta solo eso.
4. Con el pedido creado, dile el código y el total EXACTOS que devolvió la herramienta y cómo puede pagar según los medios de pago del negocio.
5. Si la herramienta devuelve un error (stock_insuficiente, producto_inexistente), NO digas que se creó: explica qué pasó y ofrece una alternativa.
6. Si en esta conversación ya se creó un pedido (aparece un código PED-), NO vuelvas a incluir sus productos: lo que el cliente agregue va en un pedido adicional solo con los productos nuevos, y díselo así ("te dejé un pedido adicional").`,
  },
  info: {
    tools: ["get_business_info"],
    rules: `ERES EL AGENTE DE INFORMACIÓN. Respondes sobre horario, envíos, medios de pago, dirección y políticas.
- Usa solo la INFORMACIÓN DEL NEGOCIO (o get_business_info). Si el dato no está, dilo y ofrece pasar con una persona.
- Si además pregunta por productos o precios, dile que con gusto le ayudas a buscarlos; no des precios de productos tú.`,
  },
};

const ROUTER_PROMPT = `Clasifica el ÚLTIMO mensaje del cliente de una tienda que atiende por WhatsApp, teniendo en cuenta la conversación:
- "ventas": saludos, preguntas por productos, precios, disponibilidad o recomendaciones.
- "pedido": el cliente confirma que quiere comprar o pide cantidades concretas para que se las manden ("sí, mándame 2", "lo llevo", "quiero 10 de arroz").
- "info": horario, envíos o domicilios, medios de pago, dirección, cambios, garantías u otras políticas.
- "humano": pide hablar con una persona, está molesto o se queja, o el tema no tiene que ver con el negocio.
Si dudas entre ventas y otra, elige "ventas".`;

const routerSchema = z.object({
  intent: z.enum(["ventas", "pedido", "info", "humano"]),
  reason: z.string().describe("Por qué, en pocas palabras"),
});

function textOf(message: BaseMessage): string {
  const c = message.content;
  if (typeof c === "string") return c;
  return c
    .map((part) => (typeof part === "string" ? part : part.type === "text" ? String(part.text ?? "") : ""))
    .join("");
}

function usageOf(message: BaseMessage): Usage {
  const u = (message as AIMessage).usage_metadata;
  return { tokensIn: u?.input_tokens ?? 0, tokensOut: u?.output_tokens ?? 0, toolCalls: 0 };
}

function truncate(text: string, max = 400): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function runSalesGraph(input: {
  businessContext: string;
  history: ChatMessage[];
  tools: AITool[];
}): Promise<GraphTurnResult> {
  const { model, modelName, provider } = createChatModel();
  const lcTools = toLangChainTools(input.tools);

  // ── router: clasifica la intención con salida estructurada ──────────────
  async function router(state: GraphState): Promise<Partial<GraphState>> {
    const started = Date.now();
    const classifier = model.withStructuredOutput(routerSchema, { name: "clasificar_mensaje", includeRaw: true });
    const transcript = state.messages
      .slice(-8)
      .map((m) => `${m instanceof HumanMessage ? "Cliente" : "Tienda"}: ${textOf(m)}`)
      .join("\n");
    const { raw, parsed } = await classifier.invoke([
      new SystemMessage(ROUTER_PROMPT),
      new HumanMessage(transcript),
    ]);
    const intent: Intent = parsed?.intent ?? "ventas";
    return {
      intent,
      usage: usageOf(raw),
      trace: [{ node: "router", type: "ruta", detail: `${intent}: ${parsed?.reason ?? "sin razón"}`, ms: Date.now() - started }],
    };
  }

  // ── especialista: ciclo razonar → herramientas → responder ──────────────
  function specialist(name: Exclude<Intent, "humano">) {
    const spec = SPECIALISTS[name];
    const tools = spec.tools.flatMap((t) => (lcTools.has(t) ? [lcTools.get(t)!] : []));
    const bound = model.bindTools!(tools);

    return async (state: GraphState): Promise<Partial<GraphState>> => {
      const started = Date.now();
      const correction = state.correction
        ? `\n\nCORRECCIÓN OBLIGATORIA: tu respuesta anterior se rechazó porque ${state.correction} Vuelve a consultar las herramientas y usa solo sus datos.`
        : "";
      const messages: BaseMessage[] = [
        new SystemMessage(`${input.businessContext}\n${spec.rules}\n\n${COMMON_RULES}${correction}`),
        ...state.messages,
      ];
      const trace: TraceStep[] = [];
      const outputs: string[] = [];
      const usage: Usage = { tokensIn: 0, tokensOut: 0, toolCalls: 0 };

      for (let step = 0; step < MAX_TOOL_STEPS; step++) {
        const ai = (await bound.invoke(messages)) as AIMessage;
        const u = usageOf(ai);
        usage.tokensIn += u.tokensIn;
        usage.tokensOut += u.tokensOut;
        messages.push(ai);

        if (!ai.tool_calls?.length) {
          trace.push({ node: name, type: "respuesta", ms: Date.now() - started });
          return { reply: textOf(ai).trim(), trace, toolOutputs: outputs, usage, correction: null };
        }

        for (const call of ai.tool_calls) {
          const t = lcTools.get(call.name);
          const started = Date.now();
          const output = t && spec.tools.includes(call.name)
            ? String(await t.invoke(call.args))
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
    };
  }

  // ── verificador: código fijo, sin IA ─────────────────────────────────────
  function verificador(state: GraphState): Partial<GraphState> {
    const result = verifyReply(state.reply, {
      toolOutputs: state.toolOutputs,
      businessContext: input.businessContext,
    });
    const step: TraceStep = {
      node: "verificador",
      type: "verificacion",
      ok: result.ok,
      detail: result.ok ? "precios y códigos verificados" : result.problems.join(" "),
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
    if (state.verified) return END;
    return state.attempts <= MAX_RETRIES ? state.intent : "humano";
  }

  // ── humano: entrega a una persona del equipo ─────────────────────────────
  function humano(state: GraphState): Partial<GraphState> {
    return {
      reply: HANDOFF_MESSAGE,
      handoff: true,
      trace: [{
        node: "humano",
        type: "humano",
        detail: state.intent === "humano" ? "el cliente lo pidió o está molesto" : "la respuesta no pasó la verificación",
      }],
    };
  }

  const graph = new StateGraph(State)
    .addNode("router", router)
    .addNode("ventas", specialist("ventas"))
    .addNode("pedido", specialist("pedido"))
    .addNode("info", specialist("info"))
    .addNode("verificador", verificador)
    .addNode("humano", humano)
    .addEdge(START, "router")
    .addConditionalEdges("router", (s: GraphState) => s.intent, ["ventas", "pedido", "info", "humano"])
    .addEdge("ventas", "verificador")
    .addEdge("pedido", "verificador")
    .addEdge("info", "verificador")
    .addConditionalEdges("verificador", afterVerification, ["ventas", "pedido", "info", "humano", END])
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
    trace: final.trace,
    tokensIn: final.usage.tokensIn,
    tokensOut: final.usage.tokensOut,
    toolCallsUsed: final.usage.toolCalls,
    model: modelName,
    provider,
  };
}
