"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { simulatorService } from "@services/simulator.service";
import { ApiError } from "@services/api-client";
import type { SimulatorMessageInput } from "@modules/simulator/application/use-cases";

const KEY = "simulator";

export function useSimulatorStatus() {
  return useQuery({ queryKey: [KEY, "status"], queryFn: () => simulatorService.status() });
}

/** Lo que hizo el agente en cada respuesta; se refresca mientras se espera la siguiente. */
export function useSimulatorTrace(conversationId: string | null) {
  return useQuery({
    queryKey: [KEY, "trace", conversationId],
    queryFn: () => simulatorService.trace(conversationId!),
    enabled: !!conversationId,
    refetchInterval: 3000,
  });
}

export function useSendSimulatedMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SimulatorMessageInput) => simulatorService.send(input),
    onSuccess: ({ conversationId }) => {
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje"),
  });
}
