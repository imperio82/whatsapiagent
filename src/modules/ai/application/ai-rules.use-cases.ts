import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError, ValidationError } from "@shared/domain/errors";
import { TABLE_ACCESS, isTableAccess, type TableAccess } from "@modules/collections/domain/collections";
import { prisma } from "@shared/infrastructure/prisma/client";
import { ensureDefaultRules, restoreDefaultRules } from "../infrastructure/ai-rules";

/**
 * Reglas de negocio de la IA, editables desde el panel. Las usa el agente en cada respuesta
 * (ver respond-to-message.use-case.ts), así que un cambio aplica desde el siguiente mensaje.
 */

export const AI_RULE_CATEGORIES = ["POLICY", "QUALIFICATION", "HANDOFF", "TONE"] as const;

export const createAiRuleSchema = z.object({
  category: z.enum(AI_RULE_CATEGORIES),
  title: z.string().trim().min(2).max(80),
  content: z.string().trim().min(5).max(1500),
  isActive: z.boolean().optional(),
  /** Opcional: la colección que usa la habilidad (null la quita) y qué puede hacer en ella */
  collectionId: z.string().min(1).nullable().optional(),
  collectionAccess: z.enum(TABLE_ACCESS).nullable().optional(),
});
export type CreateAiRuleInput = z.infer<typeof createAiRuleSchema>;

export const updateAiRuleSchema = createAiRuleSchema.partial().extend({
  position: z.number().int().min(0).max(1000).optional(),
});
export type UpdateAiRuleInput = z.infer<typeof updateAiRuleSchema>;

export interface AiRuleDto {
  id: string;
  category: (typeof AI_RULE_CATEGORIES)[number];
  title: string;
  content: string;
  isActive: boolean;
  position: number;
  isDefault: boolean;
  updatedAt: string;
  table: { id: string; name: string; access: TableAccess } | null;
}

function toDto(r: {
  id: string;
  category: AiRuleDto["category"];
  title: string;
  content: string;
  isActive: boolean;
  position: number;
  systemKey: string | null;
  updatedAt: Date;
  collectionAccess: string | null;
  collection: { id: string; name: string } | null;
}): AiRuleDto {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    content: r.content,
    isActive: r.isActive,
    position: r.position,
    isDefault: r.systemKey !== null,
    updatedAt: r.updatedAt.toISOString(),
    table: r.collection ? { ...r.collection, access: isTableAccess(r.collectionAccess) ? r.collectionAccess : "read" } : null,
  };
}

const WITH_TABLE = { collection: { select: { id: true, name: true } } } as const;

/** La colección tiene que ser del negocio; sin colección no se guarda acceso, y con colección por defecto es consultar. */
async function tableFields(tenantId: string, input: { collectionId?: string | null; collectionAccess?: TableAccess | null }) {
  if (input.collectionId === undefined && input.collectionAccess === undefined) return {};
  if (!input.collectionId) return { collectionId: null, collectionAccess: null };
  const exists = await prisma.collection.findFirst({ where: { id: input.collectionId, tenantId }, select: { id: true } });
  if (!exists) throw new ValidationError("Esa colección no existe");
  return { collectionId: input.collectionId, collectionAccess: input.collectionAccess ?? "read" };
}

async function currentProfile(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { agentProfile: true } });
  if (!tenant) throw new NotFoundError("Negocio no encontrado");
  return tenant.agentProfile;
}

export class ListAiRulesUseCase {
  async execute(): Promise<AiRuleDto[]> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    await ensureDefaultRules(tenantId, await currentProfile(tenantId));
    const rows = await prisma.aiRule.findMany({
      where: { tenantId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: WITH_TABLE,
    });
    return rows.map(toDto);
  }
}

export class CreateAiRuleUseCase {
  async execute(input: CreateAiRuleInput): Promise<AiRuleDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const last = await prisma.aiRule.findFirst({ where: { tenantId }, orderBy: { position: "desc" }, select: { position: true } });
    const { collectionId, collectionAccess, ...rule } = input;
    const created = await prisma.aiRule.create({
      data: { tenantId, ...rule, ...(await tableFields(tenantId, { collectionId, collectionAccess })), position: (last?.position ?? -1) + 1 },
      include: WITH_TABLE,
    });
    return toDto(created);
  }
}

export class UpdateAiRuleUseCase {
  async execute(input: { id: string } & UpdateAiRuleInput): Promise<AiRuleDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const { id, collectionId, collectionAccess, ...data } = input;
    const existing = await prisma.aiRule.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundError("Regla no encontrada");
    return toDto(
      await prisma.aiRule.update({
        where: { id },
        data: { ...data, ...(await tableFields(tenantId, { collectionId, collectionAccess })) },
        include: WITH_TABLE,
      }),
    );
  }
}

export class DeleteAiRuleUseCase {
  async execute(id: string): Promise<void> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const { count } = await prisma.aiRule.deleteMany({ where: { id, tenantId } });
    if (count === 0) throw new NotFoundError("Regla no encontrada");
  }
}

/** Vuelve a crear (o reactiva) las reglas por defecto del perfil actual. No toca las propias del negocio. */
export class RestoreAiRulesUseCase {
  async execute(): Promise<AiRuleDto[]> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    await restoreDefaultRules(tenantId, await currentProfile(tenantId));
    return new ListAiRulesUseCase().execute();
  }
}
