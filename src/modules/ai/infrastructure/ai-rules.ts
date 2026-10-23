import { prisma } from "@shared/infrastructure/prisma/client";
import { defaultRulesFor, type AgentProfileValue, type PromptRule } from "../domain/default-rules";

/**
 * Copia las reglas por defecto del perfil la primera vez. Si el negocio después las borra,
 * no vuelven a aparecer (queda marcado en `aiRulesSeededAt`).
 */
export async function ensureDefaultRules(tenantId: string, profile: AgentProfileValue): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { aiRulesSeededAt: true } });
  if (!tenant || tenant.aiRulesSeededAt) return;
  await restoreDefaultRules(tenantId, profile);
}

/** Vuelve a crear las reglas por defecto que falten y reactiva las que existan. No toca las propias del negocio. */
export async function restoreDefaultRules(tenantId: string, profile: AgentProfileValue): Promise<void> {
  const defaults = defaultRulesFor(profile);
  await prisma.$transaction([
    ...defaults.map((rule, position) =>
      prisma.aiRule.upsert({
        where: { tenantId_systemKey: { tenantId, systemKey: rule.systemKey } },
        update: { category: rule.category, title: rule.title, content: rule.content, isActive: true, position },
        create: { tenantId, ...rule, position },
      }),
    ),
    prisma.tenant.update({ where: { id: tenantId }, data: { aiRulesSeededAt: new Date() } }),
  ]);
}

/** Reglas activas que la IA debe seguir, en el orden que definió el negocio. */
export async function loadActiveRules(tenantId: string, profile: AgentProfileValue): Promise<PromptRule[]> {
  await ensureDefaultRules(tenantId, profile);
  return prisma.aiRule.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { category: true, title: true, content: true },
  });
}

/**
 * Al cambiar de perfil (tienda ↔ intermediación) se apagan las reglas por defecto del perfil
 * anterior y se cargan las del nuevo. Las reglas propias del negocio no se tocan.
 */
export async function switchProfileRules(tenantId: string, profile: AgentProfileValue): Promise<void> {
  const prefix = profile === "BROKERAGE" ? "brokerage." : "retail.";
  await prisma.aiRule.updateMany({
    where: { tenantId, systemKey: { not: null }, NOT: { systemKey: { startsWith: prefix } } },
    data: { isActive: false },
  });
  await restoreDefaultRules(tenantId, profile);
}
