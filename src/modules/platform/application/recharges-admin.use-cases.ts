import { z } from "zod";
import { NotFoundError, ValidationError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { RECHARGE_VALID_DAYS } from "@modules/billing/domain/plans";
import {
  PAYMENT_INSTRUCTIONS_KEY,
  paymentInstructions,
  rechargeReference,
  toRechargeDto,
  type RechargeDto,
} from "@modules/billing/application/recharges.use-cases";
import { setPlatformSetting } from "@modules/platform/infrastructure/platform-settings";

export interface PlatformRechargeDto extends RechargeDto {
  tenant: { id: string; name: string };
}

export interface PlatformRechargesDto {
  instructions: string;
  pending: PlatformRechargeDto[];
  recent: PlatformRechargeDto[];
}

export class ListPlatformRechargesUseCase {
  async execute(): Promise<PlatformRechargesDto> {
    const include = { tenant: { select: { id: true, name: true } } } as const;
    const [pending, recent, instructions] = await Promise.all([
      prisma.recharge.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include }),
      prisma.recharge.findMany({ where: { status: { not: "PENDING" } }, orderBy: { createdAt: "desc" }, take: 20, include }),
      paymentInstructions(),
    ]);
    const map = (r: (typeof pending)[number]): PlatformRechargeDto => ({ ...toRechargeDto(r), tenant: r.tenant });
    return { instructions, pending: pending.map(map), recent: recent.map(map) };
  }
}

export const resolveRechargeSchema = z.object({
  action: z.enum(["confirm", "cancel"]),
  note: z.string().trim().max(200).optional(),
});
export type ResolveRechargeInput = z.infer<typeof resolveRechargeSchema>;

/**
 * Confirmar el pago: la recarga queda pagada, sus clientes se suman al cupo del mes y su saldo de IA entra
 * como crédito (con el monto en pesos, para que cuente en los pagos del mes). Cancelar no suma nada.
 */
export class ResolveRechargeUseCase {
  async execute(id: string, ownerUserId: string, input: ResolveRechargeInput): Promise<void> {
    const recharge = await prisma.recharge.findUnique({ where: { id } });
    if (!recharge) throw new NotFoundError("Recarga no encontrada");
    if (recharge.status !== "PENDING") throw new ValidationError("Esta recarga ya se resolvió");
    const now = new Date();

    if (input.action === "cancel") {
      await prisma.recharge.update({
        where: { id },
        data: { status: "CANCELLED", resolvedById: ownerUserId, note: input.note || null },
      });
      return;
    }

    await prisma.$transaction([
      prisma.recharge.update({
        where: { id },
        data: {
          status: "PAID",
          paidAt: now,
          expiresAt: new Date(now.getTime() + RECHARGE_VALID_DAYS * 86_400_000),
          resolvedById: ownerUserId,
          note: input.note || null,
        },
      }),
      prisma.billingEntry.create({
        data: {
          tenantId: recharge.tenantId,
          kind: "CREDIT",
          amountCop: recharge.amountCop,
          creditMicroUsd: recharge.creditMicroUsd,
          note: `Recarga ${rechargeReference(id)}: ${recharge.clients} clientes${input.note ? ` · ${input.note}` : ""}`,
          createdById: ownerUserId,
        },
      }),
    ]);
  }
}

export const paymentInstructionsSchema = z.object({ instructions: z.string().trim().min(10).max(1000) });

export class SetPaymentInstructionsUseCase {
  execute(input: z.infer<typeof paymentInstructionsSchema>): Promise<void> {
    return setPlatformSetting(PAYMENT_INSTRUCTIONS_KEY, input.instructions);
  }
}
