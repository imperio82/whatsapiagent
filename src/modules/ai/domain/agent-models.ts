/**
 * Modelos que el dueño de la plataforma puede elegir para el agente (router, especialistas,
 * verificador y asistente del asesor). Solo los que la app ya sabe usar: Gemini y OpenAI.
 */

export type AgentModelProvider = "gemini" | "openai";

export interface AgentModelOption {
  id: string;
  label: string;
  provider: AgentModelProvider;
  note: string;
}

export const AGENT_MODELS: AgentModelOption[] = [
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    provider: "gemini",
    note: "El más barato de Gemini. Rápido; probar que agende bien antes de dárselo a un cliente.",
  },
  {
    id: "gemini-flash-lite-latest",
    label: "Gemini Flash-Lite (última versión)",
    provider: "gemini",
    note: "Alias: Google lo pasa solo a la versión nueva, y el precio puede subir sin aviso.",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    provider: "gemini",
    note: "Más nuevo que 2.5 Flash-Lite y unas 2,5 veces más caro.",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    note: "Mejor con herramientas, unas 3 veces más caro que Flash-Lite y más lento.",
  },
  {
    id: "gpt-5-nano",
    label: "OpenAI GPT-5 nano",
    provider: "openai",
    note: "El más barato de OpenAI. Necesita OPENAI_API_KEY.",
  },
  {
    id: "gpt-5-mini",
    label: "OpenAI GPT-5 mini",
    provider: "openai",
    note: "Necesita OPENAI_API_KEY.",
  },
  {
    id: "gpt-4o-mini",
    label: "OpenAI GPT-4o mini",
    provider: "openai",
    note: "Modelo anterior de OpenAI. Necesita OPENAI_API_KEY.",
  },
];

export function findAgentModel(id: string): AgentModelOption | undefined {
  return AGENT_MODELS.find((m) => m.id === id);
}

/** Los GPT-5 y los modelos "o" solo aceptan la temperatura por defecto. */
export function acceptsTemperature(model: string): boolean {
  return !/^(gpt-5|o\d)/.test(model);
}

/** Costo en USD de una respuesta con los tokens promedio de una respuesta real. Precios en USD por millón. */
export function replyCostUsd(price: { inPerMillion: number; outPerMillion: number }, tokensIn: number, tokensOut: number): number {
  return (tokensIn * price.inPerMillion + tokensOut * price.outPerMillion) / 1_000_000;
}
