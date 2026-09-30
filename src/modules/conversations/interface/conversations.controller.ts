import { z } from "zod";
import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import {
  GetConversationUseCase,
  type ConversationDetail,
} from "../application/get-conversation.use-case";
import {
  ListConversationsUseCase,
  type ConversationListItem,
} from "../application/list-conversations.use-case";
import { SendMessageUseCase } from "../application/send-message.use-case";

const sendSchema = z.object({
  text: z.string().min(1).max(4096),
});

export class ConversationsController {
  private readonly listUC = new ListConversationsUseCase();
  private readonly getUC = new GetConversationUseCase();
  private readonly sendUC = new SendMessageUseCase(getWhatsAppProvider());

  async list(query: URLSearchParams): Promise<ConversationListItem[]> {
    const status = query.get("status") ?? undefined;
    return this.listUC.execute({ status });
  }

  async get(id: string, markRead = true): Promise<ConversationDetail> {
    return this.getUC.execute({ id, markRead });
  }

  async send(id: string, body: unknown): Promise<{ messageId: string; sentAt: string }> {
    const input = sendSchema.parse(body);
    return this.sendUC.execute({ conversationId: id, text: input.text });
  }
}
