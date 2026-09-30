"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { productsService } from "@services/products.service";
import { ApiError } from "@services/api-client";
import type {
  CreateProductInput,
  ListProductsInput,
  UpdateProductInput,
} from "@modules/products/application/dtos";

const KEY = "products";

export function useProducts(filters: Partial<ListProductsInput> = {}) {
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => productsService.list(filters),
  });
}

function showError(err: unknown): void {
  const msg = err instanceof ApiError ? err.message : "Error inesperado";
  toast.error(msg);
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => productsService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Producto creado");
    },
    onError: showError,
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      productsService.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Producto actualizado");
    },
    onError: showError,
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Producto eliminado");
    },
    onError: showError,
  });
}
