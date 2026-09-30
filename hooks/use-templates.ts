"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { templatesService } from "@services/templates.service";
import { ApiError } from "@services/api-client";
import type { UpsertTemplateInput } from "@modules/templates/application/dtos";

const KEY = "templates";

export function useTemplates() {
  return useQuery({ queryKey: [KEY], queryFn: () => templatesService.list() });
}

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertTemplateInput) => templatesService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Plantilla creada");
    },
    onError: showError,
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<UpsertTemplateInput> }) =>
      templatesService.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Plantilla actualizada");
    },
    onError: showError,
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => templatesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Plantilla eliminada");
    },
    onError: showError,
  });
}
