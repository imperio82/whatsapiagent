/**
 * Cruce entre un bien del inventario y lo que busca un comprador. Función pura (sin base de
 * datos) para poder probarla: decide si coincide, qué tan bien y por qué, en palabras que
 * entiende el asesor.
 *
 * Reglas duras (si se conocen y no cumplen, no hay coincidencia): tipo de bien, venta o
 * arriendo, presupuesto (con 10 % de margen) y ciudad. Después suman puntos las palabras de lo
 * que busca ("camioneta", "3 alcobas", "Palermo") que aparecen en el bien.
 */
import { normalize, queryTokens } from "@modules/ai/domain/product-search";

export type Kind = "VEHICLE" | "PROPERTY" | "OTHER";
export type Operation = "SALE" | "RENT";

export interface MatchListing {
  kind: Kind;
  operation: Operation;
  title: string;
  description: string | null;
  priceCop: number;
  city: string;
  zone: string | null;
  attributes: Record<string, string>;
}

export interface MatchBuyer {
  searchKind: Kind | null;
  searchOperation: Operation | null;
  budgetMaxCop: number | null;
  searchCity: string | null;
  /** Lo que dijo que busca, en sus palabras ("camioneta para la familia"). */
  wants: string | null;
}

export interface MatchResult {
  score: number;
  reasons: string[];
}

/** Margen sobre el presupuesto: a quien tiene $100 M se le ofrece algo de hasta $110 M. */
export const BUDGET_MARGIN = 1.1;
/** Puntaje mínimo para proponer el mensaje. */
export const MIN_SCORE = 3;

const KIND_WORD: Record<Kind, string> = { VEHICLE: "vehículo", PROPERTY: "inmueble", OTHER: "bien" };

// Palabras de "lo que busca" que no dicen nada del bien
const IGNORED = new Set(["busca", "quiere", "comprar", "arrendar", "algo", "bueno", "barato", "familia", "pronto", "ojala", "ojalá"]);

const cop = (v: number) => `$${v.toLocaleString("es-CO")}`;

/**
 * Cómo cruza cada negocio la ciudad: si un tipo de bien la exige, otra ciudad descarta al comprador; si no,
 * solo deja de sumar. Las ciudades cercanas cuentan como la misma (un carro se puede vender en el municipio vecino).
 */
export interface MatchRules {
  sameCity: Record<Kind, boolean>;
  nearbyCities: string[];
}

export const DEFAULT_MATCH_RULES: MatchRules = {
  sameCity: { PROPERTY: true, VEHICLE: false, OTHER: false },
  nearbyCities: [],
};

/** Lo guardado del negocio, con lo que falte en su valor por defecto. */
export function matchRulesFrom(raw: unknown): MatchRules {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const same = r.sameCity && typeof r.sameCity === "object" ? (r.sameCity as Record<string, unknown>) : {};
  const flag = (k: Kind) => (typeof same[k] === "boolean" ? (same[k] as boolean) : DEFAULT_MATCH_RULES.sameCity[k]);
  return {
    sameCity: { PROPERTY: flag("PROPERTY"), VEHICLE: flag("VEHICLE"), OTHER: flag("OTHER") },
    nearbyCities: Array.isArray(r.nearbyCities)
      ? r.nearbyCities.filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim())
      : [],
  };
}

/**
 * Coincide, casi coincide (falló una sola condición y lo demás alcanza) o nada. La casi coincidencia no
 * genera mensaje: se le muestra al asesor para que decida.
 */
export type MatchEvaluation = ({ status: "match" } & MatchResult) | ({ status: "near"; missed: string } & MatchResult) | null;

function sameArea(listing: MatchListing, city: string, nearby: string[]): boolean {
  const wanted = normalize(city);
  const where = normalize(`${listing.city} ${listing.zone ?? ""}`);
  if (where.includes(wanted) || wanted.includes(normalize(listing.city))) return true;
  const area = nearby.map(normalize);
  return area.some((c) => wanted.includes(c)) && area.includes(normalize(listing.city));
}

