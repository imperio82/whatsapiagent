import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { UseCase } from "@shared/domain/use-case";
import { MICRO_USD, limitsPlan, monthPeriod, saleValueUsd, type PlanTier } from "../domain/plans";
import { trialLimitsFor } from "./trial";
import { tenantUsage } from "./usage";

/**
 * Lo que ve el negocio en el encabezado: cuánto lleva gastado del mes y cuánto le queda. Los dólares van a
 * precio de venta (saleValueUsd), no al costo de la plataforma.
 */
export interface MyUsageDto {
  plan: PlanTier;
  planName: string;
  paidUntil: string | null;
  /** En prueba gratis: aún no tiene pagos del plan */
  trial: boolean;
  chats: number;
  chatLimit: number;
  activeChats: number;
  spentUsd: number;
  budgetUsd: number;
  creditUsd: number;
}

export class GetMyUsageUseCase implements UseCase<void, MyUsageDto> {
  async execute(): Promise<MyUsageDto> {
    const { tenantId } = TenantContext.require();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, plan: true, paidUntil: true } });
    if (!tenant) throw new NotFoundError("Negocio no encontrado");
    const [usage, recharged, trial] = await Promise.all([
      tenantUsage(tenant),
      prisma.recharge.aggregate({
        where: { tenantId, status: "PAID", paidAt: { gte: monthPeriod().start } },
        _sum: { clients: true },
      }),
      trialLimitsFor(tenantId),
    ]);
    const plan = limitsPlan(tenant.plan, trial);
    return {
      plan: tenant.plan,
      planName: plan.name,
      paidUntil: tenant.paidUntil?.toISOString() ?? null,
      trial: trial !== null,
      chats: usage.chats,
      chatLimit: plan.chats + (recharged._sum.clients ?? 0),
      activeChats: usage.activeChats,
      spentUsd: saleValueUsd(usage.spentMicroUsd / MICRO_USD),
      budgetUsd: saleValueUsd(usage.budgetMicroUsd / MICRO_USD),
      creditUsd: saleValueUsd(usage.creditMicroUsd / MICRO_USD),
    };
  }
}
