"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ordersService } from "@services/orders.service";
import { ApiError } from "@services/api-client";
import type { ListOrdersInput, UpdateStatusInput } from "@modules/orders/application/dtos";

const LIST_KEY = "orders";
const DETAIL_KEY = "order";

export function useOrders(filters: Partial<ListOrdersInput> = {}) {
  return useQuery({
    queryKey: [LIST_KEY, filters],
    queryFn: () => ordersService.list(filters),
    refetchInterval: 8000,
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: [DETAIL_KEY, id],
    queryFn: () => ordersService.get(id!),
    enabled: !!id,
  });
}

export function useUpdateOrder(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStatusInput) => {
      if (!id) throw new Error("Sin id");
      return ordersService.update(id, input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
      qc.invalidateQueries({ queryKey: [DETAIL_KEY, id] });
      toast.success("Pedido actualizado");
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "No se pudo actualizar";
      toast.error(msg);
    },
  });
}
