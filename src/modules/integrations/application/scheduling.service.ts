import { prisma } from "@shared/infrastructure/prisma/client";
import { canBook, formatSlot, freeSlots, isValidDay, localDay, zonedToUtc } from "../domain/agenda";
import type { TimeInterval } from "../domain/ports/calendar-provider";
import { resolveCalendarById, resolveCalendars, type ConnectedCalendar } from "../infrastructure/registry";

/**
 * Agenda de citas sobre los calendarios conectados. Lo usan el agente (consultar espacios y
 * agendar) y el panel (cuando el asesor confirma, mueve o cancela una cita).
 *
 * Con varios asesores: un horario se ofrece si al menos uno está libre, y la cita se asigna al
 * asesor libre con menos citas próximas (reparto parejo). Si la cita se mueve y su asesor sigue
 * libre a la nueva hora, se queda con él. No sabe qué proveedor hay detrás.
 */

export interface CalendarDirectory {
  /** Calendarios donde se puede agendar ahora. */
  list(tenantId: string): Promise<ConnectedCalendar[]>;
  /** El calendario donde quedó un evento (aunque su asesor ya no reciba visitas). */
  byId(tenantId: string, integrationId: string): Promise<ConnectedCalendar | null>;
}

const defaultDirectory: CalendarDirectory = { list: resolveCalendars, byId: resolveCalendarById };

export interface SlotOption {
  /** Hora local "2026-10-16T15:00" que el modelo devuelve tal cual para agendar. */
  start: string;
  label: string;
}

export type AvailabilityResult =
  | { connected: false }
  | { connected: true; day: string; slots: SlotOption[]; nextDays: { day: string; slots: SlotOption[] }[] };

export type BookResult =
  | { ok: true; scheduledAt: Date; label: string; eventUrl: string | null; advisor: string | null }
  | {
      ok: false;
      reason: "sin_calendario" | "fecha_invalida" | "dia_no_habil" | "fuera_de_horario" | "muy_pronto" | "ocupado" | "error_calendario";
      alternatives: SlotOption[];
      detail?: string;
    };

const DAY_MS = 86_400_000;
const LOCAL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/;
const MAX_OPTIONS = 6;
/** Las citas se ofrecen en la zona del primer calendario (todos los del negocio deberían coincidir). */
const zoneOf = (calendars: ConnectedCalendar[]) => calendars[0]!.agenda.timeZone;

function toOption(start: Date, tz: string): SlotOption {
  const day = localDay(start, tz);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start);
  return { start: `${day}T${time}`, label: formatSlot(start, tz) };
}

/** "2026-10-16T15:00" (hora local del negocio) → instante. Acepta también ISO con zona. */
export function parseLocalDateTime(value: string, tz: string): Date | null {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = LOCAL_DATETIME_RE.exec(value.trim());
  if (!m || !isValidDay(m[1]!)) return null;
  try {
    return zonedToUtc(m[1]!, m[2]!, tz);
  } catch {
    return null;
  }
}

/** Une los espacios libres de varios calendarios: un horario sirve si al menos uno está libre. */
function mergedSlots(day: string, busyByCalendar: Map<string, TimeInterval[]>, calendars: ConnectedCalendar[], now: Date): Date[] {
  const starts = new Map<number, Date>();
  for (const c of calendars) {
    for (const s of freeSlots(day, busyByCalendar.get(c.integrationId) ?? [], c.agenda, now)) starts.set(s.start.getTime(), s.start);
  }
  return [...starts.values()].sort((a, b) => a.getTime() - b.getTime());
}

