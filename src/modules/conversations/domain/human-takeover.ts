/**
 * Cuando un asesor escribe en la conversación o pulsa "Atender", la toma él: el agente deja de responder
 * este tiempo para no hablar encima. Se puede reactivar antes con "Reactivar IA".
 */
export const HUMAN_TAKEOVER_PAUSE_MS = 2 * 60 * 60 * 1000;

export function humanTakeoverUntil(now = new Date()): Date {
  return new Date(now.getTime() + HUMAN_TAKEOVER_PAUSE_MS);
}
