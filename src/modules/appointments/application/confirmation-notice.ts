import { prisma } from "@shared/infrastructure/prisma/client";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import type { AIProvider } from "@modules/ai/domain/ports/ai-provider";
import { deliverOrQueue } from "@modules/conversations/application/send-proactive";
import { isGenericClientName } from "@modules/ai/domain/client-memory";
import { VISIT_CONFIRMATION_RULE_KEY } from "@modules/ai/domain/default-rules";
import { ensureDefaultRules } from "@modules/ai/infrastructure/ai-rules";
import { confirmationMessage, needsConfirmationNotice, type AppointmentState } from "../domain/confirmation";
import { draftConfirmation } from "./confirmation-draft";

export type ConfirmationNoticeResult =
  | { status: "sent" }
  | { status: "queued"; reason: string }
  | { status: "skipped" }
  | { status: "failed"; error: string };

/** La habilidad del aviso está encendida (las reglas por defecto se cargan la primera vez). */
export async function confirmationSkillActive(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { agentProfile: true } });
  if (!tenant) return false;
  await ensureDefaultRules(tenantId, tenant.agentProfile);
  const skill = await prisma.aiRule.findUnique({
    where: { tenantId_systemKey: { tenantId, systemKey: VISIT_CONFIRMATION_RULE_KEY } },
    select: { isActive: true },
  });
  return !!skill?.isActive;
}

/**
 * Después de que un asesor confirma o mueve una cita (panel o asistente por WhatsApp), le escribe al
 * cliente. El texto es el que eligió el asesor (opts.text) o lo redacta el agente; sin texto elegido, solo
 * sale si la habilidad del aviso está encendida. Si pasaron las 24 horas de la ventana de WhatsApp, queda
 * pendiente y sale cuando el cliente vuelva a escribir (si la cita no ha pasado).
 * Best-effort: la cita ya quedó guardada; un fallo de envío solo se reporta.
 */
export async function sendConfirmationNotice(
  whatsapp: WhatsAppProvider,
  tenantId: string,
  appointmentId: string,
  before: AppointmentState,
  userId: string | null,
  opts: { text?: string; instructions?: string | null; ai?: AIProvider } = {},
): Promise<ConfirmationNoticeResult> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      listing: { select: { title: true, kind: true } },
      assignedUser: { select: { name: true } },
    },
  });
  if (!appointment?.client || !needsConfirmationNotice(before, appointment)) return { status: "skipped" };
  if (!opts.text && !(await confirmationSkillActive(tenantId))) return { status: "skipped" };

  const scheduledAt = appointment.scheduledAt!;
  const text =
    opts.text?.trim() ||
    (opts.ai
      ? (await draftConfirmation(opts.ai, tenantId, appointment.id, { scheduledAt, instructions: opts.instructions })).text
      : confirmationMessage({
          firstName: isGenericClientName(appointment.client.name) ? "" : appointment.client.name.split(" ")[0]!,
          scheduledAt,
          listing: appointment.listing,
          advisor: appointment.assignedUser?.name ?? null,
          moved: before.status === "CONFIRMED",
        }));
  try {
    const result = await deliverOrQueue(whatsapp, tenantId, appointment.client, text, { userId, source: "cita", expiresAt: scheduledAt });
    return result.status === "sent" ? { status: "sent" } : result;
  } catch (err) {
    const error = err instanceof Error ? err.message : "No se pudo enviar";
    console.warn("[citas] no se pudo avisar la confirmación al cliente:", error);
    return { status: "failed", error };
  }
}
