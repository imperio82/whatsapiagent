import { USAGE_LIMITS, type Plan } from "./plans";

/**
 * Qué hace el agente con un mensaje según el cupo del negocio (docs/Límites de uso, alertas y recarga):
 * - IA: responde normal.
 * - GRACIA: el negocio llegó al tope, pero el chat estaba abierto y siguen las 48 horas de gracia.
 * - ESPERA: el cliente recibe un mensaje fijo, sin IA, y pasa al equipo.
 */
export type ResponseMode = "IA" | "GRACIA" | "ESPERA";

/** Dónde está el negocio frente a su cupo, para los avisos y el panel */
export type LimitLevel = "NORMAL" | "AVISO_70" | "AVISO_90" | "TOPE";

export interface LimitsSnapshot {
  plan: Plan;
  /** Contactos distintos que recibieron al menos una respuesta de IA en el mes */
  clientsServed: number;
  spentMicroUsd: number;
  /** Tope de IA del plan más los créditos que se le sumaron */
  budgetMicroUsd: number;
}

export interface ContactSnapshot {
  /** El contacto ya recibió respuesta de IA este mes: no suma otro cliente al cupo */
  alreadyServed: boolean;
  /** Respuestas de IA que lleva el contacto en el mes */
  replies: number;
  /** El agente le respondió en las últimas 24 horas */
  open: boolean;
}

export interface ResponseDecision {
  mode: ResponseMode;
  reason: string;
}

/** La proporción más alta entre clientes del cupo y gasto del tope: lo que se acabe primero manda. */
export function usageShare(s: LimitsSnapshot): number {
  const clients = s.plan.chats > 0 ? s.clientsServed / s.plan.chats : 0;
  const budget = s.budgetMicroUsd > 0 ? s.spentMicroUsd / s.budgetMicroUsd : 0;
  return Math.max(clients, budget);
}

export function limitLevel(s: LimitsSnapshot): LimitLevel {
  const share = usageShare(s);
  const [warn70, warn90] = USAGE_LIMITS.warnAt;
  if (share >= 1) return "TOPE";
  if (share >= warn90) return "AVISO_90";
  if (share >= warn70) return "AVISO_70";
  return "NORMAL";
}

/** El negocio ya no puede sumar clientes nuevos (cupo lleno) o ya gastó el tope de IA. */
export function capReached(s: LimitsSnapshot): boolean {
  return s.clientsServed >= s.plan.chats || s.spentMicroUsd >= s.budgetMicroUsd;
}

/**
 * puedeResponder(negocio, contacto) del documento. `capReachedAt` es cuándo el negocio llegó al tope este
 * mes (inicio de la gracia); null si no ha llegado.
 */
export function decideResponse(
  s: LimitsSnapshot,
  contact: ContactSnapshot,
  capReachedAt: Date | null,
  now = new Date(),
): ResponseDecision {
  if (contact.replies >= USAGE_LIMITS.maxRepliesPerContact) {
    return { mode: "ESPERA", reason: `el contacto ya tiene ${contact.replies} respuestas de IA este mes` };
  }

  const budgetDone = s.spentMicroUsd >= s.budgetMicroUsd;
  // Con el cupo lleno, un contacto que ya se atendió este mes no suma: solo frena a los nuevos
  const clientsDone = s.clientsServed >= s.plan.chats && !contact.alreadyServed;
  if (!budgetDone && !clientsDone) return { mode: "IA", reason: "dentro del cupo" };

  const why = budgetDone ? "gastó el tope de IA del mes" : "llenó el cupo de clientes del mes";
  const since = capReachedAt ?? now;
  const inGrace = now.getTime() - since.getTime() < USAGE_LIMITS.graceHours * 3_600_000;
  if (inGrace && contact.alreadyServed && contact.open) {
    return { mode: "GRACIA", reason: `${why}; chat abierto dentro de las ${USAGE_LIMITS.graceHours} h de gracia` };
  }
  return { mode: "ESPERA", reason: why };
}

/** Mensaje fijo, sin IA, para el cliente que llega cuando el negocio está en el tope. No menciona cupos ni pagos. */
export function waitMessage(businessName: string): string {
  return `¡Hola! Gracias por escribir a ${businessName}. Un asesor te responde en breve por aquí.`;
}
