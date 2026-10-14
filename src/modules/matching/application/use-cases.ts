import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { MatchingService, MatchRunResult } from "./matching.service";

export const MATCH_STATUSES = ["PENDING", "SENT", "DISMISSED", "FAILED"] as const;
export type MatchStatusValue = (typeof MATCH_STATUSES)[number];

export const sendMatchSchema = z.object({ message: z.string().trim().min(5).max(1000).optional() });

export interface MatchDto {
  id: string;
  status: MatchStatusValue;
  score: number;
  reasons: string;
  message: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  listing: { id: string; code: string; title: string; priceCop: number; city: string; zone: string | null; photo: string | null };
  buyer: {
    leadId: string;
    name: string;
    phone: string;
    temperature: "HOT" | "WARM" | "COLD" | null;
    wants: string | null;
  };
}

export class ListMatchesUseCase {
  async execute(status?: MatchStatusValue): Promise<MatchDto[]> {
    authorize("leads.read");
    const { tenantId } = TenantContext.require();
    const rows = await prisma.listingMatch.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: { listing: true, lead: { include: { client: { select: { name: true } } } } },
      orderBy: [{ createdAt: "desc" }, { score: "desc" }],
      take: 300,
    });
    return rows.map((m) => {
      const q = m.lead.qualification as Record<string, unknown> | null;
      return {
        id: m.id,
        status: m.status,
        score: m.score,
        reasons: m.reasons,
        message: m.message,
        error: m.error,
        sentAt: m.sentAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        listing: {
          id: m.listing.id,
          code: m.listing.code,
          title: m.listing.title,
          priceCop: Number(m.listing.priceCop),
          city: m.listing.city,
          zone: m.listing.zone,
          photo: m.listing.photos[0] ?? null,
        },
        buyer: {
          leadId: m.lead.id,
          name: m.lead.client?.name ?? m.lead.contactName,
          phone: m.lead.phone,
          temperature: m.lead.temperature,
          wants: typeof q?.busca === "string" ? q.busca : m.lead.productInterest,
        },
      };
    });
  }
}

export class SendMatchUseCase {
  constructor(private readonly matching: MatchingService) {}

  async execute(id: string, input: z.infer<typeof sendMatchSchema>) {
    authorize("leads.update");
    const { tenantId, userId } = TenantContext.require();
    return this.matching.send(tenantId, id, { userId, message: input.message });
  }
}

export class DismissMatchUseCase {
  constructor(private readonly matching: MatchingService) {}

  async execute(id: string): Promise<void> {
    authorize("leads.update");
    const { tenantId, userId } = TenantContext.require();
    await this.matching.dismiss(tenantId, id, userId);
  }
}

/** "Buscar compradores" desde el inventario: vuelve a cruzar el bien con los compradores. */
export class RunListingMatchesUseCase {
  constructor(private readonly matching: MatchingService) {}

  async execute(listingId: string): Promise<MatchRunResult> {
    authorize("leads.read");
    const { tenantId } = TenantContext.require();
    return this.matching.findMatchesForListing(tenantId, listingId);
  }
}
