"use client";

import { useQuery } from "@tanstack/react-query";
import { billingService } from "@services/billing.service";

/** Lo gastado en el mes; se refresca solo para que el contador del encabezado avance mientras el agente responde. */
export function useMyUsage() {
  return useQuery({ queryKey: ["billing", "usage"], queryFn: () => billingService.myUsage(), refetchInterval: 60_000 });
}
