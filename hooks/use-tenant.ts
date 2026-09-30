"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tenantService } from "@services/tenant.service";
import { ApiError } from "@services/api-client";
import type { UpdateTenantInput } from "@modules/tenants/application/update-tenant.use-case";

const KEY = "tenant-current";

export function useCurrentTenant() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => tenantService.getCurrent(),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantInput) => tenantService.update(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Configuración actualizada");
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "No se pudo guardar";
      toast.error(msg);
    },
  });
}
