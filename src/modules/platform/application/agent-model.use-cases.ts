import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";
import { ValidationError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { AGENT_MODELS, findAgentModel, replyCostUsd, type AgentModelProvider } from "@modules/ai/domain/agent-models";
import { envAgentModel, resolveAgentModel, saveAgentModel } from "@modules/ai/infrastructure/agent-model-setting";
import { createChatModel } from "@modules/ai/infrastructure/graph/chat-model";
import { priceFor } from "@modules/ai/infrastructure/pricing";
import { VOICE_INTENTS } from "@modules/billing/application/usage";
import { usdCopRate } from "./platform.use-cases";

/** Días de uso real con los que se calcula cuánto gasta en promedio una respuesta */
const SAMPLE_DAYS = 30;
/** Si todavía no hay respuestas, una respuesta típica del grafo (prompt, herramientas, router y verificador) */
const TYPICAL_REPLY = { tokensIn: 20_000, tokensOut: 600 };
const TEST_TIMEOUT_MS = 25_000;

export interface AgentModelOptionDto {
  id: string;
  label: string;
  provider: AgentModelProvider;
  note: string;
  /** Falta la clave de API de su proveedor */
  available: boolean;
  inPerMillion: number;
  outPerMillion: number;
  /** Lo que costaría una respuesta con los tokens promedio de las respuestas reales */
  replyUsd: number;
  replyCop: number;
}

export interface AgentModelDto {
  current: { modelName: string; provider: AgentModelProvider; source: "panel" | "env" };
  /** El de las variables de entorno, al que se vuelve si se quita el del panel */
  env: { modelName: string; provider: AgentModelProvider };
  /** Tokens promedio por respuesta del agente en los últimos días; sample = respuestas medidas */
  average: { tokensIn: number; tokensOut: number; sample: number; days: number };
  usdCopRate: number;
  options: AgentModelOptionDto[];
}

function hasKey(provider: AgentModelProvider): boolean {
  return !!(provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY);
}

export class GetAgentModelUseCase {
  async execute(now = new Date()): Promise<AgentModelDto> {
    const since = new Date(now.getTime() - SAMPLE_DAYS * 86_400_000);
    const [current, agg] = await Promise.all([
      resolveAgentModel(),
      prisma.aiUsageLog.aggregate({
        where: { createdAt: { gte: since }, OR: [{ intent: null }, { intent: { notIn: [...VOICE_INTENTS] } }] },
        _avg: { tokensIn: true, tokensOut: true },
        _count: { _all: true },
      }),
    ]);
    const sample = agg._count._all;
    const average = {
      tokensIn: sample > 0 ? Math.round(agg._avg.tokensIn ?? 0) : TYPICAL_REPLY.tokensIn,
      tokensOut: sample > 0 ? Math.round(agg._avg.tokensOut ?? 0) : TYPICAL_REPLY.tokensOut,
      sample,
      days: SAMPLE_DAYS,
    };
    const rate = usdCopRate();
    const env = envAgentModel();

    const ids = AGENT_MODELS.map((m) => m.id);
    // Un modelo puesto a mano en el .env que no está en la lista también se muestra, para que se vea su costo
    const extra = ids.includes(current.modelName)
      ? []
      : [{ id: current.modelName, label: current.modelName, provider: current.provider, note: "Puesto en las variables de entorno." }];

    return {
      current: { modelName: current.modelName, provider: current.provider, source: current.source },
      env: { modelName: env.modelName, provider: env.provider },
      average,
      usdCopRate: rate,
      options: [...AGENT_MODELS, ...extra].map((m) => {
        const price = priceFor(m.id);
        const replyUsd = replyCostUsd(price, average.tokensIn, average.tokensOut);
        return { ...m, available: hasKey(m.provider), ...price, replyUsd, replyCop: replyUsd * rate };
      }),
    };
  }
}

/** model null = quitar el del panel y volver al de las variables de entorno */
export const setAgentModelSchema = z.object({ model: z.string().min(1).nullable() });
export type SetAgentModelInput = z.infer<typeof setAgentModelSchema>;

export class SetAgentModelUseCase {
  async execute(input: SetAgentModelInput): Promise<void> {
    if (input.model === null) return saveAgentModel(null);

    const option = findAgentModel(input.model);
    if (!option) throw new ValidationError("Ese modelo no está en la lista");
    if (!hasKey(option.provider)) {
      throw new ValidationError(`Falta ${option.provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"} en las variables de entorno`);
    }

    // Una pregunta mínima (unos pocos tokens) antes de guardar: si el modelo no existe o no hay saldo,
    // el agente no se queda sin responder a los clientes
    const { model } = createChatModel({ provider: option.provider, modelName: option.id, source: "panel" });
    try {
      await Promise.race([
        model.invoke([new HumanMessage("Responde solo: OK")]),
        new Promise((_, reject) => setTimeout(() => reject(new Error("no respondió a tiempo")), TEST_TIMEOUT_MS)),
      ]);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      throw new ValidationError(`${option.label} no respondió a la prueba y no se cambió: ${message.slice(0, 200)}`);
    }
    await saveAgentModel(option.id);
  }
}
