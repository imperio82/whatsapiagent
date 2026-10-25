"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { aiRulesService } from "@services/ai-rules.service";
import { ApiError } from "@services/api-client";
import type { CreateAiRuleInput, UpdateAiRuleInput } from "@modules/ai/application/ai-rules.use-cases";

const KEY = "ai-rules";

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function useAiRules() {
  return useQuery({ queryKey: [KEY], queryFn: () => aiRulesService.list() });
}

export function useCreateAiRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAiRuleInput) => aiRulesService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Habilidad creada");
    },
    onError: showError,
  });
}

export function useUpdateAiRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAiRuleInput }) => aiRulesService.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: showError,
  });
}

export function useDeleteAiRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiRulesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Habilidad eliminada");
    },
    onError: showError,
  });
}

export function useRestoreAiRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aiRulesService.restore(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Habilidades por defecto restauradas");
    },
    onError: showError,
  });
}
