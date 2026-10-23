"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listingsService } from "@services/listings.service";
import { ApiError } from "@services/api-client";
import type { CreateListingInput, ListListingsInput, UpdateListingInput } from "@modules/listings/application/dtos";

const KEY = "listings";

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function useListings(filters: Partial<ListListingsInput> = {}) {
  return useQuery({ queryKey: [KEY, filters], queryFn: () => listingsService.list(filters) });
}

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateListingInput) => listingsService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["matches"] });
      toast.success("Bien agregado al inventario");
    },
    onError: showError,
  });
}

export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateListingInput }) => listingsService.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["matches"] });
      toast.success("Inventario actualizado");
    },
    onError: showError,
  });
}

export function useArchiveListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => listingsService.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Bien archivado");
    },
    onError: showError,
  });
}
