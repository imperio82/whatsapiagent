import { prisma } from "@shared/infrastructure/prisma/client";
import { BusinessRuleError } from "@shared/domain/errors";
import { isSimulatedJid } from "@shared/domain/wa-jid";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import { windowClosedReason, windowState, type WindowState } from "../domain/messaging-window";

/**
 * Mensaje que el negocio inicia (felicitación, aviso): se envía por WhatsApp y queda en la
 * conversación del cliente, para que el asesor y la IA lo vean si el cliente responde.
 *
 * Con la API oficial (Meta, Twilio), fuera de la ventana de 24 horas desde el último mensaje del
 * cliente solo se aceptan plantillas aprobadas: antes de enviar se revisa la ventana y, si está
 * cerrada, no se intenta (se explica por qué o el aviso queda pendiente hasta que el cliente escriba).
 */

/** La ventana de 24 horas está cerrada y no hay plantilla con qué escribirle. */
export class WindowClosedError extends BusinessRuleError {
  constructor(readonly lastInboundAt: Date | null) {
    super(windowClosedReason(lastInboundAt));
  }
}

async function lastConversation(tenantId: string, clientId: string) {
  return prisma.conversation.findFirst({
    where: { tenantId, clientId },
    orderBy: { lastMessageAt: "desc" },
  });
}

/** Si hoy se le puede escribir texto libre al cliente. */
export async function clientWindow(whatsapp: WhatsAppProvider, tenantId: string, clientId: string): Promise<WindowState> {
  const conversation = await lastConversation(tenantId, clientId);
  if (conversation && isSimulatedJid(conversation.waChatId)) return { open: true, lastInboundAt: null };
  const last = await prisma.message.findFirst({
    where: { direction: "INBOUND", conversation: { tenantId, clientId } },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  return windowState(whatsapp.kind, last?.sentAt ?? null);
}

/** Envía sin revisar la ventana (quien llama ya la revisó) y deja el mensaje en la conversación. */
async function sendNow(
  whatsapp: WhatsAppProvider,
  tenantId: string,
  client: { id: string; phone: string },
  text: string,
  userId: string | null,
): Promise<{ sentAt: Date }> {
  const conversation = await lastConversation(tenantId, client.id);
  const sent = await whatsapp.sendText(tenantId, { to: conversation?.waChatId ?? client.phone, text });
  if (conversation) {
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          waMessageId: sent.providerMessageId,
          direction: "OUTBOUND",
          type: "TEXT",
          content: text,
          authoredBy: userId ? "AGENT" : "SYSTEM",
          agentUserId: userId,
          sentAt: sent.sentAt,
        },
      }),
      prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: sent.sentAt } }),
    ]);
  }
  return { sentAt: sent.sentAt };
}

/** Envía ya; si la ventana de 24 horas está cerrada lanza WindowClosedError sin intentar. */
export async function sendProactiveMessage(
  whatsapp: WhatsAppProvider,
  tenantId: string,
  client: { id: string; phone: string },
  text: string,
  userId: string | null,
): Promise<{ sentAt: Date }> {
  const window = await clientWindow(whatsapp, tenantId, client.id);
  if (!window.open) throw new WindowClosedError(window.lastInboundAt);
  return sendNow(whatsapp, tenantId, client, text, userId);
}

export type DeliveryResult = { status: "sent"; sentAt: Date } | { status: "queued"; reason: string };

/** Avisos que se guardan como pendientes: una semana, salvo que el que llama diga hasta cuándo sirven. */
const DEFAULT_PENDING_DAYS = 7;

/**
 * Envía ya si la ventana está abierta; si no, lo deja pendiente y sale apenas el cliente vuelva a
 * escribir (ver flushPendingNotices), siempre que no haya vencido.
 */
export async function deliverOrQueue(
  whatsapp: WhatsAppProvider,
  tenantId: string,
  client: { id: string; phone: string },
  text: string,
  opts: { userId: string | null; source: string; expiresAt?: Date },
): Promise<DeliveryResult> {
  const window = await clientWindow(whatsapp, tenantId, client.id);
  if (window.open) return { status: "sent", ...(await sendNow(whatsapp, tenantId, client, text, opts.userId)) };
  await prisma.pendingNotice.create({
    data: {
      tenantId,
      clientId: client.id,
      text,
      source: opts.source,
      createdBy: opts.userId,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + DEFAULT_PENDING_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return { status: "queued", reason: windowClosedReason(window.lastInboundAt) };
}

/**
 * El cliente acaba de escribir: se abre la ventana y salen sus avisos pendientes, en orden. Los vencidos
 * se marcan y no se envían.
 */
export async function flushPendingNotices(whatsapp: WhatsAppProvider, tenantId: string, conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { client: { select: { id: true, phone: true } } },
  });
  const client = conversation?.client;
  if (!client) return;
  const pending = await prisma.pendingNotice.findMany({
    where: { tenantId, clientId: client.id, sentAt: null, error: null },
    orderBy: { createdAt: "asc" },
  });
  const now = new Date();
  for (const notice of pending) {
    if (notice.expiresAt < now) {
      await prisma.pendingNotice.update({ where: { id: notice.id }, data: { error: "Venció antes de que el cliente escribiera" } });
      continue;
    }
    // Se reserva antes de enviar para que dos mensajes seguidos del cliente no lo envíen dos veces
    const claim = await prisma.pendingNotice.updateMany({ where: { id: notice.id, sentAt: null }, data: { sentAt: now } });
    if (claim.count === 0) continue;
    try {
      const { sentAt } = await sendNow(whatsapp, tenantId, client, notice.text, notice.createdBy);
      await prisma.pendingNotice.update({ where: { id: notice.id }, data: { sentAt } });
    } catch (err) {
      const error = err instanceof Error ? err.message : "No se pudo enviar";
      await prisma.pendingNotice.update({ where: { id: notice.id }, data: { sentAt: null, error } });
      console.warn("[avisos pendientes] no se pudo enviar:", error);
    }
  }
}
