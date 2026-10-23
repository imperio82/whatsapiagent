import type {
  CalendarEventInput,
  CalendarEventRef,
  CalendarInfo,
  CalendarProvider,
  TimeInterval,
} from "../../domain/ports/calendar-provider";
import { googleError, googleFetch } from "./google-auth";

const API = "https://www.googleapis.com/calendar/v3";

/** Google Calendar como CalendarProvider, con el token de una conexión (negocio o asesor). */
export class GoogleCalendarProvider implements CalendarProvider {
  readonly provider = "google";

  /** `integrationId`: la conexión de Google (del negocio o de un asesor) cuyo token se usa. */
  constructor(private readonly integrationId: string) {}

  async listCalendars(): Promise<CalendarInfo[]> {
    const res = await googleFetch(this.integrationId, `${API}/users/me/calendarList?minAccessRole=writer`);
    if (!res.ok) throw await googleError(res, "listar calendarios");
    const data = (await res.json()) as { items?: Array<{ id: string; summary?: string; summaryOverride?: string; primary?: boolean }> };
    return (data.items ?? []).map((c) => ({ id: c.id, name: c.summaryOverride ?? c.summary ?? c.id, primary: Boolean(c.primary) }));
  }

  async busy(calendarId: string, from: Date, to: Date): Promise<TimeInterval[]> {
    const res = await googleFetch(this.integrationId, `${API}/freeBusy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: calendarId }] }),
    });
    if (!res.ok) throw await googleError(res, "consultar disponibilidad");
    const data = (await res.json()) as {
      calendars?: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: Array<{ reason: string }> }>;
    };
    const cal = data.calendars?.[calendarId];
    if (cal?.errors?.length) throw new Error(`Google (disponibilidad): ${cal.errors.map((e) => e.reason).join(", ")}`);
    return (cal?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  }

  async createEvent(calendarId: string, input: CalendarEventInput): Promise<CalendarEventRef> {
    const res = await googleFetch(this.integrationId, `${API}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toGoogleEvent(input)),
    });
    if (!res.ok) throw await googleError(res, "crear evento");
    const event = (await res.json()) as { id: string; htmlLink?: string };
    return { id: event.id, url: event.htmlLink ?? null };
  }

  async updateEvent(calendarId: string, eventId: string, input: Partial<CalendarEventInput>): Promise<void> {
    const res = await googleFetch(
      this.integrationId,
      `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toGoogleEvent(input)) },
    );
    if (!res.ok) throw await googleError(res, "actualizar evento");
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const res = await googleFetch(
      this.integrationId,
      `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
    );
    // 404/410: ya no existe en el calendario, no hay nada que borrar
    if (!res.ok && res.status !== 404 && res.status !== 410) throw await googleError(res, "borrar evento");
  }
}

function toGoogleEvent(input: Partial<CalendarEventInput>) {
  return {
    ...(input.title !== undefined ? { summary: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.start ? { start: { dateTime: input.start.toISOString(), timeZone: input.timeZone } } : {}),
    ...(input.end ? { end: { dateTime: input.end.toISOString(), timeZone: input.timeZone } } : {}),
  };
}
