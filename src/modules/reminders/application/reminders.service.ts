import { prisma } from "@shared/infrastructure/prisma/client";
import { NotFoundError, ValidationError } from "@shared/domain/errors";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import { sendProactiveMessage } from "@modules/conversations/application/send-proactive";
import { isGenericClientName } from "@modules/ai/domain/client-memory";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";
import {
  EXPIRE_AFTER_MS,
  FOLLOW_UP_LOOKBACK_MS,
  appointmentReminderDue,
  followUpDue,
  reminderTemplatesFrom,
  renderReminder,
  sendsAutomatically,
  withinAutoHours,
} from "../domain/reminders";

/**
 * Recordatorios de citas, seguimiento a clientes y recordatorios libres (las felicitaciones
 * van aparte, en GreetingsService). Cada 10 minutos la tarea programada:
 * 1. Prepara los recordatorios de las citas del próximo día y descarta los de citas canceladas o movidas.
 * 2. Prepara un seguimiento por cada cliente que dejó de responder (uno solo por silencio).
 * 3. Envía los que ya tocan y pueden salir solos; los demás quedan para aprobar en el panel.
 * 4. Avisa al dueño de las tareas libres que vencieron y descarta lo que nadie aprobó en 3 días.
 */

const TIME_ZONE = "America/Bogota";
const HOUR_MS = 3_600_000;
/** Las citas se preparan con un día de anticipación, para que el asesor alcance a revisarlas. */
const APPOINTMENT_PREPARE_AHEAD_MS = 24 * HOUR_MS;
const BATCH = 200;

function bogotaHour(date: Date): number {
  return Number(date.toLocaleString("en-US", { timeZone: TIME_ZONE, hour: "numeric", hour12: false })) % 24;
}

function shortAgentName(name: string | null): string {
  return name?.split(",")[0]?.trim() || "el equipo";
}

const firstName = (name: string) => (isGenericClientName(name) ? "" : name.split(" ")[0]!);

/** "jueves 29 de octubre" y "3:00 p. m.", en hora de Colombia. */
function appointmentWhen(date: Date): { fecha: string; hora: string } {
  return {
    fecha: date.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE }),
    hora: date.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE }),
  };
}

export interface ReminderRunResult {
  created: number;
  sent: number;
  notified: number;
  expired: number;
}

export interface CreateReminderInput {
  clientId: string;
  dueAt: Date;
  message: string;
  note: string | null;
  autoSend: boolean;
}

export class RemindersService {
  constructor(private readonly whatsapp: WhatsAppProvider) {}

  /** Tarea programada. */
  async run(now = new Date()): Promise<ReminderRunResult> {
    const created = (await this.prepareAppointments(now)) + (await this.prepareFollowUps(now));
    const sent = await this.sendDue(now);
    const notified = await this.notifyTasks(now);
    const expired = await this.expire(now);
    return { created, sent, notified, expired };
  }

