"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { conversationsService } from "@services/conversations.service";
import { ApiError } from "@services/api-client";

const LIST_KEY = "conversations";
const DETAIL_KEY = "conversation";

export function useConversations(status?: string) {
  return useQuery({
    queryKey: [LIST_KEY, status ?? "all"],
    queryFn: () => conversationsService.list(status),
    refetchInterval: 5000,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: [DETAIL_KEY, id],
    queryFn: () => conversationsService.get(id!),
    enabled: !!id,
    refetchInterval: 3000,
  });
}

export function useSendMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => {
      if (!conversationId) throw new Error("Sin conversación seleccionada");
      return conversationsService.send(conversationId, text);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DETAIL_KEY, conversationId] });
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "No se pudo enviar el mensaje";
      toast.error(msg);
    },
  });
}
