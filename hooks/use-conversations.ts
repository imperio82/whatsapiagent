"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { conversationsService, type ConversationAction } from "@services/conversations.service";
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

/** Conversaciones que el agente de IA pasó a una persona. Se revisa cada 3 segundos. */
export function useHandoffQueue() {
  return useQuery({
    queryKey: [LIST_KEY, "PENDING_REVIEW"],
    queryFn: () => conversationsService.list("PENDING_REVIEW"),
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });
}

/** Atender, reactivar la IA, archivar o desarchivar una conversación. */
export function useConversationAction() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ConversationAction }) =>
      conversationsService.action(id, action),
    onSuccess: (_data, { id, action }) => {
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
      qc.invalidateQueries({ queryKey: [DETAIL_KEY, id] });
      if (action === "resume-ai") toast.success("La IA vuelve a responder en esta conversación");
      if (action === "unarchive") toast.success("Conversación devuelta al panel principal");
      if (action === "archive") {
        toast.success("Conversación archivada", {
          description: "Si el cliente vuelve a escribir, aparece de nuevo.",
          action: {
            label: "Deshacer",
            onClick: () => mutation.mutate({ id, action: "unarchive" }),
          },
        });
      }
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "No se pudo actualizar la conversación";
      toast.error(msg);
    },
  });
  return mutation;
}
