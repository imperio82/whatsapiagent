import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";

export interface SendOpenerInput {
  leadId: string;
  openerId: string;
}

export class SendOpenerUseCase implements UseCase<SendOpenerInput, { sentAt: string }> {
  constructor(private readonly whatsapp: WhatsAppProvider) {}

  async execute({ leadId, openerId }: SendOpenerInput): Promise<{ sentAt: string }> {
    authorize("leads.update");
    const { tenantId } = TenantContext.require();

    const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) throw new NotFoundError("Lead no encontrado");

    const opener = await prisma.leadOpener.findFirst({
      where: { id: openerId, leadId },
    });
    if (!opener) throw new NotFoundError("Abridor no encontrado");

    const result = await this.whatsapp.sendText(tenantId, {
      to: lead.phone,
      text: opener.content,
    });

    await prisma.leadOpener.update({
      where: { id: opener.id },
      data: { sentAt: result.sentAt },
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastContactAt: result.sentAt,
        stage: lead.stage === "NEW" ? "CONTACTED" : lead.stage,
      },
    });

    return { sentAt: result.sentAt.toISOString() };
  }
}
