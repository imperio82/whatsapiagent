"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { remindersService, type CreateReminderBody, type ReminderSettingsInput } from "@services/reminders.service";
import { ApiError } from "@services/api-client";
import type { ReminderStatusValue } from "@modules/reminders/application/use-cases";
import type { ReminderKindValue } from "@modules/reminders/domain/reminders";

const KEY = "reminders";

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function useReminders(filter: { status?: ReminderStatusValue; kind?: ReminderKindValue }) {
  return useQuery({ queryKey: [KEY, filter.status ?? "all", filter.kind ?? "all"], queryFn: () => remindersService.list(filter) });
}

export function useReminderSettings() {
  return useQuery({ queryKey: [KEY, "settings"], queryFn: () => remindersService.settings() });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReminderBody) => remindersService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Recordatorio programado");
    },
    onError: showError,
  });
}

export function useSendReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message?: string }) => remindersService.send(id, message),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      if (result.status === "SENT") toast.success("Mensaje enviado por WhatsApp");
      else toast.error(`No se pudo enviar: ${result.error ?? "error de WhatsApp"}`);
    },
    onError: showError,
  });
}

export function useCompleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => remindersService.complete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: showError,
  });
}

export function useDismissReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => remindersService.dismiss(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: showError,
  });
}

export function usePrepareReminders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => remindersService.prepare(),
    onSuccess: ({ created }) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      if (created === 0) toast.info("No hay citas ni seguimientos nuevos por preparar");
      else toast.success(`${created} recordatorio${created === 1 ? " preparado" : "s preparados"}`);
    },
    onError: showError,
  });
}

export function useUpdateReminderSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReminderSettingsInput) => remindersService.updateSettings(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "settings"] });
      toast.success("Configuración guardada");
    },
    onError: showError,
  });
}
