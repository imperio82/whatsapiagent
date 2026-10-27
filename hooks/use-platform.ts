"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { platformService } from "@services/platform.service";
import { ApiError } from "@services/api-client";
import type { AddBillingEntryInput, UpdateTenantBillingInput } from "@modules/platform/application/platform.use-cases";
import type { SetAgentModelInput } from "@modules/platform/application/agent-model.use-cases";

const KEY = "platform";

export function usePlatformOverview(month: string) {
  return useQuery({ queryKey: [KEY, "overview", month], queryFn: () => platformService.overview(month), refetchInterval: 60_000 });
}

export function useTenantCosts(tenantId: string | null, month: string) {
  return useQuery({
    queryKey: [KEY, "costs", tenantId, month],
    queryFn: () => platformService.costs(tenantId!, month),
    enabled: !!tenantId,
  });
}

export function useBillingEntries(tenantId: string | null) {
  return useQuery({
    queryKey: [KEY, "entries", tenantId],
    queryFn: () => platformService.entries(tenantId!),
    enabled: !!tenantId,
  });
}

function onError(err: unknown) {
  toast.error(err instanceof ApiError ? err.message : "No se pudo guardar");
}

export function useUpdateTenantBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTenantBillingInput }) => platformService.updateTenant(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Negocio actualizado");
    },
    onError,
  });
}

export function useAddBillingEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddBillingEntryInput }) => platformService.addEntry(id, input),
    onSuccess: (_, { input }) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast.success(input.kind === "PAYMENT" ? "Pago registrado" : "Crédito agregado");
    },
    onError,
  });
}

export function useAgentModel() {
  return useQuery({ queryKey: [KEY, "agent-model"], queryFn: () => platformService.agentModel() });
}

export function useSetAgentModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetAgentModelInput) => platformService.setAgentModel(input),
    onSuccess: (data) => {
      qc.setQueryData([KEY, "agent-model"], data);
      toast.success(`El agente ahora responde con ${data.current.modelName}`);
    },
    onError,
  });
}
