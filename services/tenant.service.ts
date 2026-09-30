import { api } from "./api-client";
import type { CurrentTenantDto } from "@modules/tenants/application/get-current-tenant.use-case";
import type { UpdateTenantInput } from "@modules/tenants/application/update-tenant.use-case";

export const tenantService = {
  getCurrent: () => api.get<CurrentTenantDto>("/api/v1/tenants/current"),
  update: (input: UpdateTenantInput) =>
    api.patch<CurrentTenantDto>("/api/v1/tenants/current", input),
};
