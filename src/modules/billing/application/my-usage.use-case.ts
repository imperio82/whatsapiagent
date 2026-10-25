import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { UseCase } from "@shared/domain/use-case";
import { MICRO_USD, PLANS, type PlanTier } from "../domain/plans";
import { tenantUsage } from "./usage";

/** Lo que ve el negocio en el encabezado: cuánto lleva gastado del mes y cuánto le queda. */
export interface MyUsageDto {
  plan: PlanTier;
  planName: string;
  paidUntil: string | null;
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
    const usage = await tenantUsage(tenant);
    const plan = PLANS[tenant.plan];
    return {
      plan: tenant.plan,
      planName: plan.name,
      paidUntil: tenant.paidUntil?.toISOString() ?? null,
      chats: usage.chats,
      chatLimit: plan.chats,
      activeChats: usage.activeChats,
      spentUsd: usage.spentMicroUsd / MICRO_USD,
      budgetUsd: usage.budgetMicroUsd / MICRO_USD,
      creditUsd: usage.creditMicroUsd / MICRO_USD,
    };
  }
}
