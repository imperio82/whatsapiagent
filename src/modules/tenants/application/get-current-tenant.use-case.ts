import { NotFoundError } from "@shared/domain/errors";
import { TenantContext } from "@shared/application/tenant-context";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { UseCase } from "@shared/domain/use-case";
import type { AgentPermissions } from "@modules/ai/domain/agent-permissions";

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
  aiAgentRole: string | null;
  aiPersonality: string | null;
  /** Lo guardado; los permisos efectivos se calculan con agentPermissionsFrom según el perfil */
  aiPermissions: AgentPermissions | null;
  businessHours: string | null;
  deliveryInfo: string | null;
  paymentInfo: string | null;
  faq: string | null;
  agentProfile: "RETAIL" | "BROKERAGE";
  matchAlertMode: "APPROVAL" | "AUTO";
  ownerNotifyPhone: string | null;
  advisorAssistant: boolean;
}

type TenantRow = Omit<CurrentTenantDto, "aiAutoReply" | "aiAgentName" | "aiPermissions"> & {
  aiAutoReply: boolean;
  aiAgentName: string | null;
  aiPermissions: unknown;
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
    aiAgentRole: tenant.aiAgentRole,
    aiPersonality: tenant.aiPersonality,
    aiPermissions: (tenant.aiPermissions as AgentPermissions | null) ?? null,
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
