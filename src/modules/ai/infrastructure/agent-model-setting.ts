import { prisma } from "@shared/infrastructure/prisma/client";
import { findAgentModel, type AgentModelProvider } from "../domain/agent-models";

/** Clave en platform_settings del modelo del agente elegido en /plataforma */
const KEY = "ai.agentModel";
/** Cada respuesta lee el ajuste: se guarda en memoria un rato para no consultar la base en cada turno */
const CACHE_MS = 30_000;

export interface AgentModelChoice {
  provider: AgentModelProvider;
  modelName: string;
  /** "panel" si lo eligieron en /plataforma; "env" si sale de las variables de entorno */
  source: "panel" | "env";
}

let cache: { id: string | null; at: number } | null = null;

/** El modelo de las variables de entorno: AI_PROVIDER con GEMINI_GRAPH_MODEL u OPENAI_MODEL. */
export function envAgentModel(): AgentModelChoice {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase() === "openai" ? "openai" : "gemini";
  const modelName =
    provider === "openai"
      ? (process.env.OPENAI_MODEL ?? "gpt-4o-mini")
      : // Por defecto "flash-lite": en WhatsApp la velocidad importa y con herramientas responde bien
        // (en pruebas, flash-latest tardó 20–40 s por llamada y flash-lite menos de 1 s)
        (process.env.GEMINI_GRAPH_MODEL ?? "gemini-flash-lite-latest");
  return { provider, modelName, source: "env" };
}

async function storedModelId(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.id;
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: KEY } });
    cache = { id: row?.value ?? null, at: Date.now() };
  } catch (err) {
    // Sin la tabla (migración sin aplicar) o sin base: el agente sigue con el modelo del .env
    console.warn(`[ai] no se pudo leer el modelo del agente: ${(err as Error).message}`);
    cache = { id: null, at: Date.now() };
  }
  return cache.id;
}

/** El modelo con el que responde el agente: el de /plataforma o, si no hay, el de las variables de entorno. */
export async function resolveAgentModel(): Promise<AgentModelChoice> {
  const id = await storedModelId();
  const option = id ? findAgentModel(id) : undefined;
  return option ? { provider: option.provider, modelName: option.id, source: "panel" } : envAgentModel();
}

/** Guarda el modelo elegido; null vuelve a las variables de entorno. */
export async function saveAgentModel(id: string | null): Promise<void> {
  if (id) {
    await prisma.platformSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: id }, update: { value: id } });
  } else {
    await prisma.platformSetting.deleteMany({ where: { key: KEY } });
  }
  cache = { id, at: Date.now() };
}