export class SchedulingService {
  constructor(
    private readonly directory: CalendarDirectory = defaultDirectory,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async isConnected(tenantId: string): Promise<boolean> {
    return (await this.directory.list(tenantId)).length > 0;
  }

  /** Ocupado de cada calendario en un rango. Si un calendario falla, se ignora (los demás siguen sirviendo). */
  private async busyOf(calendars: ConnectedCalendar[], from: Date, to: Date): Promise<Map<string, TimeInterval[]>> {
    const result = new Map<string, TimeInterval[]>();
    const answers = await Promise.allSettled(calendars.map((c) => c.calendar.busy(c.agenda.calendarId, from, to)));
    answers.forEach((a, i) => {
      if (a.status === "fulfilled") result.set(calendars[i]!.integrationId, a.value);
      else console.warn(`[scheduling] no se pudo leer el calendario de ${calendars[i]!.label}:`, a.reason);
    });
    if (result.size === 0 && calendars.length > 0) throw new Error("No se pudo leer ningún calendario");
    return result;
  }

  /** Espacios libres del día pedido y, si hay pocos, de los siguientes días hábiles. */
  async availability(tenantId: string, day: string): Promise<AvailabilityResult> {
    const all = await this.directory.list(tenantId);
    if (all.length === 0) return { connected: false };
    const tz = zoneOf(all);
    const today = localDay(this.now(), tz);
    const start = isValidDay(day) && day >= today ? day : today;

    // Una sola consulta de ocupación por calendario para el día pedido y la semana siguiente
    const from = zonedToUtc(start, "00:00", tz);
    const busy = await this.busyOf(all, from, new Date(from.getTime() + 8 * DAY_MS));
    const calendars = all.filter((c) => busy.has(c.integrationId));

    const slotsOf = (d: string) => mergedSlots(d, busy, calendars, this.now()).map((s) => toOption(s, tz));
    const slots = slotsOf(start);
    const nextDays: { day: string; slots: SlotOption[] }[] = [];
    if (slots.length < 3) {
      for (let i = 1; i <= 7 && nextDays.length < 2; i++) {
        const d = localDay(new Date(from.getTime() + i * DAY_MS + 12 * 3_600_000), tz);
        const s = slotsOf(d);
        if (s.length > 0) nextDays.push({ day: d, slots: s.slice(0, MAX_OPTIONS) });
      }
    }
    return { connected: true, day: start, slots: slots.slice(0, MAX_OPTIONS * 2), nextDays };
  }

  /**
   * Agenda (o mueve) una cita a una hora exacta, la asigna a un asesor libre y la deja CONFIRMADA.
   * Si no se puede, devuelve el motivo y otros horarios libres.
   */
  async book(tenantId: string, appointmentId: string, when: string | Date): Promise<BookResult> {
    const all = await this.directory.list(tenantId);
    if (all.length === 0) return { ok: false, reason: "sin_calendario", alternatives: [] };
    const tz = zoneOf(all);

    const start = when instanceof Date ? when : parseLocalDateTime(when, tz);
    if (!start) return { ok: false, reason: "fecha_invalida", alternatives: [] };

    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: { client: true, listing: true },
    });
    if (!appointment) return { ok: false, reason: "fecha_invalida", alternatives: [], detail: "cita no encontrada" };

    const day = localDay(start, tz);
    const dayFrom = zonedToUtc(day, "00:00", tz);
    let busy: Map<string, TimeInterval[]>;
    try {
      busy = await this.busyOf(all, dayFrom, new Date(dayFrom.getTime() + DAY_MS));
    } catch (err) {
      return { ok: false, reason: "error_calendario", alternatives: [], detail: err instanceof Error ? err.message : undefined };
    }
    // Al mover una cita, su propio evento no cuenta como ocupado en su calendario
    if (appointment.calendarIntegrationId && appointment.scheduledAt) {
      const own = appointment.scheduledAt.getTime();
      const ownEnd = own + appointment.durationMin * 60_000;
      const list = busy.get(appointment.calendarIntegrationId);
      if (list) busy.set(appointment.calendarIntegrationId, list.filter((b) => !(b.start.getTime() === own && b.end.getTime() === ownEnd)));
    }

