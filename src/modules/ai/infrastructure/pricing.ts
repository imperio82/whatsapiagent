/**
 * Estimación de costo de uso de los modelos de IA.
 *
 * Los precios están en USD por 1.000.000 de tokens (input/output) y son
 * aproximados — sirven para dar una señal de costo al dueño del negocio,
 * no para facturación exacta. Actualizá la tabla si cambian las tarifas.
 *
 * El costo se devuelve en "micro-USD" (millonésimas de dólar) como entero,
 * para guardarlo sin perder precisión y evitar floats en la DB.
 */

interface ModelPrice {
  /** USD por 1M de tokens de entrada. */
  inPerMillion: number;
  /** USD por 1M de tokens de salida. */
  outPerMillion: number;
}

// Coincidencia por prefijo: el primero que matchee gana. Ordenar de más
// específico a más general.
const PRICES: Array<[prefix: string, price: ModelPrice]> = [
  ["gpt-4o-mini", { inPerMillion: 0.15, outPerMillion: 0.6 }],
  ["gpt-4o", { inPerMillion: 2.5, outPerMillion: 10 }],
  ["gpt-4.1-mini", { inPerMillion: 0.4, outPerMillion: 1.6 }],
  ["gpt-4.1", { inPerMillion: 2, outPerMillion: 8 }],
  ["gemini-2.5-flash-lite", { inPerMillion: 0.1, outPerMillion: 0.4 }],
  ["gemini-2.5-flash", { inPerMillion: 0.3, outPerMillion: 2.5 }],
  ["gemini-flash-lite", { inPerMillion: 0.1, outPerMillion: 0.4 }],
  ["gemini-flash", { inPerMillion: 0.3, outPerMillion: 2.5 }], // alias "gemini-flash-latest"
  ["gemini-2.0-flash", { inPerMillion: 0.1, outPerMillion: 0.4 }],
  ["gemini-1.5-flash", { inPerMillion: 0.075, outPerMillion: 0.3 }],
  ["gemini-1.5-pro", { inPerMillion: 1.25, outPerMillion: 5 }],
];

const FALLBACK: ModelPrice = { inPerMillion: 0.15, outPerMillion: 0.6 };

function priceFor(model: string): ModelPrice {
  const m = model.toLowerCase();
  for (const [prefix, price] of PRICES) {
    if (m.startsWith(prefix)) return price;
  }
  return FALLBACK;
}

/**
 * Devuelve el costo estimado de un turno en micro-USD (1e-6 USD), redondeado
 * al entero más cercano.
 */
export function estimateCostMicroUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = priceFor(model);
  const usd = (tokensIn / 1_000_000) * p.inPerMillion + (tokensOut / 1_000_000) * p.outPerMillion;
  return Math.round(usd * 1_000_000);
}
