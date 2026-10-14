import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { Prisma } from "@prisma/client";
import type { CreateLeadInput, LeadDto, UpdateLeadInput } from "./dtos";

const include = {
  _count: { select: { openers: true } },
  listing: { select: { id: true, code: true, title: true, priceCop: true } },
} as const;

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
  leadType: LeadDto["leadType"];
  temperature: LeadDto["temperature"];
  qualification: Prisma.JsonValue | null;
  aiSummary: string | null;
  offerCop: bigint | null;
  listing: { id: string; code: string; title: string; priceCop: bigint } | null;
  searchKind: LeadDto["searchKind"];
  searchOperation: LeadDto["searchOperation"];
  budgetMaxCop: bigint | null;
  searchCity: string | null;
}): LeadDto {
  const q = l.qualification;
  const qualification =
    q && typeof q === "object" && !Array.isArray(q) ? Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)])) : {};
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
    leadType: l.leadType,
    temperature: l.temperature,
    qualification,
    aiSummary: l.aiSummary,
    offerCop: l.offerCop === null ? null : Number(l.offerCop),
    listing: l.listing ? { ...l.listing, priceCop: Number(l.listing.priceCop) } : null,
    searchKind: l.searchKind,
    searchOperation: l.searchOperation,
    budgetMaxCop: l.budgetMaxCop === null ? null : Number(l.budgetMaxCop),
    searchCity: l.searchCity,
  };
}

export class ListLeadsUseCase implements UseCase<void, LeadDto[]> {
  async execute(): Promise<LeadDto[]> {
    authorize("leads.read");
    const { tenantId } = TenantContext.require();

    const rows = await prisma.lead.findMany({
      where: { tenantId },
      include,
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
      include,
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
        ...(input.searchKind !== undefined ? { searchKind: input.searchKind } : {}),
        ...(input.searchOperation !== undefined ? { searchOperation: input.searchOperation } : {}),
        ...(input.budgetMaxCop !== undefined ? { budgetMaxCop: input.budgetMaxCop === null ? null : BigInt(input.budgetMaxCop) } : {}),
        ...(input.searchCity !== undefined ? { searchCity: input.searchCity || null } : {}),
      },
      include,
    });
    return toDto(updated);
  }
}
