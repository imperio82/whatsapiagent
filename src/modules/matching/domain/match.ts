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

export function scoreMatch(listing: MatchListing, buyer: MatchBuyer): MatchResult | null {
  const reasons: string[] = [];
  let score = 0;

  if (buyer.searchKind) {
    if (buyer.searchKind !== listing.kind) return null;
    score += 2;
    reasons.push(`busca ${KIND_WORD[listing.kind]}`);
  }
  if (buyer.searchOperation) {
    if (buyer.searchOperation !== listing.operation) return null;
    score += 1;
  }
  if (buyer.budgetMaxCop && listing.priceCop > 0) {
    if (listing.priceCop > buyer.budgetMaxCop * BUDGET_MARGIN) return null;
    score += 2;
    reasons.push(`presupuesto hasta ${cop(buyer.budgetMaxCop)}`);
  }
  if (buyer.searchCity) {
    const wanted = normalize(buyer.searchCity);
    const where = normalize(`${listing.city} ${listing.zone ?? ""}`);
    if (!where.includes(wanted) && !wanted.includes(normalize(listing.city))) return null;
    score += 2;
    reasons.push(`en ${buyer.searchCity}`);
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
  return score >= MIN_SCORE ? { score, reasons } : null;
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