export function evaluateMatch(listing: MatchListing, buyer: MatchBuyer, rules: MatchRules = DEFAULT_MATCH_RULES): MatchEvaluation {
  const reasons: string[] = [];
  const missed: string[] = [];
  let score = 0;

  if (buyer.searchKind) {
    if (buyer.searchKind !== listing.kind) return null;
    score += 2;
    reasons.push(`busca ${KIND_WORD[listing.kind]}`);
  }
  if (buyer.searchOperation) {
    if (buyer.searchOperation !== listing.operation) missed.push(buyer.searchOperation === "RENT" ? "busca en arriendo" : "busca para comprar");
    else score += 1;
  }
  if (buyer.budgetMaxCop && listing.priceCop > 0) {
    if (listing.priceCop > buyer.budgetMaxCop * BUDGET_MARGIN) missed.push(`su presupuesto es hasta ${cop(buyer.budgetMaxCop)}`);
    else {
      score += 2;
      reasons.push(`presupuesto hasta ${cop(buyer.budgetMaxCop)}`);
    }
  }
  if (buyer.searchCity) {
    if (sameArea(listing, buyer.searchCity, rules.nearbyCities)) {
      score += 2;
      reasons.push(`en ${buyer.searchCity}`);
    } else if (rules.sameCity[listing.kind]) {
      missed.push(`busca en ${buyer.searchCity}`);
    } else {
      reasons.push(`busca en ${buyer.searchCity}, el bien está en ${listing.city}`);
    }
  }

  // Palabras de lo que busca que aparecen en el bien (máximo 3 puntos)
  if (buyer.wants) {
    const haystack = new Set(
      normalize(
        [listing.title, listing.description, listing.zone, listing.city, ...Object.values(listing.attributes)].filter(Boolean).join(" "),
      )
        .split(" ")
        .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)),
    );
    const hits = queryTokens(buyer.wants).filter((t) => t.length > 2 && !IGNORED.has(t) && haystack.has(t));
    if (hits.length > 0) {
      score += Math.min(hits.length, 3);
      reasons.push(`pidió "${buyer.wants}"`);
    }
  }

  // Sin saber al menos el tipo de bien o alguna palabra en común, no se arriesga un mensaje
  if (!buyer.searchKind && !reasons.some((r) => r.startsWith("pidió"))) return null;
  if (score < MIN_SCORE || missed.length > 1) return null;
  return missed.length === 0 ? { status: "match", score, reasons } : { status: "near", score, reasons, missed: missed[0]! };
}

/** Solo las coincidencias completas. */
export function scoreMatch(listing: MatchListing, buyer: MatchBuyer, rules: MatchRules = DEFAULT_MATCH_RULES): MatchResult | null {
  const r = evaluateMatch(listing, buyer, rules);
  return r?.status === "match" ? { score: r.score, reasons: r.reasons } : null;
}

/** Mensaje sugerido para el cliente; el asesor lo puede editar antes de enviarlo. */
export function suggestedMessage(input: {
  clientName: string | null;
  agentName: string;
  businessName: string;
  listing: MatchListing;
  wants: string | null;
}): string {
  const { listing } = input;
  const facts = Object.values(listing.attributes).slice(0, 2).join(", ");
  const where = [listing.zone, listing.city].filter(Boolean).join(", ");
  const price = listing.priceCop > 0 ? ` por ${cop(listing.priceCop)}${listing.operation === "RENT" ? " al mes" : ""}` : "";
  const greeting = input.clientName ? `Hola, ${input.clientName.split(" ")[0]}` : "Hola";
  const because = input.wants ? `Como nos contó que busca ${input.wants.toLowerCase()}, pensé en usted. ` : "";
  return (
    `${greeting}, le escribe ${input.agentName} de ${input.businessName}. ` +
    `Acaba de entrar ${listing.title}${facts ? ` (${facts})` : ""} en ${where}${price}. ` +
    `${because}¿Le envío fotos o le agendo una visita?`
  );
}
