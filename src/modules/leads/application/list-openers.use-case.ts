import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";

export interface OpenerDto {
  id: string;
  content: string;
  generatedBy: string;
  sentAt: string | null;
  responded: boolean;
  convertedAt: string | null;
  createdAt: string;
}

export class ListOpenersUseCase implements UseCase<{ leadId: string }, OpenerDto[]> {
  async execute({ leadId }: { leadId: string }): Promise<OpenerDto[]> {
    authorize("leads.read");
    const { tenantId } = TenantContext.require();

    const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) throw new NotFoundError("Lead no encontrado");

    const rows = await prisma.leadOpener.findMany({
      where: { leadId },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((o) => ({
      id: o.id,
      content: o.content,
      generatedBy: o.generatedBy,
      sentAt: o.sentAt?.toISOString() ?? null,
      responded: o.responded,
      convertedAt: o.convertedAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    }));
  }
}
