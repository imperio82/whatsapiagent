import { prisma } from "@shared/infrastructure/prisma/client";

/**
 * Negocios en prueba gratis: los que todavía no tienen ningún pago del plan registrado. Mientras tanto
 * usan los límites de TRIAL (plans.ts) y no los de su plan.
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
