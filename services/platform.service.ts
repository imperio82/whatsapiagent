import { api } from "./api-client";
import type {
  AddBillingEntryInput,
  BillingEntryDto,
  PlatformOverviewDto,
  TenantCostsDto,
  UpdateTenantBillingInput,
} from "@modules/platform/application/platform.use-cases";

const BASE = "/api/v1/platform/tenants";

export const platformService = {
  overview: (month: string) => api.get<PlatformOverviewDto>(`${BASE}?month=${month}`),
  costs: (id: string, month: string) => api.get<TenantCostsDto>(`${BASE}/${id}/costs?month=${month}`),
  updateTenant: (id: string, input: UpdateTenantBillingInput) => api.patch<{ id: string }>(`${BASE}/${id}`, input),
  entries: (id: string) => api.get<BillingEntryDto[]>(`${BASE}/${id}/billing`),
  addEntry: (id: string, input: AddBillingEntryInput) => api.post<BillingEntryDto>(`${BASE}/${id}/billing`, input),
};
