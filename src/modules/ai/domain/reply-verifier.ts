/**
 * Verificador determinista (sin IA) de la respuesta antes de enviarla al cliente:
 * cada precio y cada código de pedido que aparezca en el texto debe venir de una
 * herramienta o de la información del negocio. Es la red de seguridad contra
 * datos inventados por el modelo.
 */

export interface VerificationEvidence {
  /** Resultados crudos (JSON) de las herramientas que se ejecutaron en este turno. */
  toolOutputs: string[];
  /** Texto con la información del negocio (puede traer costos de envío, por ejemplo). */
  businessContext: string;
}

export interface VerificationResult {
  ok: boolean;
  problems: string[];
}

/** Máximo de unidades para aceptar un subtotal como precio × cantidad. */
const MAX_UNITS = 1000;

/** "$4.500", "$ 4,500", "$12.000,50" → 4500, 4500, 12000.5 */
export function extractPrices(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:[.,]\d{3})+|\d+)(?:,(\d{1,2}))?/g)) {
    const integer = Number((m[1] ?? "").replace(/[.,]/g, ""));
    out.push(m[2] ? integer + Number(`0.${m[2]}`) : integer);
  }
  return out;
}

export function extractOrderCodes(text: string): string[] {
  return [...text.matchAll(/\b(?:PED|ORD)-\d{3,}\b/g)].map((m) => m[0]);
}

/** Valores numéricos de las claves de precio o total (priceMajor, totalMajor…) de un JSON. */
function collectPrices(value: unknown, into: Set<number>, key = ""): void {
  if (typeof value === "number") {
    if (/price|total/i.test(key) && value > 0) into.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectPrices(v, into, key);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectPrices(v, into, k);
  }
}

/** Precios que el modelo puede citar: los de las herramientas y los de la información del negocio. */
export function evidencePrices(evidence: VerificationEvidence): number[] {
  const prices = new Set<number>(extractPrices(evidence.businessContext));
  for (const out of evidence.toolOutputs) {
    try {
      collectPrices(JSON.parse(out), prices);
    } catch {
      for (const p of extractPrices(out)) prices.add(p);
    }
  }
  return [...prices];
}

/** El precio es uno de la evidencia, o el subtotal de una línea (precio × cantidad). */
function isSupported(price: number, evidence: number[]): boolean {
  return evidence.some((e) => {
    if (Math.abs(e - price) < 0.01) return true;
    const units = Math.round(price / e);
    return units >= 1 && units <= MAX_UNITS && Math.abs(e * units - price) < 0.01;
  });
}

export function verifyReply(reply: string, evidence: VerificationEvidence): VerificationResult {
  const problems: string[] = [];
  if (!reply.trim()) problems.push("La respuesta está vacía.");

  const allowed = evidencePrices(evidence);
  for (const price of extractPrices(reply)) {
    if (!isSupported(price, allowed)) {
      problems.push(
        `El precio $${price.toLocaleString("es-CO")} no viene de ninguna herramienta ni de la información del negocio.`,
      );
    }
  }

  // Códigos válidos: los que devolvió una herramienta o los de pedidos anteriores del cliente (en el contexto)
  const knownCodes = new Set([
    ...evidence.toolOutputs.flatMap(extractOrderCodes),
    ...extractOrderCodes(evidence.businessContext),
  ]);
  for (const code of extractOrderCodes(reply)) {
    if (!knownCodes.has(code)) {
      problems.push(`El código ${code} no lo devolvió create_pending_order ni es un pedido anterior del cliente.`);
    }
  }

  return { ok: problems.length === 0, problems };
}
