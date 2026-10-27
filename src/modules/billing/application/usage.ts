import { Prisma } from "@prisma/client";
import { prisma } from "@shared/infrastructure/prisma/client";
import { SIMULATED_DOMAIN } from "@shared/domain/wa-jid";
import { MICRO_USD, limitsPlan, monthPeriod, type Period, type PlanTier } from "../domain/plans";
import { isTrial, trialTenantIds } from "./trial";

/** Consumo de un negocio en un mes. Los montos van en millonésimas de dólar, como en ai_usage_logs. */
export interface TenantUsage {
  period: Period;
  /** Clientes distintos que escribieron en el mes; los chats del simulador no cuentan */
  chats: number;
  /** Conversaciones con mensajes en las últimas 24 horas (siempre las de hoy, no las del mes elegido) */
  activeChats: number;
  /** Respuestas del agente de IA y los tokens que gastaron (todo el uso de IA, voz incluida) */
  aiReplies: number;
  /** Notas de voz generadas y audios de clientes transcritos, y lo que costaron */
  voiceNotes: number;
  transcriptions: number;
  voiceMicroUsd: number;
  tokensIn: number;
  /** Parte de tokensIn que salió de la caché del proveedor (más barata) */
  cachedTokensIn: number;
  tokensOut: number;
  /** Mensajes enviados por WhatsApp (agente y equipo), que es lo que Meta cobra */
  outboundMessages: number;
  spentMicroUsd: number;
  creditMicroUsd: number;
  budgetMicroUsd: number;
}

/** Filas de ai_usage_logs que son audio y no respuestas del agente */
export const VOICE_INTENTS = ["voz", "transcripcion"] as const;

interface TenantPlanRow {
  id: string;
  plan: PlanTier;
}

/** Consumo de varios negocios con cinco consultas en total, para que el panel de la plataforma no haga una por fila. */
export async function usageByTenant(
  tenants: TenantPlanRow[],
  period: Period = monthPeriod(),
  now = new Date(),
): Promise<Map<string, TenantUsage>> {
  const ids = tenants.map((t) => t.id);
  const result = new Map<string, TenantUsage>();
  if (ids.length === 0) return result;
  const inPeriod = { gte: period.start, lt: period.end };
  const notSimulated = `%${SIMULATED_DOMAIN}`;

  const [ai, voice, credits, chats, outbound, active, trial] = await Promise.all([
    prisma.aiUsageLog.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: ids }, createdAt: inPeriod },
      _sum: { costMicroUsd: true, tokensIn: true, cachedTokensIn: true, tokensOut: true },
      _count: { _all: true },
    }),
    prisma.aiUsageLog.groupBy({
      by: ["tenantId", "intent"],
      where: { tenantId: { in: ids }, createdAt: inPeriod, intent: { in: [...VOICE_INTENTS] } },
      _sum: { costMicroUsd: true },
      _count: { _all: true },
    }),
    prisma.billingEntry.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: ids }, kind: "CREDIT", createdAt: inPeriod },
      _sum: { creditMicroUsd: true },
    }),
    prisma.$queryRaw<{ tenantId: string; chats: number }[]>`
      SELECT c."tenantId", COUNT(DISTINCT c.id)::int AS chats
      FROM conversations c
      JOIN messages m ON m."conversationId" = c.id
      WHERE c."tenantId" IN (${Prisma.join(ids)})
        AND m.direction = 'INBOUND'
        AND m."sentAt" >= ${period.start} AND m."sentAt" < ${period.end}
        AND c."waChatId" NOT LIKE ${notSimulated}
      GROUP BY c."tenantId"`,
    prisma.$queryRaw<{ tenantId: string; messages: number }[]>`
      SELECT c."tenantId", COUNT(*)::int AS messages
      FROM conversations c
      JOIN messages m ON m."conversationId" = c.id
      WHERE c."tenantId" IN (${Prisma.join(ids)})
        AND m.direction = 'OUTBOUND'
        AND m."sentAt" >= ${period.start} AND m."sentAt" < ${period.end}
        AND c."waChatId" NOT LIKE ${notSimulated}
      GROUP BY c."tenantId"`,
    prisma.conversation.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: ids }, lastMessageAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      _count: { _all: true },
    }),
    trialTenantIds(ids),
  ]);

  const aiBy = new Map(ai.map((r) => [r.tenantId, r]));
  const voiceOf = (tenantId: string, intent: string) => voice.find((r) => r.tenantId === tenantId && r.intent === intent);
  const creditBy = new Map(credits.map((r) => [r.tenantId, r._sum.creditMicroUsd ?? 0]));
  const chatsBy = new Map(chats.map((r) => [r.tenantId, r.chats]));
  const outboundBy = new Map(outbound.map((r) => [r.tenantId, r.messages]));
  const activeBy = new Map(active.map((r) => [r.tenantId, r._count._all]));

  for (const t of tenants) {
    const a = aiBy.get(t.id);
    const creditMicroUsd = creditBy.get(t.id) ?? 0;
    const notes = voiceOf(t.id, "voz");
    const heard = voiceOf(t.id, "transcripcion");
    const voiceCount = (notes?._count._all ?? 0) + (heard?._count._all ?? 0);
    result.set(t.id, {
      period,
      chats: chatsBy.get(t.id) ?? 0,
      activeChats: activeBy.get(t.id) ?? 0,
      aiReplies: (a?._count._all ?? 0) - voiceCount,
      voiceNotes: notes?._count._all ?? 0,
      transcriptions: heard?._count._all ?? 0,
      voiceMicroUsd: (notes?._sum.costMicroUsd ?? 0) + (heard?._sum.costMicroUsd ?? 0),
      tokensIn: a?._sum.tokensIn ?? 0,
      cachedTokensIn: a?._sum.cachedTokensIn ?? 0,
      tokensOut: a?._sum.tokensOut ?? 0,
      outboundMessages: outboundBy.get(t.id) ?? 0,
      spentMicroUsd: a?._sum.costMicroUsd ?? 0,
      creditMicroUsd,
      budgetMicroUsd: limitsPlan(t.plan, trial.has(t.id)).aiBudgetUsd * MICRO_USD + creditMicroUsd,
    });
  }
  return result;
}

export async function tenantUsage(tenant: TenantPlanRow, now = new Date()): Promise<TenantUsage> {
  const usage = await usageByTenant([tenant], monthPeriod(null, now), now);
  return usage.get(tenant.id)!;
}

/**
 * El agente deja de responder cuando el negocio gastó todo el presupuesto de IA del mes; los mensajes
 * siguen llegando a Conversaciones para que los atienda una persona.
 */
export async function aiBudgetExhausted(tenant: TenantPlanRow, now = new Date()): Promise<boolean> {
  const { start } = monthPeriod(null, now);
  const [spent, credits, trial] = await Promise.all([
    prisma.aiUsageLog.aggregate({
      where: { tenantId: tenant.id, createdAt: { gte: start } },
      _sum: { costMicroUsd: true },
    }),
    prisma.billingEntry.aggregate({
      where: { tenantId: tenant.id, kind: "CREDIT", createdAt: { gte: start } },
      _sum: { creditMicroUsd: true },
    }),
    isTrial(tenant.id),
  ]);
  const budget = limitsPlan(tenant.plan, trial).aiBudgetUsd * MICRO_USD + (credits._sum.creditMicroUsd ?? 0);
  return (spent._sum.costMicroUsd ?? 0) >= budget;
}
