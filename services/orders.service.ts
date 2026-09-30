import { api } from "./api-client";
import type {
  ListOrdersInput,
  OrderDetailDto,
  OrderListItemDto,
  UpdateStatusInput,
} from "@modules/orders/application/dtos";
import type { Page } from "@shared/domain/repository";

function toQuery(input: Partial<ListOrdersInput>): string {
  const usp = new URLSearchParams();
  if (input.status) usp.set("status", input.status);
  if (input.search) usp.set("search", input.search);
  if (input.page) usp.set("page", String(input.page));
  if (input.pageSize) usp.set("pageSize", String(input.pageSize));
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export const ordersService = {
  list: (input: Partial<ListOrdersInput> = {}) =>
    api.get<Page<OrderListItemDto>>(`/api/v1/orders${toQuery(input)}`),
  get: (id: string) => api.get<OrderDetailDto>(`/api/v1/orders/${id}`),
  update: (id: string, input: UpdateStatusInput) =>
    api.patch<OrderDetailDto>(`/api/v1/orders/${id}`, input),
};
