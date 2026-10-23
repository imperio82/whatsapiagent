"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { integrationsService, type ConnectionScope } from "@services/integrations.service";
import { ApiError } from "@services/api-client";
import type { ConnectionSettingsInput } from "@modules/integrations/application/use-cases";

const KEY = "integrations";

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function useIntegrations() {
  return useQuery({ queryKey: [KEY], queryFn: () => integrationsService.overview() });
}

export function useGoogleCalendars(scope: ConnectionScope, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "google-calendars", scope],
    queryFn: () => integrationsService.googleCalendars(scope),
    enabled,
    retry: false,
  });
}

export function useUpdateGoogleSettings(scope: ConnectionScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectionSettingsInput) => integrationsService.updateGoogle(scope, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Agenda guardada");
    },
    onError: showError,
  });
}

export function useDisconnectGoogle(scope: ConnectionScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => integrationsService.disconnectGoogle(scope),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Google desconectado");
    },
    onError: showError,
  });
}

export function useSaveGoogleApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { clientId: string; clientSecret: string }) => integrationsService.saveGoogleApp(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Credenciales guardadas. Si ya había cuentas conectadas, hay que reconectarlas.");
    },
    onError: showError,
  });
}

export function useDeleteGoogleApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => integrationsService.deleteGoogleApp(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Credenciales propias eliminadas");
    },
    onError: showError,
  });
}
