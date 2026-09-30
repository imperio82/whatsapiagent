import { NotFoundError } from "@shared/domain/errors";
import { TenantContext } from "@shared/application/tenant-context";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { UseCase } from "@shared/domain/use-case";

export interface CurrentTenantDto {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  address: string | null;
  taxId: string | null;
  description: string | null;
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
  aiAutoReply?: boolean;
  aiAgentName?: string | null;
}

export class GetCurrentTenantUseCase implements UseCase<void, CurrentTenantDto> {
  async execute(): Promise<CurrentTenantDto> {
    const { tenantId } = TenantContext.require();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError("Tenant no encontrado");

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
