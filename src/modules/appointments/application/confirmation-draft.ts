import { prisma } from "@shared/infrastructure/prisma/client";
import { NotFoundError } from "@shared/domain/errors";
import type { AIProvider } from "@modules/ai/domain/ports/ai-provider";
import { isGenericClientName } from "@modules/ai/domain/client-memory";
import { VISIT_CONFIRMATION_RULE_KEY } from "@modules/ai/domain/default-rules";
import { estimateCostMicroUsd } from "@modules/ai/infrastructure/pricing";
import { aiBudgetExhausted } from "@modules/billing/application/usage";
import { confirmationMessage } from "../domain/confirmation";

/**
 * El aviso de confirmación de una cita, redactado por el agente que atiende al cliente: con su nombre y
 * su tono, lo que diga la habilidad "Avisar al cliente cuando se confirma la cita" (la edita cada negocio),
 * lo que pida el asesor y lo que se habló en la conversación. Los datos (bien, día, hora, asesor) los pone
 * el sistema; la IA solo los redacta. Si la IA falla o el negocio ya gastó su presupuesto, sale la plantilla.
 */

const TIME_ZONE = "America/Bogota";
/** Mensajes recientes de la conversación que ve el agente al redactar */
const RECENT_MESSAGES = 10;

const SYSTEM_RULES = `Escribe UN mensaje de WhatsApp para el cliente avisándole que su cita quedó confirmada (o que cambió de hora).

REGLAS:
- Usa exactamente el día, la hora y el bien que te doy. No inventes direcciones, requisitos, precios ni nada que no esté aquí o en la conversación.
- Breve y natural, como lo escribiría una persona del equipo: de 1 a 3 frases. Trata al cliente como lo hace el negocio en la conversación y en sus indicaciones (tú o usted); nunca voseo.
- Si te doy el nombre del cliente, salúdalo por su nombre; si no, saluda sin nombre.
- Sigue las indicaciones del negocio y del asesor, si las hay.
- Máximo un emoji.

FORMATO: devuelve solo el texto del mensaje, sin comillas ni explicaciones.`;

export interface ConfirmationDraft {
  text: string;
  /** false: la IA no estaba disponible y salió la plantilla */
  aiDrafted: boolean;
}

export async function draftConfirmation(
  ai: AIProvider,
  tenantId: string,
  appointmentId: string,
  opts: { scheduledAt: Date; instructions?: string | null },
): Promise<ConfirmationDraft> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    include: {
      client: { select: { id: true, name: true } },
      listing: { select: { title: true, kind: true, city: true, zone: true } },
      assignedUser: { select: { name: true } },
      tenant: { select: { id: true, plan: true, name: true, aiAgentName: true, aiAgentRole: true, aiPersonality: true } },
    },
  });
  if (!appointment?.client) throw new NotFoundError("Cita no encontrada o sin cliente");

  const firstName = isGenericClientName(appointment.client.name) ? "" : appointment.client.name.split(" ")[0]!;
  const moved = appointment.status === "CONFIRMED" && appointment.scheduledAt?.getTime() !== opts.scheduledAt.getTime();
  const template = confirmationMessage({
    firstName,
    scheduledAt: opts.scheduledAt,
    listing: appointment.listing,
    advisor: appointment.assignedUser?.name ?? null,
    moved,
  });

  const { tenant } = appointment;
  if (await aiBudgetExhausted(tenant).catch(() => true)) return { text: template, aiDrafted: false };

  const [skill, conversation] = await Promise.all([
    prisma.aiRule.findUnique({
      where: { tenantId_systemKey: { tenantId, systemKey: VISIT_CONFIRMATION_RULE_KEY } },
      select: { content: true, isActive: true },
    }),
    prisma.conversation.findFirst({
      where: { tenantId, clientId: appointment.client.id },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true,
        messages: { where: { type: "TEXT" }, orderBy: { sentAt: "desc" }, take: RECENT_MESSAGES, select: { direction: true, content: true } },
      },
    }),
  ]);

  const when = {
    day: opts.scheduledAt.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE }),
    hour: opts.scheduledAt.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE }),
  };
  const listing = appointment.listing;
  const identity = [
    `Eres ${tenant.aiAgentName?.split(",")[0]?.trim() || "parte del equipo"}${tenant.aiAgentRole ? `, ${tenant.aiAgentRole}` : ""} de ${tenant.name}.`,
    tenant.aiPersonality ? `Tu forma de ser: ${tenant.aiPersonality}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const history = (conversation?.messages ?? [])
    .reverse()
    .filter((m) => m.content.trim())
    .map((m) => `${m.direction === "INBOUND" ? "Cliente" : "Negocio"}: ${m.content.slice(0, 300)}`)
    .join("\n");
  const prompt = [
    "DATOS DE LA CITA:",
    `- ${listing ? (listing.kind === "VEHICLE" ? `Prueba de manejo del ${listing.title}` : `Visita: ${listing.title}`) : "Cita con el asesor"}`,
    listing ? `- Ubicación del bien: ${[listing.zone, listing.city].filter(Boolean).join(", ")}` : null,
    `- Día: ${when.day}`,
    `- Hora: ${when.hour}`,
    moved ? "- La cita ya estaba confirmada y se cambió a esta nueva hora." : null,
    appointment.assignedUser ? `- Lo atiende: ${appointment.assignedUser.name.split(" ")[0]}` : null,
    `- Nombre del cliente: ${firstName || "no se sabe (saluda sin nombre)"}`,
    skill?.isActive && skill.content.trim() ? `\nINDICACIONES DEL NEGOCIO:\n${skill.content.trim()}` : null,
    opts.instructions?.trim() ? `\nINDICACIONES DEL ASESOR PARA ESTE MENSAJE:\n${opts.instructions.trim()}` : null,
    history ? `\nCONVERSACIÓN RECIENTE (para el contexto; no repitas lo que ya se dijo):\n${history}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await ai.chat({
      systemPrompt: `${identity}\n\n${SYSTEM_RULES}`,
      messages: [{ role: "user", content: prompt }],
      tools: [],
      maxToolSteps: 0,
    });
    await prisma.aiUsageLog
      .create({
        data: {
          tenantId,
          conversationId: conversation?.id ?? `cita:${appointment.id}`,
          provider: ai.kind,
          model: result.model,
          tokensIn: result.tokensIn,
          cachedTokensIn: result.cachedTokensIn ?? 0,
          tokensOut: result.tokensOut,
          toolCalls: 0,
          costMicroUsd: estimateCostMicroUsd(result.model, result.tokensIn, result.tokensOut, result.cachedTokensIn),
          intent: "confirmacion",
        },
      })
      .catch((err) => console.error("[citas] no se pudo registrar el uso de IA:", err));
    const text = result.text.trim().replace(/^["“]|["”]$/g, "").trim();
    return text ? { text, aiDrafted: true } : { text: template, aiDrafted: false };
  } catch (err) {
    console.warn("[citas] la IA no pudo redactar la confirmación; sale la plantilla:", err);
    return { text: template, aiDrafted: false };
  }
}
