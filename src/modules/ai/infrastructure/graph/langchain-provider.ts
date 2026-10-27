import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { AIProvider, AIProviderKind, ChatTurnInput, ChatTurnOutput } from "../../domain/ports/ai-provider";
import { envAgentModel, resolveAgentModel } from "../agent-model-setting";
import { createChatModel } from "./chat-model";
import { toLangChainTools } from "./lc-tools";

const MAX_TOOL_STEPS = 4;

function textOf(message: BaseMessage): string {
  const c = message.content;
  if (typeof c === "string") return c;
  return c
    .map((part) => (typeof part === "string" ? part : part.type === "text" ? String(part.text ?? "") : ""))
    .join("");
}

/**
 * Un solo agente con herramientas sobre el mismo modelo del grafo (LangChain). Sirve para
 * conversaciones fuera del grafo de ventas, como el asistente del asesor, con el modelo
 * rápido de WhatsApp y el formato de herramientas que aceptan los modelos actuales.
 */
export class LangChainProvider implements AIProvider {
  /** Proveedor de la última respuesta: el modelo se puede cambiar desde /plataforma sin reiniciar */
  private provider: AIProviderKind = envAgentModel().provider;

  get kind(): AIProviderKind {
    return this.provider;
  }

  async chat(input: ChatTurnInput): Promise<ChatTurnOutput> {
    const info = createChatModel(await resolveAgentModel());
    this.provider = info.provider;
    const lcTools = toLangChainTools(input.tools);
    const model = input.tools.length > 0 ? info.model.bindTools!([...lcTools.values()]) : info.model;
    const messages: BaseMessage[] = [
      new SystemMessage(input.systemPrompt),
      ...input.messages.map((m) => (m.role === "assistant" ? new AIMessage(m.content) : new HumanMessage(m.content))),
    ];
    const usage = { tokensIn: 0, cachedTokensIn: 0, tokensOut: 0, toolCalls: 0 };
    const limit = input.maxToolSteps ?? MAX_TOOL_STEPS;

    for (let step = 0; step <= limit; step++) {
      const ai = (await model.invoke(messages)) as AIMessage;
      usage.tokensIn += ai.usage_metadata?.input_tokens ?? 0;
      usage.cachedTokensIn += ai.usage_metadata?.input_token_details?.cache_read ?? 0;
      usage.tokensOut += ai.usage_metadata?.output_tokens ?? 0;
      messages.push(ai);
      if (!ai.tool_calls?.length || step === limit) {
        return { text: textOf(ai).trim(), toolCallsUsed: usage.toolCalls, ...usage, model: info.modelName };
      }
      for (const call of ai.tool_calls) {
        const t = lcTools.get(call.name);
        const output = t ? String(await t.invoke(call.args)) : JSON.stringify({ error: `herramienta desconocida: ${call.name}` });
        usage.toolCalls += 1;
        messages.push(new ToolMessage({ content: output, tool_call_id: call.id ?? call.name }));
      }
    }
    return { text: "", toolCallsUsed: usage.toolCalls, ...usage, model: info.modelName };
  }
}
