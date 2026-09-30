import type { AIProvider, AIProviderKind } from "../domain/ports/ai-provider";
import { OpenAIProvider } from "./openai-provider";
import { GeminiProvider } from "./gemini-provider";

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
