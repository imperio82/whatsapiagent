import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import { switchProfileRules } from "@modules/ai/infrastructure/ai-rules";
import { MAX_REPLY_DELAY_SEC } from "@modules/whatsapp/infrastructure/reply-debouncer";
import { toCurrentTenantDto, type CurrentTenantDto } from "./get-current-tenant.use-case";

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  industry: z.string().max(80).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  taxId: z.string().max(40).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  aiAutoReply: z.boolean().optional(),
  aiAgentName: z.string().max(40).nullable().optional(),
  aiAgentRole: z.string().max(80).nullable().optional(),
  aiPersonality: z.string().max(1500).nullable().optional(),
  aiReplyDelaySec: z.number().int().min(0).max(MAX_REPLY_DELAY_SEC).nullable().optional(),
  businessHours: z.string().max(500).nullable().optional(),
  deliveryInfo: z.string().max(2000).nullable().optional(),
  paymentInfo: z.string().max(1000).nullable().optional(),
  faq: z.string().max(5000).nullable().optional(),
  agentProfile: z.enum(["RETAIL", "BROKERAGE"]).optional(),
  matchAlertMode: z.enum(["APPROVAL", "AUTO"]).optional(),
  advisorAssistant: z.boolean().optional(),
  ownerNotifyPhone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || (v.length >= 10 && v.length <= 15), "El número debe tener indicativo y entre 10 y 15 dígitos")
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export class UpdateTenantUseCase implements UseCase<UpdateTenantInput, CurrentTenantDto> {
  async execute(input: UpdateTenantInput): Promise<CurrentTenantDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();

    const before = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { agentProfile: true } });
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: input,
    });
    // Cada perfil trae sus reglas por defecto (la tienda tutea; la intermediación protege datos del propietario…)
    if (input.agentProfile && before && before.agentProfile !== input.agentProfile) {
      await switchProfileRules(tenantId, input.agentProfile);
    }

    return toCurrentTenantDto(tenant);
  }
}
