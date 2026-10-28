import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { InfrastructureError, NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { AIProvider } from "@modules/ai/domain/ports/ai-provider";

export interface GenerateOpenerInput {
  leadId: string;
  /** Tono opcional para guiar el estilo del abridor. */
  tone?: "amable" | "directo" | "consultivo" | "promocional";
  /** Variantes a generar (default 3). */
  variants?: number;
}

export interface GeneratedOpenerDto {
  id: string;
  content: string;
}

const SYSTEM_PROMPT = `Eres experto en mensajes en frío por WhatsApp para captar leads B2B y B2C.

REGLAS:
- Mensajes BREVES (máximo 2 oraciones, ideal 1).
- Tono humano, NO de bot. Nada de "Estimado/a".
- Personaliza con los datos del lead, NO inventes datos.
- Haz UNA pregunta concreta al final para generar respuesta.
- No vendas en el primer mensaje, despierta curiosidad.
- Sin emojis excesivos (máximo uno si encaja).
- Español de Colombia, trato de usted, cordial y profesional (nunca voseo: nada de "tenés", "podés", "querés").

FORMATO: devuelve SOLO el texto del mensaje. Sin comillas, sin prefacio, sin firma.`;

export class GenerateOpenerUseCase
  implements UseCase<GenerateOpenerInput, GeneratedOpenerDto[]>
{
  constructor(private readonly ai: AIProvider) {}

  async execute(input: GenerateOpenerInput): Promise<GeneratedOpenerDto[]> {
    authorize("leads.update");
    const { tenantId } = TenantContext.require();

    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, tenantId } });
    if (!lead) throw new NotFoundError("Lead no encontrado");

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new InfrastructureError("Tenant no encontrado");

    const tone = input.tone ?? "amable";
    const variants = Math.min(Math.max(input.variants ?? 3, 1), 5);

    const userPrompt = [
      `Negocio que escribe: ${tenant.name}${tenant.industry ? ` (${tenant.industry})` : ""}.`,
      tenant.description ? `Descripción del negocio: ${tenant.description}.` : null,
      "",
      "Lead a contactar:",
      `- Contacto: ${lead.contactName}`,
      lead.businessName ? `- Negocio del lead: ${lead.businessName}` : null,
      lead.industry ? `- Rubro del lead: ${lead.industry}` : null,
      lead.productInterest ? `- Producto/servicio de interés: ${lead.productInterest}` : null,
      lead.reasonNotBought
        ? `- Motivo por el que no compró antes: ${lead.reasonNotBought}`
        : null,
      "",
      `Genera ${variants} versiones distintas de abridor para enviar por WhatsApp, en tono ${tone}.`,
      `Devuelve UNA POR LÍNEA, sin numerar, sin viñetas. Solo el texto.`,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.ai.chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      tools: [],
      maxToolSteps: 0,
    });

    const lines = result.text
      .split("\n")
      .map((l) => l.replace(/^[\d).\-•·\s"']+/, "").replace(/["']$/, "").trim())
      .filter((l) => l.length > 0)
      .slice(0, variants);

    if (lines.length === 0) {
      throw new InfrastructureError("La IA no devolvió variantes válidas");
    }

    const created = await prisma.$transaction(
      lines.map((content) =>
        prisma.leadOpener.create({
          data: { leadId: lead.id, content, generatedBy: "ai" },
        }),
      ),
    );

    return created.map((o) => ({ id: o.id, content: o.content }));
  }
}
