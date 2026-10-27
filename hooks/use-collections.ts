"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { collectionsService, type CollectionMeta } from "@services/collections.service";
import { ApiError } from "@services/api-client";

const KEY = "collections";

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function useCollections() {
  return useQuery({ queryKey: [KEY], queryFn: () => collectionsService.list() });
}

export function useCollectionRows(id: string, q: string, page: number) {
  return useQuery({
    queryKey: [KEY, id, "rows", q, page],
    queryFn: () => collectionsService.rows(id, q, page),
    placeholderData: keepPreviousData,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ meta, file }: { meta: CollectionMeta; file: File }) => collectionsService.create(meta, file),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success(`Tabla "${c.name}" creada con ${c.rowCount} filas`);
    },
    onError: showError,
  });
}

export function useReplaceCollectionData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => collectionsService.replaceData(id, file),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success(`Datos reemplazados: ${c.rowCount} filas`);
    },
    onError: showError,
  });
}

export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CollectionMeta> }) => collectionsService.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: showError,
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => collectionsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Tabla borrada");
    },
    onError: showError,
  });
}
