import { z } from "zod";
import { prisma } from "@shared/infrastructure/prisma/client";
import { MICRO_USD, PLANS, USAGE_LIMITS, monthKey, monthPeriod, type PlanTier } from "@modules/billing/domain/plans";
import { clientLimit, limitLevel, usageShare, type LimitLevel } from "@modules/billing/domain/usage-limits";
import { contactUsage, limitsSnapshot, spendForLimits } from "@modules/billing/application/response-gate";
import {
  limitsEnforcement,
  setLimitsEnforcement,
  type LimitsEnforcement,
} from "@modules/platform/infrastructure/platform-settings";
import { usdCopRate } from "./platform.use-cases";

/** Cupo y tope de un negocio en el mes, con las métricas del documento de límites de uso. */
export interface TenantLimitsDto {
  id: string;
  name: string;
  plan: PlanTier;
  status: string;
  clientsServed: number;
  chatLimit: number;
  spentUsd: number;
  budgetUsd: number;
  /** Lo que se acabe primero: clientes del cupo o gasto del tope (0 a 1 o más) */
  share: number;
  level: LimitLevel;
  capReachedAt: string | null;
  /** Llegó al tope hace menos de 48 h: los chats abiertos siguen con IA */
  inGrace: boolean;
  costPerClientCop: number;
  /** Costo de IA sobre el precio del plan */
  aiShare: number;
  contactsAtLimit: number;
  waitMessages: number;
  simulatorUsd: number;
}

export interface UsageLimitsDto {
  month: string;
  enforcement: LimitsEnforcement;
  usdCopRate: number;
  targets: { aiShare: number; costPerClientCop: number; maxRepliesPerContact: number; graceHours: number };
  plans: { tier: PlanTier; name: string; priceCop: number; chats: number; aiBudgetUsd: number; extraChatCop: number }[];
  totals: {
    clientsServed: number;
    costPerClientCop: number;
    aiShare: number;
    tenantsAtCap: number;
    tenantsWarned: number;
    waitMessages: number;
    contactsAtLimit: number;
  };
  tenants: TenantLimitsDto[];
}

export class GetUsageLimitsUseCase {
  async execute(month?: string | null, now = new Date()): Promise<UsageLimitsDto> {
    const period = monthPeriod(month, now);
    const key = monthKey(period.start);
    const rate = usdCopRate();
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, plan: true, status: true },
    });
    const ids = tenants.map((t) => t.id);
    const [contacts, spend, months, enforcement] = await Promise.all([
      contactUsage(ids, period),
      spendForLimits(ids, period),
      prisma.usageMonth.findMany({ where: { tenantId: { in: ids }, month: key } }),
      limitsEnforcement(),
    ]);
    const monthBy = new Map(months.map((m) => [m.tenantId, m]));

    const rows: TenantLimitsDto[] = tenants.map((t) => {
      const own = contacts.filter((c) => c.tenantId === t.id);
      const money = spend.get(t.id)!;
      const snapshot = limitsSnapshot(t.plan, own.length, money);
      const spentUsd = money.spentMicroUsd / MICRO_USD;
      const capReachedAt = monthBy.get(t.id)?.capReachedAt ?? null;
      return {
        id: t.id,
        name: t.name,
        plan: t.plan,
        status: t.status,
        clientsServed: own.length,
        chatLimit: clientLimit(snapshot),
        spentUsd,
        budgetUsd: snapshot.budgetMicroUsd / MICRO_USD,
        share: usageShare(snapshot),
        level: limitLevel(snapshot),
        capReachedAt: capReachedAt?.toISOString() ?? null,
        inGrace: !!capReachedAt && now.getTime() - capReachedAt.getTime() < USAGE_LIMITS.graceHours * 3_600_000,
        costPerClientCop: own.length > 0 ? (spentUsd * rate) / own.length : 0,
        aiShare: (spentUsd * rate) / PLANS[t.plan].priceCop,
        contactsAtLimit: own.filter((c) => c.replies >= USAGE_LIMITS.maxRepliesPerContact).length,
        waitMessages: monthBy.get(t.id)?.waitMessages ?? 0,
        simulatorUsd: money.simulatorMicroUsd / MICRO_USD,
      };
    });
    rows.sort((a, b) => b.share - a.share);

    // Las métricas globales, solo con los negocios activos (los que pagan)
    const active = rows.filter((r) => r.status === "ACTIVE");
    const clientsServed = active.reduce((acc, r) => acc + r.clientsServed, 0);
    const spentCop = active.reduce((acc, r) => acc + r.spentUsd * rate, 0);
    const revenueCop = active.reduce((acc, r) => acc + PLANS[r.plan].priceCop, 0);

    return {
      month: key,
      enforcement,
      usdCopRate: rate,
      targets: {
        aiShare: USAGE_LIMITS.aiShareTarget,
        costPerClientCop: USAGE_LIMITS.targetCostPerClientCop,
        maxRepliesPerContact: USAGE_LIMITS.maxRepliesPerContact,
        graceHours: USAGE_LIMITS.graceHours,
      },
      plans: Object.values(PLANS).map((p) => ({
        tier: p.tier,
        name: p.name,
        priceCop: p.priceCop,
        chats: p.chats,
        aiBudgetUsd: p.aiBudgetUsd,
        extraChatCop: p.extraChatCop,
      })),
      totals: {
        clientsServed,
        costPerClientCop: clientsServed > 0 ? spentCop / clientsServed : 0,
        aiShare: revenueCop > 0 ? spentCop / revenueCop : 0,
        tenantsAtCap: active.filter((r) => r.level === "TOPE").length,
        tenantsWarned: active.filter((r) => r.level === "AVISO_70" || r.level === "AVISO_90").length,
        waitMessages: rows.reduce((acc, r) => acc + r.waitMessages, 0),
        contactsAtLimit: rows.reduce((acc, r) => acc + r.contactsAtLimit, 0),
      },
      tenants: rows,
    };
  }
}

export const setEnforcementSchema = z.object({ enforcement: z.enum(["registro", "activo"]) });
export type SetEnforcementInput = z.infer<typeof setEnforcementSchema>;

export class SetLimitsEnforcementUseCase {
  execute(input: SetEnforcementInput): Promise<void> {
    return setLimitsEnforcement(input.enforcement);
  }
}
