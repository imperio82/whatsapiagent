import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { SchedulingService } from "@modules/integrations/application/scheduling.service";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import { sendConfirmationNotice } from "./confirmation-notice";

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
  /** Aviso de confirmación al cliente: "sent" si salió, o el motivo si falló. Ausente si no aplicaba. */
  clientNotice?: { sent: true } | { sent: false; error: string };
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
    const notice = await sendConfirmationNotice(this.whatsapp, tenantId, id, existing, userId);
    return {
      ...toDto(fresh),
      ...(sync.error ? { calendarError: sync.error } : {}),
      ...(notice.status === "sent" ? { clientNotice: { sent: true } } : {}),
      ...(notice.status === "failed" ? { clientNotice: { sent: false, error: notice.error } } : {}),
    };
  }
}
