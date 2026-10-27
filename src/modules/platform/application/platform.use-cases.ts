import { z } from "zod";
import { NotFoundError } from "@shared/domain/errors";
import { jidToDisplayLabel } from "@shared/domain/wa-jid";
import { prisma } from "@shared/infrastructure/prisma/client";
import {
  MICRO_USD,
  PLANS,
  PLAN_TIERS,
  extendPaidUntil,
  limitsPlan,
  metaServiceCostCop,
  monthKey,
  monthPeriod,
  type PlanTier,
} from "@modules/billing/domain/plans";
import { usageByTenant, type TenantUsage } from "@modules/billing/application/usage";
import { usdCopRate } from "@modules/billing/application/exchange-rate";
import { currentTrialLimits } from "@modules/billing/application/trial";
import { VOICE_PREVIEW_CONVERSATION } from "@modules/voice/domain/voice-policy";

/**
 * Plataforma: todos los negocios con su plan, lo que pagaron y lo que cuestan (tokens y dólares de IA,
 * mensajes de Meta). Solo la usan rutas envueltas en withPlatformOwner.
 */

export { usdCopRate };

type TenantStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED";

/** Costos de un negocio en un mes. */
export interface CostsDto {
  chats: number;
  aiReplies: number;
  tokensIn: number;
  cachedTokensIn: number;
  tokensOut: number;
  spentUsd: number;
  /** Lo que te cuesta la IA, en pesos */
  aiCostCop: number;
  outboundMessages: number;
  /** Lo que el negocio le paga a Meta, estimado */
  metaCostCop: number;
  costPerChatUsd: number;
  costPerReplyUsd: number;
  /** Notas de voz del agente y audios de clientes transcritos; su costo está incluido en spentUsd */
  voiceNotes: number;
  transcriptions: number;
  voiceUsd: number;
}

export interface PlatformTenantDto extends CostsDto {
  id: string;
  name: string;
  slug: string;
  agentProfile: "RETAIL" | "BROKERAGE";
  status: TenantStatus;
  plan: PlanTier;
  paidUntil: string | null;
  createdAt: string;
  ownerEmail: string | null;
  members: number;
  whatsapp: { provider: string; phone: string; verified: boolean } | null;
  chatLimit: number;
  activeChats: number;
  budgetUsd: number;
  /** Precio del plan (si está activo y al día) menos lo que te cuesta la IA; Meta lo paga el negocio */
  marginCop: number;
  lastPaymentAt: string | null;
}

export interface PlatformOverviewDto {
  month: string;
  usdCopRate: number;
  totals: CostsDto & {
    tenants: number;
    activeTenants: number;
    /** Lo que deberían pagar al mes los negocios activos y al día */
    mrrCop: number;
    paymentsCop: number;
    activeChats: number;
    overdue: number;
    marginCop: number;
  };
  tenants: PlatformTenantDto[];
}

export interface BillingEntryDto {
  id: string;
  kind: "PAYMENT" | "CREDIT";
  amountCop: number | null;
  months: number | null;
  creditUsd: number | null;
  note: string | null;
  createdAt: string;
}

export interface TenantCostsDto {
  tenant: { id: string; name: string; plan: PlanTier };
  month: string;
  usdCopRate: number;
  /** Del mes más reciente al más antiguo */
  months: (CostsDto & { month: string })[];
  models: { model: string; replies: number; tokensIn: number; tokensOut: number; spentUsd: number }[];
  /** Los chats que más costaron en el mes elegido */
  topConversations: { id: string; label: string; replies: number; tokensIn: number; tokensOut: number; spentUsd: number }[];
}

function toCosts(u: TenantUsage, rate: number): CostsDto {
  const spentUsd = u.spentMicroUsd / MICRO_USD;
  const voiceUsd = u.voiceMicroUsd / MICRO_USD;
  return {
    voiceNotes: u.voiceNotes,
    transcriptions: u.transcriptions,
    voiceUsd,
    chats: u.chats,
    aiReplies: u.aiReplies,
    tokensIn: u.tokensIn,
    cachedTokensIn: u.cachedTokensIn,
    tokensOut: u.tokensOut,
    spentUsd,
    aiCostCop: spentUsd * rate,
    outboundMessages: u.outboundMessages,
    metaCostCop: metaServiceCostCop(u.outboundMessages),
    costPerChatUsd: u.chats > 0 ? spentUsd / u.chats : 0,
    // Solo el texto: la voz tiene su propia columna
    costPerReplyUsd: u.aiReplies > 0 ? (spentUsd - voiceUsd) / u.aiReplies : 0,
  };
}

