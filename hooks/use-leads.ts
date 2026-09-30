"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { leadsService, type OpenerTone } from "@services/leads.service";
import { ApiError } from "@services/api-client";
import type { CreateLeadInput, UpdateLeadInput } from "@modules/leads/application/dtos";

const KEY = "leads";
const OPENERS_KEY = "lead-openers";

export function useLeads() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => leadsService.list(),
  });
}

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadInput) => leadsService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Lead creado");
    },
    onError: showError,
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLeadInput }) =>
      leadsService.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: showError,
  });
}

export function useLeadOpeners(leadId: string | null) {
  return useQuery({
    queryKey: [OPENERS_KEY, leadId],
    queryFn: () => leadsService.listOpeners(leadId!),
    enabled: !!leadId,
  });
}

export function useGenerateOpeners(leadId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tone?: OpenerTone; variants?: number }) => {
      if (!leadId) throw new Error("Sin lead");
      return leadsService.generateOpeners(leadId, input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [OPENERS_KEY, leadId] });
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Abridores generados");
    },
    onError: showError,
  });
}

export function useSendOpener(leadId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (openerId: string) => {
      if (!leadId) throw new Error("Sin lead");
      return leadsService.sendOpener(leadId, openerId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [OPENERS_KEY, leadId] });
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Abridor enviado por WhatsApp");
    },
    onError: showError,
  });
}
