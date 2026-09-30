import { z } from "zod";
import { InfrastructureError } from "@shared/domain/errors";
import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { getAIProvider } from "@modules/ai/infrastructure/provider-factory";
import {
  createLeadSchema,
  updateLeadSchema,
  type LeadDto,
} from "../application/dtos";
import {
  CreateLeadUseCase,
  ListLeadsUseCase,
  UpdateLeadUseCase,
} from "../application/use-cases";
import {
  GenerateOpenerUseCase,
  type GeneratedOpenerDto,
} from "../application/generate-opener.use-case";
import { ListOpenersUseCase, type OpenerDto } from "../application/list-openers.use-case";
import { SendOpenerUseCase } from "../application/send-opener.use-case";

const generateOpenerSchema = z.object({
  tone: z.enum(["amable", "directo", "consultivo", "promocional"]).optional(),
  variants: z.number().int().min(1).max(5).optional(),
});

export class LeadsController {
  private readonly list = new ListLeadsUseCase();
  private readonly create = new CreateLeadUseCase();
  private readonly update = new UpdateLeadUseCase();
  private readonly listOpeners = new ListOpenersUseCase();
  private readonly sendOpener = new SendOpenerUseCase(getWhatsAppProvider());

  listLeads(): Promise<LeadDto[]> {
    return this.list.execute();
  }

  createLead(body: unknown): Promise<LeadDto> {
    return this.create.execute(createLeadSchema.parse(body));
  }

  updateLead(id: string, body: unknown): Promise<LeadDto> {
    const input = updateLeadSchema.parse(body);
    return this.update.execute({ id, ...input });
  }

  listLeadOpeners(leadId: string): Promise<OpenerDto[]> {
    return this.listOpeners.execute({ leadId });
  }

  generateOpeners(leadId: string, body: unknown): Promise<GeneratedOpenerDto[]> {
    if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
      throw new InfrastructureError(
        "Falta configurar OPENAI_API_KEY o GEMINI_API_KEY en el server",
      );
    }
    const input = generateOpenerSchema.parse(body);
    const uc = new GenerateOpenerUseCase(getAIProvider());
    return uc.execute({ leadId, ...input });
  }

  sendOpenerByLead(leadId: string, openerId: string): Promise<{ sentAt: string }> {
    return this.sendOpener.execute({ leadId, openerId });
  }
}
