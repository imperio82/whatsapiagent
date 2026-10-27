import { Prisma } from "@prisma/client";
import { prisma } from "@shared/infrastructure/prisma/client";
import { SIMULATED_DOMAIN } from "@shared/domain/wa-jid";
import { MICRO_USD, PLANS, USAGE_LIMITS, monthKey, monthPeriod, type Period, type PlanTier } from "../domain/plans";
import { capReached, decideResponse, type LimitsSnapshot, type ResponseDecision } from "../domain/usage-limits";

export interface ContactUsageRow {
  tenantId: string;
  conversationId: string;
  replies: number;
  lastReplyAt: Date;
}

/**
 * Respuestas de IA por contacto en el mes, de uno o varios negocios. Solo clientes reales: sin el simulador
 * (su gasto se ve aparte), sin el asistente del asesor (no está en conversations) y sin notas de voz.
 */
export async function contactUsage(tenantIds: string[], period: Period): Promise<ContactUsageRow[]> {
  if (tenantIds.length === 0) return [];
  return prisma.$queryRaw<ContactUsageRow[]>`
    SELECT l."tenantId", l."conversationId", COUNT(*)::int AS replies, MAX(l."createdAt") AS "lastReplyAt"
    FROM ai_usage_logs l
    JOIN conversations c ON c.id = l."conversationId"
    WHERE l."tenantId" IN (${Prisma.join(tenantIds)})
      AND l."createdAt" >= ${period.start} AND l."createdAt" < ${period.end}
      AND (l.intent IS NULL OR l.intent NOT IN ('voz', 'transcripcion'))
      AND c."waChatId" NOT LIKE ${`%${SIMULATED_DOMAIN}`}
    GROUP BY l."tenantId", l."conversationId"`;
}

export interface LimitsSpend {
  spentMicroUsd: number;
  simulatorMicroUsd: number;
  creditMicroUsd: number;
  /** Clientes de recargas pagadas en el mes */
  extraClients: number;
}

/** Gasto de IA del mes sin el simulador, créditos sumados y clientes recargados, por negocio. */
export async function spendForLimits(
  tenantIds: string[],
  period: Period,
): Promise<Map<string, LimitsSpend>> {
  const result = new Map<string, LimitsSpend>();
  if (tenantIds.length === 0) return result;
  const [spend, credits, recharged] = await Promise.all([
    prisma.$queryRaw<{ tenantId: string; spent: bigint | null; simulator: bigint | null }[]>`
      SELECT l."tenantId",
        SUM(CASE WHEN c."waChatId" LIKE ${`%${SIMULATED_DOMAIN}`} THEN 0 ELSE l."costMicroUsd" END) AS spent,
        SUM(CASE WHEN c."waChatId" LIKE ${`%${SIMULATED_DOMAIN}`} THEN l."costMicroUsd" ELSE 0 END) AS simulator
      FROM ai_usage_logs l
      LEFT JOIN conversations c ON c.id = l."conversationId"
      WHERE l."tenantId" IN (${Prisma.join(tenantIds)})
        AND l."createdAt" >= ${period.start} AND l."createdAt" < ${period.end}
      GROUP BY l."tenantId"`,
    prisma.billingEntry.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, kind: "CREDIT", createdAt: { gte: period.start, lt: period.end } },
      _sum: { creditMicroUsd: true },
    }),
    // Su saldo de IA ya entra como crédito (billing_entries); aquí solo los clientes que suman al cupo
    prisma.recharge.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, status: "PAID", paidAt: { gte: period.start, lt: period.end } },
      _sum: { clients: true },
    }),
  ]);
  const creditBy = new Map(credits.map((c) => [c.tenantId, c._sum.creditMicroUsd ?? 0]));
  const clientsBy = new Map(recharged.map((r) => [r.tenantId, r._sum.clients ?? 0]));
  for (const id of tenantIds) {
    const row = spend.find((r) => r.tenantId === id);
    result.set(id, {
      spentMicroUsd: Number(row?.spent ?? 0),
      simulatorMicroUsd: Number(row?.simulator ?? 0),
      creditMicroUsd: creditBy.get(id) ?? 0,
      extraClients: clientsBy.get(id) ?? 0,
    });
  }
  return result;
}

export function limitsSnapshot(
  plan: PlanTier,
  clientsServed: number,
  spend: { spentMicroUsd: number; creditMicroUsd: number; extraClients: number },
): LimitsSnapshot {
  return {
    plan: PLANS[plan],
    extraClients: spend.extraClients,
    clientsServed,
    spentMicroUsd: spend.spentMicroUsd,
    budgetMicroUsd: PLANS[plan].aiBudgetUsd * MICRO_USD + spend.creditMicroUsd,
  };
}

/**
 * puedeResponder(negocio, contacto): decide antes del router si responde la IA, si sigue por la gracia
 * o si el cliente espera a una persona. Anota cuándo el negocio llegó al tope (inicio de la gracia).
 */
export async function canRespond(
  tenant: { id: string; plan: PlanTier },
  conversationId: string,
  now = new Date(),
): Promise<ResponseDecision> {
  const period = monthPeriod(null, now);
  const month = monthKey(now);
  const [contacts, spend, usageMonth] = await Promise.all([
    contactUsage([tenant.id], period),
    spendForLimits([tenant.id], period),
    prisma.usageMonth.findUnique({ where: { tenantId_month: { tenantId: tenant.id, month } } }),
  ]);
  const snapshot = limitsSnapshot(tenant.plan, contacts.length, spend.get(tenant.id)!);
  const row = contacts.find((c) => c.conversationId === conversationId);
  const contact = {
    alreadyServed: !!row,
    replies: row?.replies ?? 0,
    open: !!row && now.getTime() - new Date(row.lastReplyAt).getTime() < USAGE_LIMITS.openChatHours * 3_600_000,
  };

  let capReachedAt = usageMonth?.capReachedAt ?? null;
  if (capReached(snapshot) && !capReachedAt) {
    capReachedAt = now;
    await prisma.usageMonth.upsert({
      where: { tenantId_month: { tenantId: tenant.id, month } },
      create: { tenantId: tenant.id, month, capReachedAt: now },
      update: { capReachedAt: now },
    });
  }
  return decideResponse(snapshot, contact, capReachedAt, now);
}

/** Un cliente recibió el mensaje de espera: se cuenta para la métrica "clientes que quedaron en espera". */
export async function countWaitMessage(tenantId: string, now = new Date()): Promise<void> {
  const month = monthKey(now);
  await prisma.usageMonth.upsert({
    where: { tenantId_month: { tenantId, month } },
    create: { tenantId, month, waitMessages: 1 },
    update: { waitMessages: { increment: 1 } },
  });
}
