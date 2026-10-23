import type { AIProvider, AIProviderKind } from "../domain/ports/ai-provider";
import { OpenAIProvider } from "./openai-provider";
import { GeminiProvider } from "./gemini-provider";
import { LangChainProvider } from "./graph/langchain-provider";

/**
 * Singleton del provider de IA elegido por env var AI_PROVIDER. Se
 * inicializa lazy (la primera llamada) para no pagar el costo en arranque
 * si el endpoint no lo necesita.
 */

declare global {
  // eslint-disable-next-line no-var
  var __aiProvider: AIProvider | undefined;
}

export function getAIProvider(): AIProvider {
  if (globalThis.__aiProvider) return globalThis.__aiProvider;

  const kind = (process.env.AI_PROVIDER ?? "openai").toLowerCase() as AIProviderKind;
  const provider: AIProvider =
    kind === "gemini" ? new GeminiProvider() : new OpenAIProvider();

  globalThis.__aiProvider = provider;
  return provider;
}

/**
 * Proveedor para respuestas fuera del grafo que deben salir rápido por WhatsApp (asistente del
 * asesor): un agente con herramientas sobre el mismo modelo del grafo (GEMINI_GRAPH_MODEL u OPENAI_MODEL).
 */
export function getFastAIProvider(): AIProvider {
  return new LangChainProvider();
}
