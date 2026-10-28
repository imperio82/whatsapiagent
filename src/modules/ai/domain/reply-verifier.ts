/**
 * Verificador determinista (sin IA) de la respuesta antes de enviarla al cliente:
 * cada precio y cada código de pedido que aparezca en el texto debe venir de una
 * herramienta, de la información del negocio o de lo que dijo el cliente, y ningún
 * teléfono puede salir si no es del negocio o del propio cliente (así no se filtra el
 * número de un propietario). Es la red de seguridad contra datos inventados por el modelo.
 */

export interface VerificationEvidence {
  /** Resultados crudos (JSON) de las herramientas que se ejecutaron en este turno. */
  toolOutputs: string[];
  /** Texto con la información del negocio (puede traer costos de envío, por ejemplo). */
  businessContext: string;
  /** Lo que escribió el cliente: puede repetirle su presupuesto, su oferta o su número. */
  clientText?: string;
  /** Respuestas anteriores del agente (ya verificadas): puede repetir lo que dijo de un bien. */
  previousReplies?: string;
}

export interface VerificationResult {
  ok: boolean;
  problems: string[];
}

/** Máximo de unidades para aceptar un subtotal como precio × cantidad. */
const MAX_UNITS = 1000;

const MULTIPLIERS: Record<string, number> = {
  mil: 1_000,
  m: 1_000_000,
  mill: 1_000_000,
  millon: 1_000_000,
  millones: 1_000_000,
  palos: 1_000_000,
};

function applyMultiplier(value: number, word: string | undefined): number {
  if (!word) return value;
  const key = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return Math.round(value * (MULTIPLIERS[key] ?? 1));
}

/** "$4.500", "$ 4,500", "$12.000,50", "$98 millones", "$98,5 millones", "$30M" → 4500, 4500, 12000.5, 98000000… */
export function extractPrices(text: string): number[] {
  const out: number[] = [];
  const re = /\$\s?(\d{1,3}(?:[.,]\d{3})+|\d+)(?:,(\d{1,2}))?(?:\s?(millones|millón|millon|mill|mil|m|palos)(?![a-zñ]))?/gi;
  for (const m of text.matchAll(re)) {
    const integer = Number((m[1] ?? "").replace(/[.,]/g, ""));
    out.push(applyMultiplier(m[2] ? integer + Number(`0.${m[2]}`) : integer, m[3]));
  }
  return out;
}

/** Montos que escribe la gente sin signo: "30 millones", "1.200 millones", "98,5 palos", más los que traen "$". */
export function extractSpokenAmounts(text: string): number[] {
  const out = extractPrices(text);
  const re = /(?<![\d$.,])(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?\s?(millones|millón|millon|mill|mil|m|palos)(?![a-zñ])/gi;
  for (const m of text.matchAll(re)) {
    const integer = Number((m[1] ?? "").replace(/\./g, ""));
    out.push(applyMultiplier(m[2] ? integer + Number(`0.${m[2]}`) : integer, m[3]));
  }
  // Cifras completas sin signo ("tengo 30.000.000 de inicial")
  for (const m of text.matchAll(/(?<![\d$.,])\d{1,3}(?:\.\d{3}){2,}(?!\d)/g)) {
    out.push(Number(m[0].replace(/\./g, "")));
  }
  return out;
}

/**
 * Teléfonos en un texto: 10 a 12 dígitos, con espacios o guiones (no puntos, para no confundir
 * "$98.000.000" o "48.000 km"). Devuelve los últimos 10 dígitos para comparar sin indicativo.
 */
export function extractPhones(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\d$]|\d[.,])\+?\d[\d \-()]{8,16}\d(?!\d|[.,]\d)/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 12) out.push(digits.slice(-10));
  }
  return out;
}

export function extractOrderCodes(text: string): string[] {
  return [...text.matchAll(/\b(?:PED|ORD)-\d{3,}\b/g)].map((m) => m[0]);
}

/** Valores numéricos de las claves de precio, total, pago o monto (priceMajor, totalMajor, monthlyPayment…) de un JSON. */
function collectPrices(value: unknown, into: Set<number>, key = ""): void {
  if (typeof value === "number") {
    if (/price|total|payment|amount/i.test(key) && value > 0) into.add(value);
  } else if (typeof value === "string") {
    // Celdas de las tablas de información: "$2.100.000", "1,2 millones", "2.100.000" o "2100000"
    for (const amount of extractSpokenAmounts(value)) into.add(amount);
    const bare = value.trim().match(/^\d{1,3}(?:[.,]\d{3})+$|^\d{4,}$/);
    if (bare) into.add(Number(bare[0].replace(/[.,]/g, "")));
  } else if (Array.isArray(value)) {
    for (const v of value) collectPrices(v, into, key);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectPrices(v, into, k);
  }
}

