import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import { toCurrentTenantDto, type CurrentTenantDto } from "./get-current-tenant.use-case";

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  industry: z.string().max(80).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  taxId: z.string().max(40).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  aiAutoReply: z.boolean().optional(),
  aiAgentName: z.string().max(40).nullable().optional(),
  businessHours: z.string().max(500).nullable().optional(),
  deliveryInfo: z.string().max(2000).nullable().optional(),
  paymentInfo: z.string().max(1000).nullable().optional(),
  faq: z.string().max(5000).nullable().optional(),
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export class UpdateTenantUseCase implements UseCase<UpdateTenantInput, CurrentTenantDto> {
  async execute(input: UpdateTenantInput): Promise<CurrentTenantDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: input,
    });

    return toCurrentTenantDto(tenant);
  }
}
