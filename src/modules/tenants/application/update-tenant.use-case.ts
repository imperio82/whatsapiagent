import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { CurrentTenantDto } from "./get-current-tenant.use-case";

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  industry: z.string().max(80).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  taxId: z.string().max(40).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  aiAutoReply: z.boolean().optional(),
  aiAgentName: z.string().max(40).nullable().optional(),
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

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      industry: tenant.industry,
      address: tenant.address,
      taxId: tenant.taxId,
      description: tenant.description,
      status: tenant.status,
      aiAutoReply: tenant.aiAutoReply,
      aiAgentName: tenant.aiAgentName,
    };
  }
}
