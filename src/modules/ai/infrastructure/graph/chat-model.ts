import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

export interface ChatModelInfo {
  model: BaseChatModel;
  /** Nombre del modelo para registrar el costo. */
  modelName: string;
  provider: "openai" | "gemini";
}

/** El grafo no depende del proveedor: AI_PROVIDER en el .env elige el modelo (igual que el motor simple). */
export function createChatModel(temperature = 0.3): ChatModelInfo {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY no configurada");
    const modelName = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    return { model: new ChatOpenAI({ model: modelName, apiKey, temperature }), modelName, provider: "openai" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");
  // Por defecto "flash-lite": en WhatsApp la velocidad importa y con herramientas responde bien
  // (en pruebas, flash-latest tardó 20–40 s por llamada y flash-lite menos de 1 s)
  const modelName = process.env.GEMINI_GRAPH_MODEL ?? "gemini-flash-lite-latest";
  return {
    model: new ChatGoogleGenerativeAI({ model: modelName, apiKey, temperature, maxOutputTokens: 1024 }),
    modelName,
    provider: "gemini",
  };
}
