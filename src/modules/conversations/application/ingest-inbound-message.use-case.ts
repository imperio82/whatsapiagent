import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { InboundMessage } from "@modules/whatsapp/domain/ports/whatsapp-provider";

/**
 * Caso de uso de bootstrap: cuando llega un mensaje desde el provider de
 * WhatsApp, garantizamos la existencia del Client y Conversation, y
 * persistimos el Message. Devuelve el id de conversación para que el
 * siguiente paso (IA) pueda responder.
 *
 * El campo `from` viene como JID completo (ej: `5021234567@s.whatsapp.net`
 * o `48404818309348@lid`). Lo guardamos tal cual en `waChatId` para usarlo
 * al enviar respuestas. En `Client.phone` usamos un identificador derivado:
 * - Para s.whatsapp.net: solo dígitos (es un teléfono real).
 * - Para LID: prefijo "lid:" + dígitos (no es un teléfono visible).
 */
export interface IngestResult {
  conversationId: string;
  /** true si recién creamos la conversación en este insert. */
  isNew: boolean;
  /**
   * true si recién persistimos el mensaje. false significa que ya lo
   * habíamos procesado antes (Baileys entrega el mismo mensaje dos veces
   * durante reconexiones / restoreAllSessions). El consumidor debe usar
   * esto para no disparar la IA dos veces sobre el mismo mensaje.
   */
  isMessageNew: boolean;
}

export class IngestInboundMessageUseCase
  implements UseCase<InboundMessage, IngestResult>
{
  async execute(input: InboundMessage): Promise<IngestResult> {
    const { tenantId, from, contactName } = input;

    // Guard de idempotencia: si este providerMessageId ya está persistido,
    // salimos sin tocar nada. Evita el P2002 + duplicación de respuesta IA.
    const existingMsg = await prisma.message.findUnique({
      where: { waMessageId: input.providerMessageId },
      select: { id: true, conversationId: true },
    });
    if (existingMsg) {
      return {
        conversationId: existingMsg.conversationId,
        isNew: false,
        isMessageNew: false,
      };
    }

    const isLid = from.endsWith("@lid");
    const localPart = from.split("@")[0] ?? from;
    const clientPhone = isLid ? `lid:${localPart}` : localPart.replace(/\D/g, "");
    const displayHint = isLid
      ? `Cliente ${localPart.slice(-4)}`
      : `Cliente +${localPart.slice(-4)}`;

    const messageType =
      input.type === "text"
        ? "TEXT"
        : input.type === "image"
          ? "IMAGE"
          : input.type === "audio"
            ? "AUDIO"
            : input.type === "video"
              ? "VIDEO"
              : "DOCUMENT";

    return prisma.$transaction(async (tx) => {
      let client = await tx.client.findUnique({
        where: { tenantId_phone: { tenantId, phone: clientPhone } },
      });
      if (!client) {
        client = await tx.client.create({
          data: {
            tenantId,
            phone: clientPhone,
            name: contactName?.trim() || displayHint,
            source: "whatsapp",
          },
        });
      } else if (contactName && client.name.startsWith("Cliente ")) {
        // Si antes guardamos un placeholder y ahora WhatsApp nos da el pushName, lo aprovechamos.
        client = await tx.client.update({
          where: { id: client.id },
          data: { name: contactName.trim() },
        });
      }

      const existing = await tx.conversation.findUnique({
        where: { tenantId_waChatId: { tenantId, waChatId: from } },
      });

      // Si la conversación no existe, la creamos sin lastMessageAt /
      // unreadCount aún — esos los seteamos solo si el insert del mensaje
      // realmente persiste (idempotencia con createMany skipDuplicates).
      const conversation =
        existing ??
        (await tx.conversation.create({
          data: {
            tenantId,
            clientId: client.id,
            waChatId: from,
            status: "OPEN",
            lastMessageAt: null,
            unreadCount: 0,
          },
        }));

      // Insert idempotente: si dos handlers concurrentes intentan ingerir el
      // mismo waMessageId, solo uno gana — el otro recibe count: 0 sin tirar
      // P2002. Esto pasa porque Baileys reentregra mensajes durante
      // reconexiones / restoreAllSessions.
      const inserted = await tx.message.createMany({
        data: {
          conversationId: conversation.id,
          waMessageId: input.providerMessageId,
          direction: "INBOUND",
          type: messageType,
          content: input.text ?? "",
          mediaUrl: input.mediaUrl ?? null,
          authoredBy: "CLIENT",
          sentAt: input.timestamp,
        },
        skipDuplicates: true,
      });

      if (inserted.count === 0) {
        // Otro handler ya persistió este mensaje. No tocamos nada más.
        return {
          conversationId: conversation.id,
          isNew: false,
          isMessageNew: false,
        };
      }

      // Solo si realmente insertamos: actualizamos lastMessageAt y
      // unreadCount. Si la conversación es nueva, también promovemos el
      // status si estaba cerrada.
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          clientId: client.id,
          status: conversation.status === "CLOSED" ? "OPEN" : conversation.status,
          lastMessageAt: input.timestamp,
          unreadCount: { increment: 1 },
        },
      });

      return {
        conversationId: conversation.id,
        isNew: !existing,
        isMessageNew: true,
      };
    });
  }
}
