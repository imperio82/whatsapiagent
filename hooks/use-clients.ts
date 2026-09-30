"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { clientsService } from "@services/clients.service";
import { ApiError } from "@services/api-client";
import type {
  CreateClientInput,
  ListClientsInput,
  UpdateClientInput,
} from "@modules/clients/application/dtos";

const LIST_KEY = "clients";
const DETAIL_KEY = "client";

export function useClients(filters: Partial<ListClientsInput> = {}) {
  return useQuery({
    queryKey: [LIST_KEY, filters],
    queryFn: () => clientsService.list(filters),
  });
}

export function useClient(id: string | null) {
  return useQuery({
    queryKey: [DETAIL_KEY, id],
    queryFn: () => clientsService.get(id!),
    enabled: !!id,
  });
}

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClientInput) => clientsService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
      toast.success("Cliente creado");
    },
    onError: showError,
  });
}

export function useUpdateClient(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateClientInput) => {
      if (!id) throw new Error("Sin id");
      return clientsService.update(id, input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
      qc.invalidateQueries({ queryKey: [DETAIL_KEY, id] });
      toast.success("Cliente actualizado");
    },
    onError: showError,
  });
}
