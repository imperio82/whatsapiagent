import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";

/**
 * Acciones de la persona que atiende sobre una conversación:
 * - "attend": toma una conversación que el agente de IA pasó a una persona.
 *   Se apaga la alerta, pero la IA sigue en pausa para no interrumpir.
 * - "resume-ai": la IA vuelve a responder en esta conversación.
 * - "archive": la saca del panel principal. Si el cliente vuelve a escribir,
 *   reaparece sola (ver IngestInboundMessageUseCase).
 * - "unarchive": la devuelve al panel principal.
 */
export type ConversationAction = "attend" | "resume-ai" | "archive" | "unarchive";

export interface ConversationActionInput {
  conversationId: string;
  action: ConversationAction;
}

export interface ConversationActionOutput {
  status: "OPEN" | "PENDING_REVIEW" | "CLOSED" | "ARCHIVED";
  aiPausedUntil: string | null;
}

export class ConversationActionUseCase
  implements UseCase<ConversationActionInput, ConversationActionOutput>
{
  async execute(input: ConversationActionInput): Promise<ConversationActionOutput> {
    authorize("chats.send");
    const { tenantId } = TenantContext.require();

    const conv = await prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId },
    });
    if (!conv) throw new NotFoundError("Conversación no encontrada");

    const data = (() => {
      switch (input.action) {
        case "resume-ai":
          return { status: "OPEN" as const, aiPausedUntil: null };
        case "attend":
          return { status: conv.status === "PENDING_REVIEW" ? ("OPEN" as const) : conv.status };
        case "archive":
          return { status: "ARCHIVED" as const };
        case "unarchive":
          return { status: "OPEN" as const };
      }
    })();

    const updated = await prisma.conversation.update({ where: { id: conv.id }, data });

    return {
      status: updated.status,
      aiPausedUntil:
        updated.aiPausedUntil && updated.aiPausedUntil > new Date()
          ? updated.aiPausedUntil.toISOString()
          : null,
    };
  }
}
