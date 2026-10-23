import { prisma } from "@shared/infrastructure/prisma/client";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";

/**
 * Mensaje que el negocio inicia (felicitación, aviso): se envía por WhatsApp y queda en la
 * conversación del cliente, para que el asesor y la IA lo vean si el cliente responde.
 *
 * Ojo con Meta Cloud API: fuera de la ventana de 24 horas desde el último mensaje del cliente,
 * Meta solo acepta plantillas aprobadas; el texto libre falla y el error se muestra en el panel.
 */
export async function sendProactiveMessage(
  whatsapp: WhatsAppProvider,
  tenantId: string,
  client: { id: string; phone: string },
  text: string,
  userId: string | null,
): Promise<{ sentAt: Date }> {
  const conversation = await prisma.conversation.findFirst({
    where: { tenantId, clientId: client.id },
    orderBy: { lastMessageAt: "desc" },
  });
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
