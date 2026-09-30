import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError, ValidationError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";

export interface SendMessageInput {
  conversationId: string;
  text: string;
}

export interface SendMessageOutput {
  messageId: string;
  sentAt: string;
}

export class SendMessageUseCase implements UseCase<SendMessageInput, SendMessageOutput> {
  constructor(private readonly provider: WhatsAppProvider) {}

  async execute(input: SendMessageInput): Promise<SendMessageOutput> {
    authorize("chats.send");
    const { tenantId, userId } = TenantContext.require();

    if (!input.text.trim()) throw new ValidationError("Mensaje vacío");
    if (input.text.length > 4096) throw new ValidationError("Mensaje demasiado largo");

    const conv = await prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId },
    });
    if (!conv) throw new NotFoundError("Conversación no encontrada");

    // 1. Enviar primero — si falla, NO persistimos (evita mensajes fantasma)
    const result = await this.provider.sendText(tenantId, {
      to: conv.waChatId,
      text: input.text,
    });

    // 2. Persistir el mensaje. Si esto falla por una razón rara (ej.
    // duplicate key), igualmente el mensaje YA se envió por WhatsApp,
    // así que devolvemos OK con un id virtual y logueamos.
    let savedId: string;
    try {
      const saved = await prisma.message.create({
        data: {
          conversationId: conv.id,
          waMessageId: result.providerMessageId,
          direction: "OUTBOUND",
          type: "TEXT",
          content: input.text,
          authoredBy: "AGENT",
          agentUserId: userId,
          sentAt: result.sentAt,
        },
      });
      savedId = saved.id;
    } catch (err) {
      console.error("[SendMessageUseCase] sendText OK pero persist falló:", err);
      // No throw — el mensaje ya fue enviado por WhatsApp
      savedId = `unsaved-${result.providerMessageId}`;
    }

    try {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { lastMessageAt: result.sentAt, unreadCount: 0 },
      });
    } catch (err) {
      console.error("[SendMessageUseCase] update conversation falló:", err);
      // tampoco throw
    }

    return { messageId: savedId, sentAt: result.sentAt.toISOString() };
  }
}