function sumCosts(rows: CostsDto[]): CostsDto {
  const sum = (key: keyof CostsDto) => rows.reduce((acc, r) => acc + r[key], 0);
  const chats = sum("chats");
  const aiReplies = sum("aiReplies");
  const spentUsd = sum("spentUsd");
  const voiceUsd = sum("voiceUsd");
  return {
    voiceNotes: sum("voiceNotes"),
    transcriptions: sum("transcriptions"),
    voiceUsd,
    chats,
    aiReplies,
    tokensIn: sum("tokensIn"),
    cachedTokensIn: sum("cachedTokensIn"),
    tokensOut: sum("tokensOut"),
    spentUsd,
    aiCostCop: sum("aiCostCop"),
    outboundMessages: sum("outboundMessages"),
    metaCostCop: sum("metaCostCop"),
    costPerChatUsd: chats > 0 ? spentUsd / chats : 0,
    costPerReplyUsd: aiReplies > 0 ? (spentUsd - voiceUsd) / aiReplies : 0,
  };
}

export class GetPlatformOverviewUseCase {
  async execute(month?: string | null): Promise<PlatformOverviewDto> {
    const now = new Date();
    const period = monthPeriod(month, now);
    const rate = usdCopRate();
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        agentProfile: true,
        status: true,
        plan: true,
        paidUntil: true,
        createdAt: true,
        whatsappAccount: { select: { provider: true, displayPhoneNumber: true, verified: true } },
        memberships: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          select: { user: { select: { email: true } }, roles: { select: { role: { select: { key: true } } } } },
        },
        billingEntries: { where: { kind: "PAYMENT" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    });

    const [usage, payments, trialLimits] = await Promise.all([
      usageByTenant(tenants, period, now),
      prisma.billingEntry.aggregate({
        // Pagos del plan y recargas pagadas (los créditos de cortesía no tienen monto en pesos)
        where: { createdAt: { gte: period.start, lt: period.end } },
        _sum: { amountCop: true },
      }),
      currentTrialLimits(),
    ]);

    const rows: PlatformTenantDto[] = tenants.map((t) => {
      const u = usage.get(t.id)!;
      const costs = toCosts(u, rate);
      const owner = t.memberships.find((m) => m.roles.some((r) => r.role.key === "owner")) ?? t.memberships[0];
      return {
        ...costs,
        id: t.id,
        name: t.name,
        slug: t.slug,
        agentProfile: t.agentProfile,
        status: t.status,
        plan: t.plan,
        paidUntil: t.paidUntil?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        ownerEmail: owner?.user.email ?? null,
        members: t.memberships.length,
        whatsapp: t.whatsappAccount
          ? { provider: t.whatsappAccount.provider, phone: t.whatsappAccount.displayPhoneNumber, verified: t.whatsappAccount.verified }
          : null,
        // Sin ningún pago del plan sigue en prueba gratis, con su cupo
        chatLimit: limitsPlan(t.plan, t.billingEntries.length === 0 ? trialLimits : null).chats,
        activeChats: u.activeChats,
        budgetUsd: u.budgetMicroUsd / MICRO_USD,
        // Como en el total: solo cuenta el precio si está activo y al día
        marginCop: (t.status === "ACTIVE" && t.paidUntil && t.paidUntil >= now ? PLANS[t.plan].priceCop : 0) - costs.aiCostCop,
        lastPaymentAt: t.billingEntries[0]?.createdAt.toISOString() ?? null,
      };
    });

    const active = tenants.filter((t) => t.status === "ACTIVE");
    const upToDate = active.filter((t) => t.paidUntil && t.paidUntil >= now);
    const mrrCop = upToDate.reduce((sum, t) => sum + PLANS[t.plan].priceCop, 0);
    const totals = sumCosts(rows);
    return {
      month: monthKey(period.start),
      usdCopRate: rate,
      totals: {
        ...totals,
        tenants: tenants.length,
        activeTenants: active.length,
        mrrCop,
        paymentsCop: payments._sum.amountCop ?? 0,
        activeChats: rows.reduce((sum, r) => sum + r.activeChats, 0),
        overdue: active.length - upToDate.length,
        marginCop: mrrCop - totals.aiCostCop,
      },
      tenants: rows,
    };
  }
}

