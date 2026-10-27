import { z } from "zod";
import { currentTrialLimits, saveTrialValueUsd } from "@modules/billing/application/trial";
import { usdCopRate } from "@modules/billing/application/exchange-rate";
import { TRIAL_DEFAULT_VALUE_USD, TRIAL_MAX_VALUE_USD, type TrialLimits } from "@modules/billing/domain/plans";
import { prisma } from "@shared/infrastructure/prisma/client";

export interface TrialSettingsDto {
  limits: TrialLimits;
  defaultValueUsd: number;
  maxValueUsd: number;
  usdCopRate: number;
  /** Negocios que hoy están en prueba (sin ningún pago del plan) */
  tenantsInTrial: number;
}

export class GetTrialSettingsUseCase {
  async execute(): Promise<TrialSettingsDto> {
    const [limits, tenantsInTrial] = await Promise.all([
      currentTrialLimits(),
      prisma.tenant.count({ where: { billingEntries: { none: { kind: "PAYMENT" } } } }),
    ]);
    return { limits, defaultValueUsd: TRIAL_DEFAULT_VALUE_USD, maxValueUsd: TRIAL_MAX_VALUE_USD, usdCopRate: usdCopRate(), tenantsInTrial };
  }
}

export const setTrialSchema = z.object({ valueUsd: z.number().min(0.5).max(TRIAL_MAX_VALUE_USD) });
export type SetTrialInput = z.infer<typeof setTrialSchema>;

export class SetTrialSettingsUseCase {
  execute(input: SetTrialInput): Promise<void> {
    return saveTrialValueUsd(Math.round(input.valueUsd * 100) / 100);
  }
}
