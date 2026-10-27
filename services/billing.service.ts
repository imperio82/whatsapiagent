import { api } from "./api-client";
import type { MyUsageDto } from "@modules/billing/application/my-usage.use-case";
import type { RechargeDto, RechargeOptionsDto, RequestRechargeInput } from "@modules/billing/application/recharges.use-cases";

export const billingService = {
  myUsage: () => api.get<MyUsageDto>("/api/v1/billing/usage"),
  rechargeOptions: () => api.get<RechargeOptionsDto>("/api/v1/billing/recharges"),
  requestRecharge: (input: RequestRechargeInput) => api.post<RechargeDto>("/api/v1/billing/recharges", input),
};
