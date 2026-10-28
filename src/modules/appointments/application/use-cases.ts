import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError, ValidationError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { SchedulingService } from "@modules/integrations/application/scheduling.service";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import type { AIProvider } from "@modules/ai/domain/ports/ai-provider";
import { clientWindow } from "@modules/conversations/application/send-proactive";
import { windowClosedReason } from "@modules/conversations/domain/messaging-window";
import { confirmationSkillActive, sendConfirmationNotice } from "./confirmation-notice";
import { draftConfirmation } from "./confirmation-draft";

/**
 * Visitas y pruebas de manejo que la IA deja como solicitud. Un asesor las confirma con fecha
 * y hora, o las cancela. Usa los permisos de leads: son parte del seguimiento del comprador.
 */

export const APPOINTMENT_STATUSES = ["REQUESTED", "CONFIRMED", "DONE", "CANCELLED"] as const;
export type AppointmentStatusValue = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatusValue, string> = {
  REQUESTED: "Por confirmar",
  CONFIRMED: "Confirmada",
  DONE: "Realizada",
  CANCELLED: "Cancelada",
};

export const updateAppointmentSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  /** Aviso al cliente al confirmar o mover: el texto que eligió el asesor, o no avisar. Sin esto, lo redacta el agente. */
  notice: z
    .object({ mode: z.enum(["send", "none"]), text: z.string().trim().min(1).max(1000).optional() })
    .optional(),
});
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export interface AppointmentDto {
  id: string;
  status: AppointmentStatusValue;
  requestedSlot: string;
  scheduledAt: string | null;
  notes: string | null;
  client: { id: string; name: string; phone: string } | null;
  listing: { id: string; code: string; title: string; kind: "VEHICLE" | "PROPERTY" | "OTHER" } | null;
  /** Enlace al evento en el calendario conectado, si la cita está agendada allí. */
  calendarEventUrl: string | null;
  /** Asesor que atiende la cita (dueño del calendario donde quedó). */
  advisor: { id: string; name: string } | null;
  /** Si el cambio no se pudo llevar al calendario, el motivo (la cita igual quedó guardada). */
  calendarError?: string;
  /**
   * Aviso de confirmación al cliente: salió, quedó pendiente hasta que el cliente escriba (ventana de 24 horas
   * cerrada) o el motivo si falló. Ausente si no aplicaba.
   */
  clientNotice?: { sent: true } | { sent: false; queued: true; reason: string } | { sent: false; error: string };
  createdAt: string;
}

const include = {
  client: { select: { id: true, name: true, phone: true } },
  listing: { select: { id: true, code: true, title: true, kind: true } },
  assignedUser: { select: { id: true, name: true } },
} as const;

function toDto(a: {
  id: string;
  status: AppointmentStatusValue;
  requestedSlot: string;
  scheduledAt: Date | null;
  notes: string | null;
  calendarEventUrl: string | null;
  createdAt: Date;
  assignedUser: AppointmentDto["advisor"];
  client: AppointmentDto["client"];
  listing: AppointmentDto["listing"];
}): AppointmentDto {
  return {
    id: a.id,
    status: a.status,
    requestedSlot: a.requestedSlot,
    scheduledAt: a.scheduledAt?.toISOString() ?? null,
    notes: a.notes,
    client: a.client,
    listing: a.listing,
    calendarEventUrl: a.calendarEventUrl,
    advisor: a.assignedUser,
    createdAt: a.createdAt.toISOString(),
  };
}

export class ListAppointmentsUseCase {
  async execute(): Promise<AppointmentDto[]> {
    authorize("leads.read");
    const { tenantId } = TenantContext.require();
    const rows = await prisma.appointment.findMany({
      where: { tenantId },
      include,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 300,
    });
    return rows.map(toDto);
  }
}

export class UpdateAppointmentUseCase {
  constructor(
    private readonly whatsapp: WhatsAppProvider,
    private readonly ai: AIProvider,
    private readonly scheduling = new SchedulingService(),
  ) {}

  async execute(id: string, input: UpdateAppointmentInput): Promise<AppointmentDto> {
    authorize("leads.update");
    const { tenantId, userId } = TenantContext.require();
    const existing = await prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundError("Cita no encontrada");
    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include,
    });
    // Confirmar, mover o cancelar en el panel se refleja en el calendario conectado
    const touchesCalendar = input.status !== undefined || input.scheduledAt !== undefined;
    const sync = touchesCalendar ? await this.scheduling.syncFromPanel(tenantId, id) : { synced: false };
    const fresh = sync.synced ? await prisma.appointment.findUniqueOrThrow({ where: { id }, include }) : updated;
    const notice =
      input.notice?.mode === "none"
        ? ({ status: "skipped" } as const)
        : await sendConfirmationNotice(this.whatsapp, tenantId, id, existing, userId, {
            text: input.notice?.text,
            ai: this.ai,
          });
    return {
      ...toDto(fresh),
      ...(sync.error ? { calendarError: sync.error } : {}),
      ...(notice.status === "sent" ? { clientNotice: { sent: true } } : {}),
      ...(notice.status === "queued" ? { clientNotice: { sent: false, queued: true, reason: notice.reason } } : {}),
      ...(notice.status === "failed" ? { clientNotice: { sent: false, error: notice.error } } : {}),
    };
  }
}

export const noticeDraftSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }),
  instructions: z.string().trim().max(500).nullable().optional(),
});

export interface NoticeDraftDto {
  text: string;
  /** false: la IA no estaba disponible y es la plantilla */
  aiDrafted: boolean;
  /** La habilidad del aviso está encendida: por defecto se avisa */
  skillActive: boolean;
  /** Ventana de 24 horas de WhatsApp: si está cerrada, el aviso queda pendiente hasta que el cliente escriba */
  window: { open: boolean; reason: string | null };
}

/** Antes de confirmar: el mensaje que redacta el agente para que el asesor lo revise o lo cambie. */
export class DraftAppointmentNoticeUseCase {
  constructor(
    private readonly whatsapp: WhatsAppProvider,
    private readonly ai: AIProvider,
  ) {}

  async execute(id: string, input: z.infer<typeof noticeDraftSchema>): Promise<NoticeDraftDto> {
    authorize("leads.update");
    const { tenantId } = TenantContext.require();
    const appointment = await prisma.appointment.findFirst({ where: { id, tenantId }, select: { clientId: true } });
    if (!appointment) throw new NotFoundError("Cita no encontrada");
    if (!appointment.clientId) throw new ValidationError("La cita no tiene un cliente de WhatsApp");
    const [draft, skillActive, window] = await Promise.all([
      draftConfirmation(this.ai, tenantId, id, { scheduledAt: new Date(input.scheduledAt), instructions: input.instructions }),
      confirmationSkillActive(tenantId),
      clientWindow(this.whatsapp, tenantId, appointment.clientId),
    ]);
    return { ...draft, skillActive, window: { open: window.open, reason: window.open ? null : windowClosedReason(window.lastInboundAt) } };
  }
}
