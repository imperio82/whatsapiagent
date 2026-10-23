/**
 * Espera antes de responder: agrupa los mensajes seguidos de una conversación ("hola",
 * "tienen jeans?", "talla 32") para que la IA conteste una sola vez con todo el contexto.
 * Cada mensaje nuevo reinicia la espera. Nunca corren dos respuestas a la vez en la misma
 * conversación: si llegan mensajes mientras la IA responde, se contestan al terminar.
 *
 * Espera configurable con AI_REPLY_DELAY_MS (por defecto 6 s; "0" responde de inmediato).
 */

export interface DebouncedRun {
  tenantId: string;
  conversationId: string;
  /** Si llegaron mensajes mientras se respondía, cuándo empezó esa respuesta. */
  lateSince?: Date;
}

const DEFAULT_DELAY_MS = 6000;

function replyDelayMs(): number {
  const value = Number(process.env.AI_REPLY_DELAY_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DELAY_MS;
}

export function createReplyDebouncer(run: (input: DebouncedRun) => Promise<void>, delayMs = replyDelayMs()) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const lateSince = new Map<string, Date>();
  const running = new Map<string, { startedAt: Date; late: boolean }>();

  function fire(tenantId: string, conversationId: string): void {
    timers.delete(conversationId);
    const since = lateSince.get(conversationId);
    lateSince.delete(conversationId);
    const state = { startedAt: new Date(), late: false };
    running.set(conversationId, state);
    run({ tenantId, conversationId, lateSince: since })
      .catch((err) => console.error("[ai respond] error:", err))
      .finally(() => {
        running.delete(conversationId);
        if (state.late) {
          lateSince.set(conversationId, state.startedAt);
          schedule(tenantId, conversationId);
        }
      });
  }

  function schedule(tenantId: string, conversationId: string): void {
    const current = running.get(conversationId);
    if (current) {
      current.late = true;
      return;
    }
    clearTimeout(timers.get(conversationId));
    timers.set(
      conversationId,
      setTimeout(() => fire(tenantId, conversationId), delayMs),
    );
  }

  return { schedule };
}
