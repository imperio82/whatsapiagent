import { api } from "./api-client";
import type {
  ClientDateDto,
  ClientDateInput,
  ClientDetailsDto,
  ClientRelationDto,
} from "@modules/clients/application/details.use-cases";

export const clientDetailsService = {
  get: (clientId: string) => api.get<ClientDetailsDto>(`/api/v1/clients/${clientId}/details`),
  setOptOut: (clientId: string, greetingsOptOut: boolean) =>
    api.patch<ClientDetailsDto>(`/api/v1/clients/${clientId}/details`, { greetingsOptOut }),
  addDate: (clientId: string, input: ClientDateInput) => api.post<ClientDateDto>(`/api/v1/clients/${clientId}/dates`, input),
  updateDate: (clientId: string, dateId: string, input: ClientDateInput) =>
    api.patch<ClientDateDto>(`/api/v1/clients/${clientId}/dates/${dateId}`, input),
  deleteDate: (clientId: string, dateId: string) => api.delete<void>(`/api/v1/clients/${clientId}/dates/${dateId}`),
  addRelation: (clientId: string, input: { relatedClientId: string; label: string }) =>
    api.post<ClientRelationDto>(`/api/v1/clients/${clientId}/relations`, input),
  deleteRelation: (clientId: string, relationId: string) =>
    api.delete<void>(`/api/v1/clients/${clientId}/relations/${relationId}`),
};
