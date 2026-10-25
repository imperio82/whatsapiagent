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
  /** null: usa la espera por defecto del servidor */
  aiReplyDelaySec: number | null;
  businessHours: string | null;
  deliveryInfo: string | null;
  paymentInfo: string | null;
  faq: string | null;
  agentProfile: "RETAIL" | "BROKERAGE";
  matchAlertMode: "APPROVAL" | "AUTO";
  ownerNotifyPhone: string | null;
  advisorAssistant: boolean;
}

type TenantRow = Omit<CurrentTenantDto, "aiAutoReply" | "aiAgentName"> & {
  aiAutoReply: boolean;
  aiAgentName: string | null;
};

export function toCurrentTenantDto(tenant: TenantRow): CurrentTenantDto {
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
    aiReplyDelaySec: tenant.aiReplyDelaySec,
    businessHours: tenant.businessHours,
    deliveryInfo: tenant.deliveryInfo,
    paymentInfo: tenant.paymentInfo,
    faq: tenant.faq,
    agentProfile: tenant.agentProfile,
    matchAlertMode: tenant.matchAlertMode,
    ownerNotifyPhone: tenant.ownerNotifyPhone,
    advisorAssistant: tenant.advisorAssistant,
  };
}

export class GetCurrentTenantUseCase implements UseCase<void, CurrentTenantDto> {
  async execute(): Promise<CurrentTenantDto> {
    const { tenantId } = TenantContext.require();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError("Tenant no encontrado");

    return toCurrentTenantDto(tenant);
  }
}
