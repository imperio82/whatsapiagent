"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { clientDetailsService } from "@services/client-details.service";
import { ApiError } from "@services/api-client";
import type { ClientDateInput } from "@modules/clients/application/details.use-cases";

const KEY = "client-details";

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function useClientDetails(clientId: string | null) {
  return useQuery({
    queryKey: [KEY, clientId],
    queryFn: () => clientDetailsService.get(clientId!),
    enabled: !!clientId,
  });
}

/** Cualquier cambio en fechas o red refresca la ficha y las próximas fechas de Felicitaciones. */
function useDetailsMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["greetings"] });
      if (success) toast.success(success);
    },
    onError: showError,
  });
}

export function useSaveClientDate(clientId: string) {
  return useDetailsMutation(({ id, input }: { id?: string; input: ClientDateInput }) =>
    id ? clientDetailsService.updateDate(clientId, id, input) : clientDetailsService.addDate(clientId, input),
  "Fecha guardada");
}

export function useDeleteClientDate(clientId: string) {
  return useDetailsMutation((dateId: string) => clientDetailsService.deleteDate(clientId, dateId));
}

export function useAddClientRelation(clientId: string) {
  return useDetailsMutation((input: { relatedClientId: string; label: string }) => clientDetailsService.addRelation(clientId, input));
}

export function useDeleteClientRelation(clientId: string) {
  return useDetailsMutation((relationId: string) => clientDetailsService.deleteRelation(clientId, relationId));
}

export function useSetGreetingsOptOut(clientId: string) {
  return useDetailsMutation((optOut: boolean) => clientDetailsService.setOptOut(clientId, optOut));
}