    const calendars = all.filter((c) => busy.has(c.integrationId));
    const checks = calendars.map((c) => ({ c, check: canBook(start, busy.get(c.integrationId)!, c.agenda, this.now()) }));
    const free = checks.filter((x) => x.check.ok).map((x) => x.c);
    if (free.length === 0) {
      // El motivo más útil: si para alguno solo está ocupado, es "ocupado"; si no, el del primero
      const reasons = checks.map((x) => (x.check.ok ? "" : x.check.reason));
      const reason = (reasons.includes("ocupado") ? "ocupado" : reasons[0]) as Exclude<BookResult, { ok: true }>["reason"];
      const alternatives = mergedSlots(day, busy, calendars, this.now()).slice(0, 4).map((s) => toOption(s, tz));
      return { ok: false, reason, alternatives };
    }

    const chosen = await this.pickCalendar(tenantId, free, appointment.calendarIntegrationId);
    const end = new Date(start.getTime() + chosen.agenda.slotMinutes * 60_000);
    const event = eventFor(appointment, start, end, chosen.agenda.timeZone, chosen.userId ? chosen.label : null);
    try {
      let eventId = appointment.calendarEventId;
      let eventUrl = appointment.calendarEventUrl;
      if (eventId && appointment.calendarIntegrationId === chosen.integrationId) {
        await chosen.calendar.updateEvent(chosen.agenda.calendarId, eventId, event);
      } else {
        // Cambió de asesor (o es nueva): se crea en el nuevo calendario y se borra del anterior
        const ref = await chosen.calendar.createEvent(chosen.agenda.calendarId, event);
        if (eventId && appointment.calendarIntegrationId) await this.deleteFrom(tenantId, appointment.calendarIntegrationId, eventId);
        eventId = ref.id;
        eventUrl = ref.url;
      }
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: "CONFIRMED",
          scheduledAt: start,
          durationMin: chosen.agenda.slotMinutes,
          calendarProvider: chosen.calendar.provider,
          calendarEventId: eventId,
          calendarEventUrl: eventUrl,
          calendarIntegrationId: chosen.integrationId,
          assignedUserId: chosen.userId,
        },
      });
      return { ok: true, scheduledAt: start, label: formatSlot(start, tz), eventUrl, advisor: chosen.userId ? chosen.label : null };
    } catch (err) {
      return { ok: false, reason: "error_calendario", alternatives: [], detail: err instanceof Error ? err.message : undefined };
    }
  }

  /** El mismo asesor si sigue libre; si no, el libre con menos citas próximas. */
  private async pickCalendar(tenantId: string, free: ConnectedCalendar[], current: string | null): Promise<ConnectedCalendar> {
    const keep = free.find((c) => c.integrationId === current);
    if (keep || free.length === 1) return keep ?? free[0]!;
    const counts = await prisma.appointment.groupBy({
      by: ["calendarIntegrationId"],
      where: { tenantId, status: "CONFIRMED", scheduledAt: { gte: this.now() }, calendarIntegrationId: { in: free.map((c) => c.integrationId) } },
      _count: { _all: true },
    });
    const load = (id: string) => counts.find((x) => x.calendarIntegrationId === id)?._count._all ?? 0;
    return [...free].sort((a, b) => load(a.integrationId) - load(b.integrationId))[0]!;
  }

  private async deleteFrom(tenantId: string, integrationId: string, eventId: string): Promise<void> {
    const old = await this.directory.byId(tenantId, integrationId);
    await old?.calendar.deleteEvent(old.agenda.calendarId, eventId).catch((err) => console.warn("[scheduling] no se pudo borrar el evento anterior:", err));
  }

  /**
   * Lleva al calendario lo que el asesor cambió en el panel: crea o mueve el evento si la cita
   * quedó confirmada con hora, y lo borra si se canceló. Best-effort: la cita ya quedó guardada.
   */
  async syncFromPanel(tenantId: string, appointmentId: string): Promise<{ synced: boolean; error?: string }> {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: { client: true, listing: true },
    });
    if (!appointment) return { synced: false };

    // El calendario de la cita: donde ya está el evento, o el del asesor asignado, o el primero disponible
    const target = appointment.calendarIntegrationId
      ? await this.directory.byId(tenantId, appointment.calendarIntegrationId)
      : await this.calendarForNew(tenantId, appointment.assignedUserId);
    if (!target) return { synced: false };

    try {
      if (appointment.status === "CANCELLED") {
        if (appointment.calendarEventId) {
          await target.calendar.deleteEvent(target.agenda.calendarId, appointment.calendarEventId);
          await prisma.appointment.update({
            where: { id: appointment.id },
            data: { calendarEventId: null, calendarEventUrl: null, calendarProvider: null, calendarIntegrationId: null },
          });
        }
        return { synced: true };
      }
      if (appointment.status !== "CONFIRMED" || !appointment.scheduledAt) return { synced: false };

      const end = new Date(appointment.scheduledAt.getTime() + appointment.durationMin * 60_000);
      const event = eventFor(appointment, appointment.scheduledAt, end, target.agenda.timeZone, target.userId ? target.label : null);
      if (appointment.calendarEventId) {
        await target.calendar.updateEvent(target.agenda.calendarId, appointment.calendarEventId, event);
      } else {
        const ref = await target.calendar.createEvent(target.agenda.calendarId, event);
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: {
            calendarProvider: target.calendar.provider,
            calendarEventId: ref.id,
            calendarEventUrl: ref.url,
            calendarIntegrationId: target.integrationId,
            assignedUserId: appointment.assignedUserId ?? target.userId,
          },
        });
      }
      return { synced: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : "No se pudo actualizar el calendario";
      console.warn("[scheduling] no se pudo sincronizar la cita:", error);
      return { synced: false, error };
    }
  }

  private async calendarForNew(tenantId: string, assignedUserId: string | null): Promise<ConnectedCalendar | null> {
    const all = await this.directory.list(tenantId);
    return all.find((c) => assignedUserId && c.userId === assignedUserId) ?? all[0] ?? null;
  }
}