/** Precios que el modelo puede citar: los de las herramientas, los de la información del negocio y los que dijo el cliente. */
export function evidencePrices(evidence: VerificationEvidence): number[] {
  const prices = new Set<number>([
    ...extractPrices(evidence.businessContext),
    ...extractSpokenAmounts(evidence.clientText ?? ""),
  ]);
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

const NUMBER_WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };
const plain = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Habitaciones, baños o área: cómo se llama cada una al escribirla. */
function featureOf(word: string): "habitaciones" | "banos" | "m2" | null {
  if (/^(habitacion|alcoba|cuarto|dormitorio)/.test(word)) return "habitaciones";
  if (/^bano/.test(word)) return "banos";
  if (/^(m2|m²|mts|metros)/.test(word)) return "m2";
  return null;
}

/**
 * Características numéricas de un inmueble que aparecen en un texto, como "habitaciones:3": "3 habitaciones",
 * "tres alcobas", "2 baños", "72 m²", y también al revés, como en las fichas ("Habitaciones: 3", "Área: 72 m²").
 */
export function extractFeatureClaims(text: string): string[] {
  const t = plain(text);
  const out = new Set<string>();
  const value = (v: string) => NUMBER_WORDS[v] ?? Number(v.replace(",", "."));
  // "3 habitaciones", "tres alcobas", "2 baños", "72 m²"
  const forward =
    /(?<![\w.,])(\d+(?:[.,]\d+)?|un|una|uno|dos|tres|cuatro|cinco|seis)\s*(habitacion(?:es)?|alcobas?|cuartos?|dormitorios?|banos?|m2|m²|mts2?|metros cuadrados)/g;
  for (const m of t.matchAll(forward)) {
    const feature = featureOf(m[2]!);
    if (feature) out.add(`${feature}:${value(m[1]!)}`);
  }
  // Como en las fichas: "Habitaciones: 3", "Área: 72 m²"
  for (const m of t.matchAll(/(habitaciones|alcobas|cuartos|dormitorios|banos|area)\W{1,4}(\d+(?:[.,]\d+)?)/g)) {
    const feature = m[1] === "area" ? "m2" : featureOf(m[1]!);
    if (feature) out.add(`${feature}:${value(m[2]!)}`);
  }
  return [...out];
}

/** Afirma que el inmueble acepta mascotas ("acepta mascotas", "se admiten mascotas"), no que lo va a confirmar. */
function claimsPetsAllowed(text: string): boolean {
  return /(?<!no |no se |si |si se )\b(acepta|aceptan|admite|admiten|permite|permiten)\s+mascotas/.test(plain(text));
}

/**
 * Lo que el agente dice de un inmueble (habitaciones, baños, área, mascotas) debe estar en una ficha que trajo una
 * herramienta, en lo que ya dijo antes o en lo que dijo el cliente. Así no inventa "3 habitaciones" si la ficha no
 * lo dice.
 */
export function verifyFeatureClaims(reply: string, evidence: VerificationEvidence): string[] {
  const sources = [...evidence.toolOutputs, evidence.clientText ?? "", evidence.previousReplies ?? "", evidence.businessContext];
  const known = new Set(sources.flatMap(extractFeatureClaims));
  const problems: string[] = [];
  for (const claim of extractFeatureClaims(reply)) {
    if (!known.has(claim)) {
      const [feature, n] = claim.split(":");
      const label = feature === "m2" ? `${n} m²` : `${n} ${feature === "banos" ? "baños" : "habitaciones"}`;
      problems.push(`Dices "${label}", pero eso no está en la ficha del bien. Di solo lo que trae la ficha; si falta el dato, di que un asesor lo confirma.`);
    }
  }
  if (claimsPetsAllowed(reply) && !sources.some((s) => /mascota/i.test(s))) {
    problems.push("Dices que acepta mascotas, pero la ficha no lo dice. Di que un asesor lo confirma.");
  }
  return problems;
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

  // Teléfonos: solo los del negocio o los que dio el propio cliente (nunca el de un propietario)
  const knownPhones = new Set([...extractPhones(evidence.businessContext), ...extractPhones(evidence.clientText ?? "")]);
  for (const phone of extractPhones(reply)) {
    if (!knownPhones.has(phone)) {
      problems.push(`La respuesta incluye el teléfono ${phone}, que no es del negocio ni del cliente. No compartas teléfonos de terceros.`);
    }
  }

  problems.push(...verifyFeatureClaims(reply, evidence));

  return { ok: problems.length === 0, problems };
}
