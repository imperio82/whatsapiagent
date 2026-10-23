import type { TimeInterval } from "./ports/calendar-provider";

/**
 * Agenda de visitas: en qué días y horas se pueden agendar, y qué espacios quedan libres según
 * lo ocupado en el calendario. Lógica pura (sin proveedor) para poder probarla.
 */

export interface AgendaSettings {
  calendarId: string;
  timeZone: string;
  /** Días hábiles: 0 = domingo … 6 = sábado. */
  workDays: number[];
  /** "08:00" */
  dayStart: string;
  /** "18:00" */
  dayEnd: string;
  slotMinutes: number;
  /** No se ofrece nada que empiece antes de esta anticipación. */
  minNoticeHours: number;
}

export const DEFAULT_AGENDA: AgendaSettings = {
  calendarId: "primary",
  timeZone: "America/Bogota",
  workDays: [1, 2, 3, 4, 5, 6],
  dayStart: "08:00",
  dayEnd: "18:00",
  slotMinutes: 60,
  minNoticeHours: 2,
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Lee la configuración guardada (JSON) y completa con los valores por defecto. */
export function agendaFrom(settings: unknown): AgendaSettings {
  const s = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {};
  const days = Array.isArray(s.workDays) ? s.workDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : null;
  const time = (v: unknown, fallback: string) => (typeof v === "string" && TIME_RE.test(v) ? v : fallback);
  const int = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
  return {
    calendarId: typeof s.calendarId === "string" && s.calendarId ? s.calendarId : DEFAULT_AGENDA.calendarId,
    timeZone: typeof s.timeZone === "string" && isValidTimeZone(s.timeZone) ? s.timeZone : DEFAULT_AGENDA.timeZone,
    workDays: days && days.length > 0 ? [...new Set(days)].sort() : DEFAULT_AGENDA.workDays,
    dayStart: time(s.dayStart, DEFAULT_AGENDA.dayStart),
    dayEnd: time(s.dayEnd, DEFAULT_AGENDA.dayEnd),
    slotMinutes: int(s.slotMinutes, DEFAULT_AGENDA.slotMinutes, 15, 480),
    minNoticeHours: int(s.minNoticeHours, DEFAULT_AGENDA.minNoticeHours, 0, 168),
  };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Diferencia en ms entre la hora local de `tz` y UTC en ese instante. */
function tzOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** "2026-10-16" + "15:00" en `tz` → instante UTC. */
export function zonedToUtc(day: string, time: string, tz: string): Date {
  const d = DAY_RE.exec(day);
  const t = TIME_RE.exec(time);
  if (!d || !t) throw new Error(`Fecha u hora inválida: ${day} ${time}`);
  const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let result = guess - tzOffsetMs(new Date(guess), tz);
  // Segunda pasada por si el cambio de horario cae entre la suposición y el resultado
  result = guess - tzOffsetMs(new Date(result), tz);
  return new Date(result);
}

/** Fecha local "YYYY-MM-DD" de un instante en `tz`. */
export function localDay(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** Hora local "HH:MM" de un instante en `tz`. */
export function localTime(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
}

export function weekdayOf(day: string): number {
  const d = DAY_RE.exec(day);
  if (!d) throw new Error(`Fecha inválida: ${day}`);
  return new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]))).getUTCDay();
}

export function isValidDay(day: string): boolean {
  const d = DAY_RE.exec(day);
  if (!d) return false;
  const date = new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])));
  return date.getUTCMonth() === Number(d[2]) - 1 && date.getUTCDate() === Number(d[3]);
}

const overlaps = (a: TimeInterval, b: TimeInterval) => a.start < b.end && b.start < a.end;

/** Espacios libres de un día: dentro del horario, sin cruzarse con lo ocupado y con la anticipación mínima. */
export function freeSlots(day: string, busy: TimeInterval[], settings: AgendaSettings, now: Date = new Date()): TimeInterval[] {
  if (!isValidDay(day) || !settings.workDays.includes(weekdayOf(day))) return [];
  const open = zonedToUtc(day, settings.dayStart, settings.timeZone);
  const close = zonedToUtc(day, settings.dayEnd, settings.timeZone);
  const earliest = new Date(now.getTime() + settings.minNoticeHours * 3_600_000);
  const step = settings.slotMinutes * 60_000;

  const slots: TimeInterval[] = [];
  for (let t = open.getTime(); t + step <= close.getTime(); t += step) {
    const slot = { start: new Date(t), end: new Date(t + step) };
    if (slot.start < earliest) continue;
    if (busy.some((b) => overlaps(slot, b))) continue;
    slots.push(slot);
  }
  return slots;
}

/**
 * ¿Se puede agendar exactamente a esta hora? Debe caer en día y horario hábil, respetar la
 * anticipación y no cruzarse con nada. No exige que coincida con la rejilla de espacios.
 */
export function canBook(start: Date, busy: TimeInterval[], settings: AgendaSettings, now: Date = new Date()): { ok: true } | { ok: false; reason: string } {
  const end = new Date(start.getTime() + settings.slotMinutes * 60_000);
  const day = localDay(start, settings.timeZone);
  if (!settings.workDays.includes(weekdayOf(day))) return { ok: false, reason: "dia_no_habil" };
  const open = zonedToUtc(day, settings.dayStart, settings.timeZone);
  const close = zonedToUtc(day, settings.dayEnd, settings.timeZone);
  if (start < open || end > close) return { ok: false, reason: "fuera_de_horario" };
  if (start.getTime() < now.getTime() + settings.minNoticeHours * 3_600_000) return { ok: false, reason: "muy_pronto" };
  if (busy.some((b) => overlaps({ start, end }, b))) return { ok: false, reason: "ocupado" };
  return { ok: true };
}

/** "jueves 16 de octubre, 3:00 p. m." */
export function formatSlot(instant: Date, tz: string): string {
  return instant.toLocaleString("es-CO", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}
