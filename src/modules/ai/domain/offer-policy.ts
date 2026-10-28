/**
 * Qué pasa con una oferta del comprador según el estado del bien y la política del negocio
 * (Mi agente → Permisos del agente). La herramienta register_offer aplica la decisión y le devuelve
 * al agente solo los hechos; qué decirle al cliente lo definen las habilidades del negocio.
 *
 * Lo único fijo: nunca se registra un monto mayor al precio publicado (ofrecer más es aceptar ese precio).
 */

export interface OfferPolicy {
  /** Oferta sobre un bien reservado: no se registra, o queda en lista de espera por si se libera */
  onReserved: "reject" | "waitlist";
  /** Oferta igual o mayor al precio publicado: el agente sigue con el cierre, o pasa a un asesor */
  atOrAbovePrice: "close" | "advisor";
}

export const DEFAULT_OFFER_POLICY: OfferPolicy = { onReserved: "reject", atOrAbovePrice: "close" };

export const OFFER_POLICY_LABELS = {
  onReserved: {
    reject: "No se registra; el agente ofrece avisarle si se libera",
    waitlist: "Queda en lista de espera y se avisa al asesor",
  },
  atOrAbovePrice: {
    close: "Se registra al precio publicado y el agente sigue con el cierre",
    advisor: "Se registra al precio publicado y pasa a un asesor",
  },
} as const;

export function offerPolicyFrom(raw: unknown): OfferPolicy {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    onReserved: stored.onReserved === "waitlist" ? "waitlist" : DEFAULT_OFFER_POLICY.onReserved,
    atOrAbovePrice: stored.atOrAbovePrice === "advisor" ? "advisor" : DEFAULT_OFFER_POLICY.atOrAbovePrice,
  };
}

export type OfferDecision =
  | { record: false; reason: "vendido" | "reservado" }
  | {
      record: true;
      /** Lo que se guarda: lo ofrecido, o el precio publicado si ofreció eso o más */
      amount: number;
      acceptsPrice: boolean;
      waitlist: boolean;
      /** Pasa la conversación a un asesor (y la IA se pausa) */
      handoff: boolean;
    };

export function decideOffer(
  listing: { status: string; priceCop: number },
  offered: number,
  policy: OfferPolicy,
): OfferDecision {
  if (listing.status === "SOLD") return { record: false, reason: "vendido" };
  const acceptsPrice = listing.priceCop > 0 && offered >= listing.priceCop;
  const amount = acceptsPrice ? listing.priceCop : offered;
  if (listing.status === "RESERVED") {
    return policy.onReserved === "waitlist"
      ? { record: true, amount, acceptsPrice, waitlist: true, handoff: false }
      : { record: false, reason: "reservado" };
  }
  if (acceptsPrice) return { record: true, amount, acceptsPrice, waitlist: false, handoff: policy.atOrAbovePrice === "advisor" };
  return { record: true, amount, acceptsPrice: false, waitlist: false, handoff: true };
}