interface AppointmentForEvent {
  requestedSlot: string;
  notes: string | null;
  client: { name: string; phone: string } | null;
  listing: {
    code: string;
    title: string;
    kind: string;
    city: string;
    zone: string | null;
    exactAddress: string | null;
    ownerName: string | null;
    ownerPhone: string | null;
  } | null;
}

/** El evento es para el equipo del negocio: lleva la dirección exacta y el contacto del propietario. */
function eventFor(a: AppointmentForEvent, start: Date, end: Date, timeZone: string, advisor: string | null) {
  const what = a.listing ? (a.listing.kind === "VEHICLE" ? "Prueba de manejo" : "Visita") : "Cita";
  const who = a.client?.name ?? "Cliente";
  const lines = [
    a.client ? `Cliente: ${a.client.name} (+${a.client.phone})` : null,
    a.listing ? `Bien: ${a.listing.title} (${a.listing.code})` : null,
    a.listing?.ownerName || a.listing?.ownerPhone
      ? `Propietario: ${[a.listing.ownerName, a.listing.ownerPhone].filter(Boolean).join(" · ")}`
      : null,
    advisor ? `Asesor: ${advisor}` : null,
    `Lo que pidió el cliente: ${a.requestedSlot}`,
    a.notes ? `Notas: ${a.notes}` : null,
    "Agendado desde WhatsAppIA.",
  ].filter(Boolean);
  return {
    title: `${what}: ${a.listing?.title ?? "cita"} — ${who}`,
    description: lines.join("\n"),
    location: a.listing ? a.listing.exactAddress ?? [a.listing.zone, a.listing.city].filter(Boolean).join(", ") : undefined,
    start,
    end,
    timeZone,
  };
}
