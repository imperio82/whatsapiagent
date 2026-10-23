"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { greetingsService } from "@services/greetings.service";
import { ApiError } from "@services/api-client";
import type { GreetingStatusValue } from "@modules/greetings/application/use-cases";
import type { GreetingTemplateKey } from "@modules/clients/domain/special-dates";

const KEY = "greetings";

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function useGreetings(status?: GreetingStatusValue) {
  return useQuery({ queryKey: [KEY, status ?? "all"], queryFn: () => greetingsService.list(status) });
}

export function useUpcomingDates() {
  return useQuery({ queryKey: [KEY, "upcoming"], queryFn: () => greetingsService.upcoming() });
}

export function useGreetingSettings() {
  return useQuery({ queryKey: [KEY, "settings"], queryFn: () => greetingsService.settings() });
}

export function useSendGreeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message?: string }) => greetingsService.send(id, message),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      if (result.status === "SENT") toast.success("Felicitación enviada por WhatsApp");
      else toast.error(`No se pudo enviar: ${result.error ?? "error de WhatsApp"}`);
    },
    onError: showError,
  });
}

export function useDismissGreeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => greetingsService.dismiss(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: showError,
  });
}

export function usePrepareGreetings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => greetingsService.prepare(),
    onSuccess: ({ created }) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      if (created === 0) toast.info("No hay fechas nuevas para hoy ni mañana");
      else toast.success(`${created} felicitaci${created === 1 ? "ón preparada" : "ones preparadas"}`);
    },
    onError: showError,
  });
}

export function useUpdateGreetingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { mode?: "APPROVAL" | "AUTO"; templates?: Partial<Record<GreetingTemplateKey, string>> }) =>
      greetingsService.updateSettings(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "settings"] });
      toast.success("Configuración guardada");
    },
    onError: showError,
  });
}
