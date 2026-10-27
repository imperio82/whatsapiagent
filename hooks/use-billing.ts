"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { billingService } from "@services/billing.service";
import { ApiError } from "@services/api-client";

/** Lo gastado en el mes; se refresca solo para que el contador del encabezado avance mientras el agente responde. */
export function useMyUsage() {
  return useQuery({ queryKey: ["billing", "usage"], queryFn: () => billingService.myUsage(), refetchInterval: 60_000 });
}

/** Paquetes y recargas del negocio; solo se pide cuando se abre la ventana de recarga. */
export function useRechargeOptions(enabled: boolean) {
  return useQuery({ queryKey: ["billing", "recharges"], queryFn: () => billingService.rechargeOptions(), enabled });
}

export function useRequestRecharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amountCop: number) => billingService.requestRecharge({ amountCop }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing", "recharges"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "No se pudo pedir la recarga"),
  });
}