export class GetTenantCostsUseCase {
  /** Los últimos `months` meses hasta el elegido, más el detalle por modelo y por chat del mes elegido. */
  async execute(tenantId: string, month?: string | null, months = 6): Promise<TenantCostsDto> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, plan: true } });
    if (!tenant) throw new NotFoundError("Negocio no encontrado");
    const rate = usdCopRate();
    const period = monthPeriod(month);
    const periods = Array.from({ length: months }, (_, i) => {
      const start = new Date(period.start.getFullYear(), period.start.getMonth() - i, 1);
      return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) };
    });

    const inPeriod = { gte: period.start, lt: period.end };
    const [history, models, conversations] = await Promise.all([
      Promise.all(periods.map((p) => usageByTenant([tenant], p).then((u) => ({ month: monthKey(p.start), ...toCosts(u.get(tenant.id)!, rate) })))),
      prisma.aiUsageLog.groupBy({
        by: ["model"],
        where: { tenantId, createdAt: inPeriod },
        _sum: { costMicroUsd: true, tokensIn: true, tokensOut: true },
        _count: { _all: true },
      }),
      prisma.aiUsageLog.groupBy({
        by: ["conversationId"],
        where: { tenantId, createdAt: inPeriod },
        _sum: { costMicroUsd: true, tokensIn: true, tokensOut: true },
        _count: { _all: true },
        orderBy: { _sum: { costMicroUsd: "desc" } },
        take: 10,
      }),
    ]);

    const convRows = await prisma.conversation.findMany({
      where: { id: { in: conversations.map((c) => c.conversationId) } },
      select: { id: true, waChatId: true, client: { select: { name: true } } },
    });
    const labelBy = new Map(convRows.map((c) => [c.id, c.client?.name ? `${c.client.name} · ${jidToDisplayLabel(c.waChatId)}` : jidToDisplayLabel(c.waChatId)]));

    return {
      tenant,
      month: monthKey(period.start),
      usdCopRate: rate,
      months: history,
      models: models
        .map((m) => ({
          model: m.model,
          replies: m._count._all,
          tokensIn: m._sum.tokensIn ?? 0,
          tokensOut: m._sum.tokensOut ?? 0,
          spentUsd: (m._sum.costMicroUsd ?? 0) / MICRO_USD,
        }))
        .sort((a, b) => b.spentUsd - a.spentUsd),
      topConversations: conversations.map((c) => ({
        id: c.conversationId,
        label: labelBy.get(c.conversationId) ?? (c.conversationId === VOICE_PREVIEW_CONVERSATION ? "Pruebas de voz en el panel" : "Chat eliminado"),
        replies: c._count._all,
        tokensIn: c._sum.tokensIn ?? 0,
        tokensOut: c._sum.tokensOut ?? 0,
        spentUsd: (c._sum.costMicroUsd ?? 0) / MICRO_USD,
      })),
    };
  }
}

export const updateTenantBillingSchema = z.object({
  plan: z.enum(PLAN_TIERS as [PlanTier, ...PlanTier[]]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]).optional(),
  paidUntil: z.string().datetime().nullable().optional(),
});
export type UpdateTenantBillingInput = z.infer<typeof updateTenantBillingSchema>;

export class UpdateTenantBillingUseCase {
  async execute(tenantId: string, input: UpdateTenantBillingInput): Promise<void> {
    await ensureTenant(tenantId);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan: input.plan,
        status: input.status,
        paidUntil: input.paidUntil === undefined ? undefined : input.paidUntil ? new Date(input.paidUntil) : null,
      },
    });
  }
}

export const addBillingEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PAYMENT"),
    amountCop: z.number().int().positive("El monto debe ser mayor a cero").max(100_000_000),
    months: z.number().int().min(1).max(24),
    note: z.string().trim().max(200).optional(),
  }),
  z.object({
    kind: z.literal("CREDIT"),
    creditUsd: z.number().positive("El crédito debe ser mayor a cero").max(10_000),
    note: z.string().trim().max(200).optional(),
  }),
]);
export type AddBillingEntryInput = z.infer<typeof addBillingEntrySchema>;

export class AddBillingEntryUseCase {
  /** Un pago extiende la fecha pagada; un crédito suma dólares al presupuesto de IA del mes en curso. */
  async execute(tenantId: string, ownerUserId: string, input: AddBillingEntryInput): Promise<BillingEntryDto> {
    const tenant = await ensureTenant(tenantId);
    const entry = await prisma.$transaction(async (tx) => {
      if (input.kind === "PAYMENT") {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { paidUntil: extendPaidUntil(tenant.paidUntil, input.months) },
        });
      }
      return tx.billingEntry.create({
        data: {
          tenantId,
          kind: input.kind,
          amountCop: input.kind === "PAYMENT" ? input.amountCop : null,
          months: input.kind === "PAYMENT" ? input.months : null,
          creditMicroUsd: input.kind === "CREDIT" ? Math.round(input.creditUsd * MICRO_USD) : null,
          note: input.note || null,
          createdById: ownerUserId,
        },
      });
    });
    return toEntryDto(entry);
  }
}

export class ListBillingEntriesUseCase {
  async execute(tenantId: string): Promise<BillingEntryDto[]> {
    await ensureTenant(tenantId);
    const entries = await prisma.billingEntry.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
    return entries.map(toEntryDto);
  }
}

async function ensureTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, paidUntil: true } });
  if (!tenant) throw new NotFoundError("Negocio no encontrado");
  return tenant;
}

function toEntryDto(e: {
  id: string;
  kind: "PAYMENT" | "CREDIT";
  amountCop: number | null;
  months: number | null;
  creditMicroUsd: number | null;
  note: string | null;
  createdAt: Date;
}): BillingEntryDto {
  return {
    id: e.id,
    kind: e.kind,
    amountCop: e.amountCop,
    months: e.months,
    creditUsd: e.creditMicroUsd === null ? null : e.creditMicroUsd / MICRO_USD,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  };
}
