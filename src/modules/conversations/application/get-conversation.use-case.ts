import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import { isLidJid, jidToDisplayLabel, jidToDisplayPhone } from "@shared/domain/wa-jid";

export interface ConversationDetail {
  id: string;
  status: "OPEN" | "PENDING_REVIEW" | "CLOSED" | "ARCHIVED";
  unreadCount: number;
  client: {
    id: string | null;
    name: string;
    /** Teléfono visible (`+5021234567`) o null si es LID. */
    phone: string | null;
    /** Etiqueta corta amigable. */
    label: string;
    isLid: boolean;
    email: string | null;
    notes: string | null;
    createdAt: string | null;
  };
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    authoredBy: "CLIENT" | "AGENT" | "AI" | "SYSTEM";
    type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | "TEMPLATE";
    content: string;
    mediaUrl: string | null;
    sentAt: string;
  }>;
}

export class GetConversationUseCase implements UseCase<{ id: string; markRead?: boolean }, ConversationDetail> {
  async execute(input: { id: string; markRead?: boolean }): Promise<ConversationDetail> {
    authorize("chats.read");
    const { tenantId } = TenantContext.require();

    const conv = await prisma.conversation.findFirst({
      where: { id: input.id, tenantId },
      include: {
        client: true,
        messages: { orderBy: { sentAt: "asc" }, take: 200 },
      },
    });
    if (!conv) throw new NotFoundError("Conversación no encontrada");

    if (input.markRead && conv.unreadCount > 0) {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { unreadCount: 0 },
      });
    }

    const label = jidToDisplayLabel(conv.waChatId);
    return {
      id: conv.id,
      status: conv.status,
      unreadCount: input.markRead ? 0 : conv.unreadCount,
      client: {
        id: conv.client?.id ?? null,
        name: conv.client?.name ?? label,
        phone: jidToDisplayPhone(conv.waChatId),
        label,
        isLid: isLidJid(conv.waChatId),
        email: conv.client?.email ?? null,
        notes: conv.client?.notes ?? null,
        createdAt: conv.client?.createdAt.toISOString() ?? null,
      },
      messages: conv.messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        authoredBy: m.authoredBy,
        type: m.type,
        content: m.content,
        mediaUrl: m.mediaUrl,
        sentAt: m.sentAt.toISOString(),
      })),
    };
  }
}