  /** Recordatorios de las citas que vienen. Devuelve cuántos se crearon. */
  async prepareAppointments(now: Date, tenantId?: string): Promise<number> {
    // Si la cita se canceló, se hizo o cambió de hora, el recordatorio pendiente ya no aplica
    const pending = await prisma.reminder.findMany({
      where: { kind: "APPOINTMENT", status: "PENDING", ...(tenantId ? { tenantId } : {}) },
      select: { id: true, appointmentAt: true, appointment: { select: { status: true, scheduledAt: true } } },
      take: 1000,
    });
    const stale = pending.filter(
      (r) =>
        !r.appointment ||
        r.appointment.status === "CANCELLED" ||
        r.appointment.status === "DONE" ||
        r.appointment.scheduledAt?.getTime() !== r.appointmentAt?.getTime(),
    );
    if (stale.length > 0) {
      await prisma.reminder.updateMany({
        where: { id: { in: stale.map((r) => r.id) }, status: "PENDING" },
        data: { status: "DISMISSED", error: "La cita se canceló o cambió de hora" },
      });
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: { in: ["REQUESTED", "CONFIRMED"] },
        clientId: { not: null },
        scheduledAt: { gt: new Date(now.getTime() + 2 * HOUR_MS), lte: new Date(now.getTime() + 8 * 24 * HOUR_MS) },
        tenant: { status: "ACTIVE", appointmentReminders: true },
      },
      include: {
        client: { select: { id: true, name: true } },
        listing: { select: { title: true } },
        tenant: { select: { name: true, aiAgentName: true, appointmentReminderHours: true, reminderTemplates: true } },
      },
      take: BATCH,
    });

    let created = 0;
    for (const a of appointments) {
      const dueAt = appointmentReminderDue(a.scheduledAt!, a.tenant.appointmentReminderHours, now);
      if (!dueAt || dueAt.getTime() > now.getTime() + APPOINTMENT_PREPARE_AHEAD_MS) continue;
      const { fecha, hora } = appointmentWhen(a.scheduledAt!);
      const message = renderReminder(reminderTemplatesFrom(a.tenant.reminderTemplates).APPOINTMENT, {
        "{nombre}": firstName(a.client!.name),
        "{negocio}": a.tenant.name,
        "{asesor}": shortAgentName(a.tenant.aiAgentName),
        "{fecha}": fecha,
        "{hora}": hora,
        "{bien}": a.listing ? ` para ver ${a.listing.title}` : "",
      });
      // La restricción única (cita, hora de la cita) evita duplicados si dos procesos corren a la vez
      const result = await prisma.reminder.createMany({
        data: [
          {
            tenantId: a.tenantId,
            clientId: a.client!.id,
            kind: "APPOINTMENT",
            dueAt,
            message,
            appointmentId: a.id,
            appointmentAt: a.scheduledAt,
            note: `Cita del ${fecha} a las ${hora}${a.listing ? ` · ${a.listing.title}` : ""}`,
          },
        ],
        skipDuplicates: true,
      });
      created += result.count;
    }
    return created;
  }

  /** Un seguimiento por cada cliente que dejó de responder. Devuelve cuántos se crearon. */
  async prepareFollowUps(now: Date, tenantId?: string): Promise<number> {
    const tenants = await prisma.tenant.findMany({
      where: { status: "ACTIVE", followUpEnabled: true, ...(tenantId ? { id: tenantId } : {}) },
      select: { id: true, name: true, aiAgentName: true, followUpHours: true, reminderTemplates: true },
    });
    let created = 0;
    for (const tenant of tenants) {
      const conversations = await prisma.conversation.findMany({
        where: {
          tenantId: tenant.id,
          clientId: { not: null },
          status: { in: ["OPEN", "PENDING_REVIEW"] },
          lastMessageAt: {
            lte: new Date(now.getTime() - tenant.followUpHours * HOUR_MS),
            gte: new Date(now.getTime() - tenant.followUpHours * HOUR_MS - FOLLOW_UP_LOOKBACK_MS),
          },
          // Si una persona del equipo tomó la conversación, el seguimiento lo decide ella
          OR: [{ aiPausedUntil: null }, { aiPausedUntil: { lt: now } }],
        },
        include: { client: { select: { id: true, name: true } } },
        take: BATCH,
      });
      const template = reminderTemplatesFrom(tenant.reminderTemplates).FOLLOW_UP;

      for (const c of conversations) {
        const [last, lastInbound] = await Promise.all([
          prisma.message.findFirst({ where: { conversationId: c.id }, orderBy: { sentAt: "desc" }, select: { direction: true, sentAt: true } }),
          prisma.message.findFirst({ where: { conversationId: c.id, direction: "INBOUND" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
        ]);
        if (!last || !lastInbound) continue;
        const due = followUpDue(
          { lastMessageAt: last.sentAt, lastMessageInbound: last.direction === "INBOUND", lastInboundAt: lastInbound.sentAt, hours: tenant.followUpHours },
          now,
        );
        if (!due) continue;
        // (conversación, último mensaje del cliente) es única: un solo seguimiento por silencio,
        // aunque después de enviarlo el último mensaje vuelva a ser del negocio
        const result = await prisma.reminder.createMany({
          data: [
            {
              tenantId: tenant.id,
              clientId: c.client!.id,
              kind: "FOLLOW_UP",
              dueAt: new Date(last.sentAt.getTime() + tenant.followUpHours * HOUR_MS),
              message: renderReminder(template, {
                "{nombre}": firstName(c.client!.name),
                "{negocio}": tenant.name,
                "{asesor}": shortAgentName(tenant.aiAgentName),
              }),
              conversationId: c.id,
              sourceAt: lastInbound.sentAt,
              note: `No responde desde hace ${Math.round((now.getTime() - last.sentAt.getTime()) / HOUR_MS)} horas`,
            },
          ],
          skipDuplicates: true,
        });
        created += result.count;
      }
    }
    return created;
  }

  /** Envía los que ya tocan y pueden salir solos. */
  private async sendDue(now: Date): Promise<number> {
    const due = await prisma.reminder.findMany({
      where: { status: "PENDING", dueAt: { lte: now }, tenant: { status: "ACTIVE" } },
      select: {
        id: true,
        tenantId: true,
        kind: true,
        autoSend: true,
        tenant: { select: { appointmentReminderMode: true, followUpMode: true } },
      },
      orderBy: { dueAt: "asc" },
      take: BATCH,
    });
    const hour = bogotaHour(now);
    let sent = 0;
    for (const r of due) {
      const auto = sendsAutomatically(r, { appointment: r.tenant.appointmentReminderMode, followUp: r.tenant.followUpMode });
      if (!auto || !withinAutoHours(r.kind, hour)) continue;
      const result = await this.send(r.tenantId, r.id, { userId: null }).catch(() => null);
      if (result?.status === "SENT") sent += 1;
    }
    return sent;
  }

  /** Las tareas libres (no salen al cliente) le llegan al dueño por WhatsApp cuando vencen. */
  private async notifyTasks(now: Date): Promise<number> {
    const tasks = await prisma.reminder.findMany({
      where: { kind: "CUSTOM", autoSend: false, status: "PENDING", notifiedAt: null, dueAt: { lte: now } },
      include: { client: { select: { name: true, phone: true } }, tenant: { select: { ownerNotifyPhone: true } } },
      take: BATCH,
    });
    let notified = 0;
    for (const t of tasks) {
      // Se marca primero: si el aviso falla no se reintenta en cada vuelta
      const claim = await prisma.reminder.updateMany({ where: { id: t.id, notifiedAt: null }, data: { notifiedAt: now } });
      if (claim.count === 0 || !t.tenant.ownerNotifyPhone) continue;
      const text = `⏰ Recordatorio: ${t.note || t.message} · ${t.client.name} (${clientPhoneToDisplay(t.client.phone)}). Lo marcas como hecho en el panel → Recordatorios.`;
      await this.whatsapp
        .sendText(t.tenantId, { to: t.tenant.ownerNotifyPhone, text })
        .then(() => (notified += 1))
        .catch((err) => console.warn("[recordatorios] aviso al dueño:", err));
    }
    return notified;
  }

  private async expire(now: Date): Promise<number> {
    const passed = await prisma.reminder.updateMany({
      where: { kind: "APPOINTMENT", status: "PENDING", appointmentAt: { lt: now } },
      data: { status: "DISMISSED", error: "La cita ya pasó" },
    });
    // Las tareas del equipo no vencen: quedan hasta que alguien las marque como hechas
    const old = await prisma.reminder.updateMany({
      where: { status: "PENDING", dueAt: { lt: new Date(now.getTime() - EXPIRE_AFTER_MS) }, NOT: { kind: "CUSTOM", autoSend: false } },
      data: { status: "DISMISSED", error: "Venció sin aprobarse" },
    });
    return passed.count + old.count;
  }

  /** Programa un recordatorio libre. */
  async create(tenantId: string, userId: string | null, input: CreateReminderInput) {
    const client = await prisma.client.findFirst({ where: { id: input.clientId, tenantId }, select: { id: true } });
    if (!client) throw new NotFoundError("Cliente no encontrado");
    if (input.dueAt.getTime() < Date.now() - 5 * 60_000) throw new ValidationError("La fecha del recordatorio ya pasó");
    if (input.autoSend && input.message.trim().length < 2) throw new ValidationError("Escribe el mensaje que le llegará al cliente");
    if (!input.autoSend && !input.note?.trim()) throw new ValidationError("Escribe qué hay que hacer");
    return prisma.reminder.create({
      data: {
        tenantId,
        clientId: client.id,
        kind: "CUSTOM",
        dueAt: input.dueAt,
        message: input.message.trim(),
        note: input.note?.trim() || null,
        autoSend: input.autoSend,
        createdBy: userId,
      },
    });
  }

  /** Envía el mensaje al cliente (el sugerido o el que editó el asesor). */
  async send(
    tenantId: string,
    reminderId: string,
    opts: { userId: string | null; message?: string },
  ): Promise<{ status: "SENT" | "FAILED"; error?: string }> {
    const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, tenantId }, include: { client: true } });
    if (!reminder) throw new NotFoundError("Recordatorio no encontrado");
    const text = (opts.message ?? reminder.message).trim();
    if (!text) throw new ValidationError("El mensaje está vacío");

    // Se "reserva" antes de enviar para que dos clics o dos procesos no lo envíen dos veces
    const claim = await prisma.reminder.updateMany({
      where: { id: reminder.id, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "SENT", message: text, decidedBy: opts.userId, error: null },
    });
    if (claim.count === 0) throw new ValidationError("Este recordatorio ya se envió o se descartó");

    try {
      const { sentAt } = await sendProactiveMessage(this.whatsapp, tenantId, reminder.client, text, opts.userId);
      await prisma.reminder.update({ where: { id: reminder.id }, data: { sentAt } });
      return { status: "SENT" };
    } catch (err) {
      const error = err instanceof Error ? err.message : "No se pudo enviar";
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "FAILED", error } });
      return { status: "FAILED", error };
    }
  }

  /** Tarea del equipo hecha (no se le envía nada al cliente). */
  async complete(tenantId: string, reminderId: string, userId: string | null): Promise<void> {
    const { count } = await prisma.reminder.updateMany({
      where: { id: reminderId, tenantId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "SENT", decidedBy: userId, sentAt: new Date(), error: null },
    });
    if (count === 0) throw new NotFoundError("Recordatorio no encontrado o ya resuelto");
  }

  async dismiss(tenantId: string, reminderId: string, userId: string | null): Promise<void> {
    const { count } = await prisma.reminder.updateMany({
      where: { id: reminderId, tenantId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "DISMISSED", decidedBy: userId },
    });
    if (count === 0) throw new NotFoundError("Recordatorio no encontrado o ya resuelto");
  }
}
