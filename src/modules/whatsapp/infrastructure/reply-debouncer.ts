/**
 * Espera antes de responder: agrupa los mensajes seguidos de una conversación ("hola",
 * "tienen jeans?", "talla 32") para que la IA conteste una sola vez con todo el contexto.
 * Cada mensaje nuevo reinicia la espera. Nunca corren dos respuestas a la vez en la misma
 * conversación: si llegan mensajes mientras la IA responde, se contestan al terminar.
 *
 * Cada negocio elige su espera (Tenant.aiReplyDelaySec); si no la eligió, se usa
 * AI_REPLY_DELAY_MS (por defecto 6 s; "0" responde de inmediato).
 */

import { prisma } from "@shared/infrastructure/prisma/client";

export interface DebouncedRun {
  tenantId: string;
  conversationId: string;
  /** Si llegaron mensajes mientras se respondía, cuándo empezó esa respuesta. */
  lateSince?: Date;
}

const DEFAULT_DELAY_MS = 6000;
export const MAX_REPLY_DELAY_SEC = 120;

export function replyDelayMs(): number {
  const value = Number(process.env.AI_REPLY_DELAY_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DELAY_MS;
}

/** Espera del negocio, o la del servidor si no configuró una. */
export async function tenantReplyDelayMs(tenantId: string): Promise<number> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { aiReplyDelaySec: true } });
  const sec = tenant?.aiReplyDelaySec;
  return sec == null ? replyDelayMs() : Math.min(Math.max(sec, 0), MAX_REPLY_DELAY_SEC) * 1000;
}

export function createReplyDebouncer(run: (input: DebouncedRun) => Promise<void>, delayMs = replyDelayMs()) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const lateSince = new Map<string, Date>();
  const running = new Map<string, { startedAt: Date; late: boolean }>();
  const delays = new Map<string, number>();

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
          schedule(tenantId, conversationId, delays.get(conversationId));
        } else {
          delays.delete(conversationId);
        }
      });
  }

  function schedule(tenantId: string, conversationId: string, delay = delayMs): void {
    delays.set(conversationId, delay);
    const current = running.get(conversationId);
    if (current) {
      current.late = true;
      return;
    }
    clearTimeout(timers.get(conversationId));
    timers.set(
      conversationId,
      setTimeout(() => fire(tenantId, conversationId), delay),
    );
  }

  return { schedule };
}
