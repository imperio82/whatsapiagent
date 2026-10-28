"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { platformService } from "@services/platform.service";
import { ApiError } from "@services/api-client";
import type { AddBillingEntryInput, UpdateTenantBillingInput } from "@modules/platform/application/platform.use-cases";
import type { SetAgentModelInput } from "@modules/platform/application/agent-model.use-cases";
import type { SetVoiceModelInput } from "@modules/platform/application/voice-model.use-cases";
import type { SetTrialInput } from "@modules/platform/application/trial.use-cases";
import type { SetElevenLabsInput } from "@modules/platform/application/elevenlabs.use-cases";
import type { SetEnforcementInput } from "@modules/platform/application/usage-limits.use-cases";
import type { ResolveRechargeInput } from "@modules/platform/application/recharges-admin.use-cases";

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

export function useElevenLabsSettings() {
  return useQuery({ queryKey: [KEY, "elevenlabs"], queryFn: () => platformService.elevenLabs() });
}

export function useSetElevenLabsSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetElevenLabsInput) => platformService.setElevenLabs(input),
    onSuccess: (data, input) => {
      qc.setQueryData([KEY, "elevenlabs"], data);
      toast.success(
        input.apiKey
          ? "Clave de ElevenLabs guardada"
          : input.removeKey
            ? "Clave de ElevenLabs borrada del panel"
            : input.model
              ? `Las notas de voz de ElevenLabs salen con ${data.models.find((m) => m.id === input.model)?.label ?? input.model}`
              : input.freeOnly !== undefined
              ? input.freeOnly
                ? "Los negocios solo ven las voces gratis de ElevenLabs"
                : "Los negocios ven todas las voces de ElevenLabs"
              : data.enabled
                ? "ElevenLabs activado para los negocios"
                : "ElevenLabs desactivado: los negocios solo ven las voces de Gemini",
      );
    },
    onError,
  });
}

export function useTrialSettings() {
  return useQuery({ queryKey: [KEY, "trial"], queryFn: () => platformService.trial() });
}

export function useSetTrialSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetTrialInput) => platformService.setTrial(input),
    onSuccess: (data) => {
      qc.setQueryData([KEY, "trial"], data);
      qc.invalidateQueries({ queryKey: [KEY, "limits"] });
      toast.success(`La prueba gratis ahora regala US$ ${data.limits.valueUsd}`);
    },
    onError,
  });
}

export function useVoiceModel() {
  return useQuery({ queryKey: [KEY, "voice-model"], queryFn: () => platformService.voiceModel() });
}

export function useSetVoiceModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetVoiceModelInput) => platformService.setVoiceModel(input),
    onSuccess: (data) => {
      qc.setQueryData([KEY, "voice-model"], data);
      toast.success(`Las notas de voz ahora salen con ${data.current.modelName}`);
    },
    onError,
  });
}

export function useUsageLimits(month: string) {
  return useQuery({ queryKey: [KEY, "limits", month], queryFn: () => platformService.limits(month), refetchInterval: 60_000 });
}

export function useSetLimitsEnforcement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetEnforcementInput) => platformService.setEnforcement(input),
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: [KEY, "limits"] });
      toast.success(input.enforcement === "activo" ? "Límites activos: al llegar al tope hay gracia y mensaje de espera" : "Límites en modo solo registro");
    },
    onError,
  });
}

export function usePlatformRecharges() {
  return useQuery({ queryKey: [KEY, "recharges"], queryFn: () => platformService.recharges(), refetchInterval: 60_000 });
}

export function useResolveRecharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResolveRechargeInput }) => platformService.resolveRecharge(id, input),
    onSuccess: (data, { input }) => {
      qc.setQueryData([KEY, "recharges"], data);
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success(input.action === "confirm" ? "Pago confirmado: se sumaron los clientes y el saldo" : "Recarga cancelada");
    },
    onError,
  });
}

export function useSetPaymentInstructions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instructions: string) => platformService.setPaymentInstructions(instructions),
    onSuccess: (data) => {
      qc.setQueryData([KEY, "recharges"], data);
      toast.success("Formas de pago guardadas");
    },
    onError,
  });
}
