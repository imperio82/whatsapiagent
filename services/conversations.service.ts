import { api } from "./api-client";
import type { ConversationDetail } from "@modules/conversations/application/get-conversation.use-case";
import type { ConversationListItem } from "@modules/conversations/application/list-conversations.use-case";

export const conversationsService = {
  list: (status?: string) =>
    api.get<ConversationListItem[]>(
      status ? `/api/v1/conversations?status=${status}` : "/api/v1/conversations",
    ),
  get: (id: string) => api.get<ConversationDetail>(`/api/v1/conversations/${id}`),
  send: (id: string, text: string) =>
    api.post<{ messageId: string; sentAt: string }>(
      `/api/v1/conversations/${id}/messages`,
      { text },
    ),
};
