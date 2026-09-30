import { api } from "./api-client";
import type {
  ClientDetailDto,
  ClientListItemDto,
  CreateClientInput,
  ListClientsInput,
  UpdateClientInput,
} from "@modules/clients/application/dtos";
import type { Page } from "@shared/domain/repository";

function toQuery(input: Partial<ListClientsInput>): string {
  const usp = new URLSearchParams();
  if (input.search) usp.set("search", input.search);
  if (input.page) usp.set("page", String(input.page));
  if (input.pageSize) usp.set("pageSize", String(input.pageSize));
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export const clientsService = {
  list: (input: Partial<ListClientsInput> = {}) =>
    api.get<Page<ClientListItemDto>>(`/api/v1/clients${toQuery(input)}`),
  get: (id: string) => api.get<ClientDetailDto>(`/api/v1/clients/${id}`),
  create: (input: CreateClientInput) => api.post<ClientDetailDto>("/api/v1/clients", input),
  update: (id: string, input: UpdateClientInput) =>
    api.patch<ClientDetailDto>(`/api/v1/clients/${id}`, input),
};
