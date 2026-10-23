"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { dataSourcesService, type Mapping } from "@services/data-sources.service";
import { ApiError } from "@services/api-client";
import type { DataSourceDto } from "@modules/data-import/application/use-cases";

const KEY = "data-sources";
/** Lo importado cambia productos, inventario y clientes. */
const AFFECTED = [KEY, "products", "listings", "clients", "matches"];

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function announceResult(source: DataSourceDto): void {
  if (source.lastStatus === "ERROR") {
    toast.error(`No se pudo sincronizar: ${source.lastError ?? "error"}`);
    return;
  }
  const r = source.lastResult;
  if (!r) return;
  const text = `${r.created} nuevo${r.created === 1 ? "" : "s"}, ${r.updated} actualizado${r.updated === 1 ? "" : "s"}`;
  if (r.skipped > 0) toast.warning(`${text}. ${r.skipped} fila${r.skipped === 1 ? "" : "s"} con problemas: revisa el detalle.`);
  else toast.success(`Listo: ${text}`);
}

export function useDataSources() {
  return useQuery({ queryKey: [KEY], queryFn: () => dataSourcesService.list() });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => AFFECTED.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useSyncSource() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => dataSourcesService.sync(id),
    onSuccess: (source) => {
      invalidate();
      announceResult(source);
    },
    onError: showError,
  });
}

export function useUpdateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { mapping?: Mapping; syncEveryMinutes?: 60 | 360 | 1440 | null; isActive?: boolean } }) =>
      dataSourcesService.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: showError,
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dataSourcesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Fuente eliminada. Lo que ya se importó se conserva.");
    },
    onError: showError,
  });
}

export { useInvalidateAll as useInvalidateImported };
