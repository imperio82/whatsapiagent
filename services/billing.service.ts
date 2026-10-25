import { api } from "./api-client";
import type { MyUsageDto } from "@modules/billing/application/my-usage.use-case";

export const billingService = {
  myUsage: () => api.get<MyUsageDto>("/api/v1/billing/usage"),
};
