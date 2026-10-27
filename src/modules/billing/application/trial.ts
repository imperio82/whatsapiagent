import { prisma } from "@shared/infrastructure/prisma/client";
import { getPlatformSetting, setPlatformSetting } from "@modules/platform/infrastructure/platform-settings";
import { TRIAL_DEFAULT_VALUE_USD, TRIAL_MAX_VALUE_USD, trialLimits, type TrialLimits } from "../domain/plans";
import { usdCopRate } from "./exchange-rate";

/** Clave en platform_settings de lo que se regala en la prueba gratis, en dólares a precio de venta */
const TRIAL_VALUE_KEY = "billing.trialValueUsd";

/**
 * Negocios en prueba gratis: los que todavía no tienen ningún pago del plan registrado. Mientras tanto
 * usan los límites de la prueba (currentTrialLimits) y no los de su plan.
 */
export async function trialTenantIds(tenantIds: string[]): Promise<Set<string>> {
  if (tenantIds.length === 0) return new Set();
  const paid = await prisma.billingEntry.findMany({
    where: { tenantId: { in: tenantIds }, kind: "PAYMENT" },
    distinct: ["tenantId"],
    select: { tenantId: true },
  });
  const paidIds = new Set(paid.map((p) => p.tenantId));
  return new Set(tenantIds.filter((id) => !paidIds.has(id)));
}

export async function isTrial(tenantId: string): Promise<boolean> {
  return (await trialTenantIds([tenantId])).has(tenantId);
}

export async function trialValueUsd(): Promise<number> {
  const value = Number(await getPlatformSetting(TRIAL_VALUE_KEY));
  return Number.isFinite(value) && value > 0 && value <= TRIAL_MAX_VALUE_USD ? value : TRIAL_DEFAULT_VALUE_USD;
}

/** Los límites de la prueba con el valor elegido en /plataforma. */
export async function currentTrialLimits(): Promise<TrialLimits> {
  return trialLimits(await trialValueUsd(), usdCopRate());
}

/** Los límites de la prueba solo si el negocio está en prueba; si no, null (usa los de su plan). */
export async function trialLimitsFor(tenantId: string): Promise<TrialLimits | null> {
  return (await isTrial(tenantId)) ? currentTrialLimits() : null;
}

export function saveTrialValueUsd(valueUsd: number): Promise<void> {
  return setPlatformSetting(TRIAL_VALUE_KEY, String(valueUsd));
}
