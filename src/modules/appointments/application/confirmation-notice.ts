import { prisma } from "@shared/infrastructure/prisma/client";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import { sendProactiveMessage } from "@modules/conversations/application/send-proactive";
import { isGenericClientName } from "@modules/ai/domain/client-memory";
import { VISIT_CONFIRMATION_RULE_KEY } from "@modules/ai/domain/default-rules";
import { ensureDefaultRules } from "@modules/ai/infrastructure/ai-rules";
import { confirmationMessage, needsConfirmationNotice, type AppointmentState } from "../domain/confirmation";

export type ConfirmationNoticeResult =
  | { status: "sent" }
  | { status: "skipped" }
  | { status: "failed"; error: string };

/**
 * Después de que un asesor confirma o mueve una cita (panel o asistente por WhatsApp), le escribe
 * al cliente con el bien, el día y la hora, si la habilidad del aviso está encendida.
 * Best-effort: la cita ya quedó guardada; un fallo de envío solo se reporta.
 */
export async function sendConfirmationNotice(
  whatsapp: WhatsAppProvider,
  tenantId: string,
  appointmentId: string,
  before: AppointmentState,
  userId: string | null,
): Promise<ConfirmationNoticeResult> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      listing: { select: { title: true, kind: true } },
      assignedUser: { select: { name: true } },
      tenant: { select: { agentProfile: true } },
    },
  });
  if (!appointment?.client || !needsConfirmationNotice(before, appointment)) return { status: "skipped" };

  // Las reglas por defecto se cargan la primera vez; sin la fila (el negocio la borró) no hay aviso
  await ensureDefaultRules(tenantId, appointment.tenant.agentProfile);
  const skill = await prisma.aiRule.findUnique({
    where: { tenantId_systemKey: { tenantId, systemKey: VISIT_CONFIRMATION_RULE_KEY } },
    select: { isActive: true },
  });
  if (!skill?.isActive) return { status: "skipped" };

  const text = confirmationMessage({
    firstName: isGenericClientName(appointment.client.name) ? "" : appointment.client.name.split(" ")[0]!,
    scheduledAt: appointment.scheduledAt!,
    listing: appointment.listing,
    advisor: appointment.assignedUser?.name ?? null,
    moved: before.status === "CONFIRMED",
  });
  try {
    await sendProactiveMessage(whatsapp, tenantId, appointment.client, text, userId);
    return { status: "sent" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "No se pudo enviar";
    console.warn("[citas] no se pudo avisar la confirmación al cliente:", error);
    return { status: "failed", error };
  }
}
