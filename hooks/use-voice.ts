"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { voiceService } from "@services/voice.service";
import { ApiError } from "@services/api-client";
import type { PreviewVoiceInput, UpdateVoiceSettingsInput } from "@modules/voice/application/voice-settings.use-cases";

const KEY = "voice";

function onError(fallback: string) {
  return (err: unknown) => toast.error(err instanceof ApiError ? err.message : fallback);
}

export function useVoiceSettings() {
  return useQuery({ queryKey: [KEY], queryFn: () => voiceService.settings() });
}

export function useUpdateVoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateVoiceSettingsInput) => voiceService.update(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["simulator"] });
      toast.success("Voz del agente guardada");
    },
    onError: onError("No se pudo guardar"),
  });
}

export function usePreviewVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PreviewVoiceInput) => voiceService.preview(input),
    // La prueba gasta un poco del presupuesto: el contador del encabezado se actualiza
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }),
    onError: onError("No se pudo generar la voz"),
  });
}

export function useCloneVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: voiceService.clone,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Voz clonada: ya puedes elegirla");
    },
    onError: onError("No se pudo clonar la voz"),
  });
}

export function useDeleteClonedVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voiceService.deleteClone(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Voz clonada eliminada");
    },
    onError: onError("No se pudo eliminar la voz"),
  });
}
