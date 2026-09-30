import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { CreateLeadInput, LeadDto, UpdateLeadInput } from "./dtos";

function toDto(l: {
  id: string;
  contactName: string;
  businessName: string | null;
  phone: string;
  address: string | null;
  industry: string | null;
  productInterest: string | null;
  reasonNotBought: string | null;
  stage: string;
  source: string;
  lastContactAt: Date | null;
  createdAt: Date;
  _count: { openers: number };
}): LeadDto {
  return {
    id: l.id,
    contactName: l.contactName,
    businessName: l.businessName,
    phone: l.phone,
    address: l.address,
    industry: l.industry,
    productInterest: l.productInterest,
    reasonNotBought: l.reasonNotBought,
    stage: l.stage as LeadDto["stage"],
    source: l.source,
    lastContactAt: l.lastContactAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    openersCount: l._count.openers,
  };
}

export class ListLeadsUseCase implements UseCase<void, LeadDto[]> {
  async execute(): Promise<LeadDto[]> {
    authorize("leads.read");
    const { tenantId } = TenantContext.require();

    const rows = await prisma.lead.findMany({
      where: { tenantId },
      include: { _count: { select: { openers: true } } },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    return rows.map(toDto);
  }
}

export class CreateLeadUseCase implements UseCase<CreateLeadInput, LeadDto> {
  async execute(input: CreateLeadInput): Promise<LeadDto> {
    authorize("leads.create");
    const { tenantId } = TenantContext.require();

    const phone = input.phone.replace(/\D/g, "");
    const created = await prisma.lead.create({
      data: {
        tenantId,
        contactName: input.contactName.trim(),
        businessName: input.businessName ?? null,
        phone,
        address: input.address ?? null,
        industry: input.industry ?? null,
        productInterest: input.productInterest ?? null,
        reasonNotBought: input.reasonNotBought ?? null,
        stage: "NEW",
        source: "MANUAL",
      },
      include: { _count: { select: { openers: true } } },
    });
    return toDto(created);
  }
}

export class UpdateLeadUseCase implements UseCase<{ id: string } & UpdateLeadInput, LeadDto> {
  async execute(input: { id: string } & UpdateLeadInput): Promise<LeadDto> {
    authorize("leads.update");
    const { tenantId } = TenantContext.require();

    const existing = await prisma.lead.findFirst({ where: { id: input.id, tenantId } });
    if (!existing) throw new NotFoundError("Lead no encontrado");

    const updated = await prisma.lead.update({
      where: { id: input.id },
      data: {
        ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
        ...(input.businessName !== undefined ? { businessName: input.businessName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone.replace(/\D/g, "") } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.industry !== undefined ? { industry: input.industry } : {}),
        ...(input.productInterest !== undefined ? { productInterest: input.productInterest } : {}),
        ...(input.reasonNotBought !== undefined ? { reasonNotBought: input.reasonNotBought } : {}),
        ...(input.stage !== undefined ? { stage: input.stage } : {}),
        ...(input.stage ? { lastContactAt: new Date() } : {}),
      },
      include: { _count: { select: { openers: true } } },
    });
    return toDto(updated);
  }
}
