import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import { jidToDisplayLabel } from "@shared/domain/wa-jid";

export interface ConversationListItem {
  id: string;
  clientId: string | null;
  clientName: string;
  /** Etiqueta corta: teléfono con `+` o "Sin número público (LID)". */
  clientLabel: string;
  status: "OPEN" | "PENDING_REVIEW" | "CLOSED" | "ARCHIVED";
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastMessageDirection: "INBOUND" | "OUTBOUND" | null;
  unreadCount: number;
}

export class ListConversationsUseCase
  implements UseCase<{ status?: string }, ConversationListItem[]>
{
  async execute(input: { status?: string }): Promise<ConversationListItem[]> {
    authorize("chats.read");
    const { tenantId } = TenantContext.require();

    const status = input.status as "OPEN" | "PENDING_REVIEW" | "CLOSED" | "ARCHIVED" | undefined;

    const rows = await prisma.conversation.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: {
        client: true,
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
    });

    return rows.map((c) => {
      const last = c.messages[0];
      const label = jidToDisplayLabel(c.waChatId);
      return {
        id: c.id,
        clientId: c.clientId,
        clientName: c.client?.name ?? label,
        clientLabel: label,
        status: c.status,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        lastMessagePreview: last?.content.slice(0, 80) ?? "",
        lastMessageDirection: last?.direction ?? null,
        unreadCount: c.unreadCount,
      };
    });
  }
}
