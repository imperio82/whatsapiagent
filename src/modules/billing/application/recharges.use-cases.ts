import { z } from "zod";
import { TenantContext } from "@shared/application/tenant-context";
import { authorize } from "@shared/application/authorize";
import { NotFoundError, ValidationError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { getPlatformSetting } from "@modules/platform/infrastructure/platform-settings";
import {
  MICRO_USD,
  PLANS,
  RECHARGE_MAX_COP,
  RECHARGE_MIN_COP,
  RECHARGE_PACKS,
  RECHARGE_VALID_DAYS,
  rechargeQuote,
  type PlanTier,
  type RechargeQuote,
} from "../domain/plans";

/** Clave en platform_settings del texto con las formas de pago que ve el dueño al pedir una recarga */
export const PAYMENT_INSTRUCTIONS_KEY = "billing.paymentInstructions";
export const DEFAULT_PAYMENT_INSTRUCTIONS =
  "Te escribimos por WhatsApp con el link de pago. Apenas se confirme, el saldo se suma solo a tu cuenta.";

export async function paymentInstructions(): Promise<string> {
  return (await getPlatformSetting(PAYMENT_INSTRUCTIONS_KEY)) ?? DEFAULT_PAYMENT_INSTRUCTIONS;
}

export interface RechargeDto {
  id: string;
  /** Código corto para identificar el pago (referencia) */
  reference: string;
  amountCop: number;
  clients: number;
  creditUsd: number;
  status: "PENDING" | "PAID" | "CANCELLED";
  note: string | null;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
}

export function toRechargeDto(r: {
  id: string;
  amountCop: number;
  clients: number;
  creditMicroUsd: number;
  status: "PENDING" | "PAID" | "CANCELLED";
  note: string | null;
  createdAt: Date;
  paidAt: Date | null;
  expiresAt: Date | null;
}): RechargeDto {
  return {
    id: r.id,
    reference: rechargeReference(r.id),
    amountCop: r.amountCop,
    clients: r.clients,
    creditUsd: r.creditMicroUsd / MICRO_USD,
    status: r.status,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    paidAt: r.paidAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
  };
}

export function rechargeReference(id: string): string {
  return `REC-${id.slice(-6).toUpperCase()}`;
}

/** Lo que ve el dueño para recargar: paquetes con lo que da cada uno en su plan, el rango libre y sus recargas. */
export interface RechargeOptionsDto {
  plan: PlanTier;
  planName: string;
  extraChatCop: number;
  packs: RechargeQuote[];
  minCop: number;
  maxCop: number;
  validDays: number;
  instructions: string;
  recharges: RechargeDto[];
}

export class GetRechargeOptionsUseCase {
  async execute(): Promise<RechargeOptionsDto> {
    const { tenantId } = TenantContext.require();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
    if (!tenant) throw new NotFoundError("Negocio no encontrado");
    const [recharges, instructions] = await Promise.all([
      prisma.recharge.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10 }),
      paymentInstructions(),
    ]);
    return {
      plan: tenant.plan,
      planName: PLANS[tenant.plan].name,
      extraChatCop: PLANS[tenant.plan].extraChatCop,
      packs: RECHARGE_PACKS.map((p) => rechargeQuote(tenant.plan, p.priceCop)),
      minCop: RECHARGE_MIN_COP,
      maxCop: RECHARGE_MAX_COP,
      validDays: RECHARGE_VALID_DAYS,
      instructions,
      recharges: recharges.map(toRechargeDto),
    };
  }
}

export const requestRechargeSchema = z.object({
  amountCop: z
    .number()
    .int()
    .min(RECHARGE_MIN_COP, `El mínimo es $${RECHARGE_MIN_COP.toLocaleString("es-CO")}`)
    .max(RECHARGE_MAX_COP, `El máximo es $${RECHARGE_MAX_COP.toLocaleString("es-CO")}`),
});
export type RequestRechargeInput = z.infer<typeof requestRechargeSchema>;

/** Pendientes por negocio a la vez, para que no se acumulen solicitudes sin pagar */
const MAX_PENDING = 3;

export class RequestRechargeUseCase {
  async execute(input: RequestRechargeInput): Promise<RechargeDto> {
    authorize("tenant.settings");
    const { tenantId, userId } = TenantContext.require();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
    if (!tenant) throw new NotFoundError("Negocio no encontrado");

    const pending = await prisma.recharge.count({ where: { tenantId, status: "PENDING" } });
    if (pending >= MAX_PENDING) {
      throw new ValidationError("Ya tienes recargas pendientes de pago. Págalas o espera a que las confirmemos.");
    }
    const quote = rechargeQuote(tenant.plan, input.amountCop);
    if (quote.clients < 1) throw new ValidationError("El monto no alcanza para un cliente adicional");

    const recharge = await prisma.recharge.create({
      data: {
        tenantId,
        amountCop: quote.amountCop,
        clients: quote.clients,
        creditMicroUsd: Math.round(quote.creditUsd * MICRO_USD),
        requestedById: userId,
      },
    });
    console.log(
      `[recargas] ${rechargeReference(recharge.id)} pedida: negocio=${tenantId} $${quote.amountCop} → ${quote.clients} clientes`,
    );
    return toRechargeDto(recharge);
  }
}
