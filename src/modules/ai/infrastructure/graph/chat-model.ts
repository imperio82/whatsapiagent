import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { AsyncCaller } from "@langchain/core/utils/async_caller";

export interface ChatModelInfo {
  model: BaseChatModel;
  /** Nombre del modelo para registrar el costo. */
  modelName: string;
  provider: "openai" | "gemini";
}

/**
 * LangChain reintenta en silencio (hasta 6 veces, esperando cada vez más) cuando el proveedor responde
 * "sin cupo" (429) o "saturado" (503): una respuesta podía tardar minutos sin dejar rastro. Se limita a
 * 3 reintentos y cada fallo queda en el log con su causa. La decisión de reintentar o no sigue siendo
 * la de LangChain (su manejador por defecto).
 */
const MAX_RETRIES = 3;
/** Expone el manejador por defecto de LangChain, que es protegido. */
class DefaultRetryPolicy extends AsyncCaller {
  readonly handler = this.onFailedAttempt;
}
const defaultFailedAttempt = new DefaultRetryPolicy({}).handler;

function logFailedAttempt(modelName: string) {
  return (error: unknown) => {
    const e = error as { status?: number; response?: { status?: number }; message?: string };
    const status = e?.status ?? e?.response?.status;
    const message = (e?.message ?? String(error)).slice(0, 300);
    try {
      defaultFailedAttempt?.(error);
      console.warn(`[ai] ${modelName} falló${status ? ` (${status})` : ""}, se reintenta: ${message}`);
    } catch (fatal) {
      console.warn(`[ai] ${modelName} falló${status ? ` (${status})` : ""}, sin reintento: ${message}`);
      throw fatal;
    }
  };
}

/** El grafo no depende del proveedor: AI_PROVIDER en el .env elige el modelo (igual que el motor simple). */
export function createChatModel(temperature = 0.3): ChatModelInfo {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY no configurada");
    const modelName = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    return {
      model: new ChatOpenAI({ model: modelName, apiKey, temperature, maxRetries: MAX_RETRIES, onFailedAttempt: logFailedAttempt(modelName) }),
      modelName,
      provider: "openai",
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");
  // Por defecto "flash-lite": en WhatsApp la velocidad importa y con herramientas responde bien
  // (en pruebas, flash-latest tardó 20–40 s por llamada y flash-lite menos de 1 s)
  const modelName = process.env.GEMINI_GRAPH_MODEL ?? "gemini-flash-lite-latest";
  return {
    model: new ChatGoogleGenerativeAI({
      model: modelName,
      apiKey,
      temperature,
      maxOutputTokens: 1024,
      maxRetries: MAX_RETRIES,
      onFailedAttempt: logFailedAttempt(modelName),
    }),
    modelName,
    provider: "gemini",
  };
}
