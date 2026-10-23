/**
 * Puerto de calendario. Los agentes y los casos de uso dependen de esta interfaz, nunca de
 * Google: mañana puede haber otra implementación (Outlook, Calendly…) sin tocar al agente.
 */

export interface TimeInterval {
  start: Date;
  end: Date;
}

export interface CalendarInfo {
  id: string;
  name: string;
  primary: boolean;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  timeZone: string;
}

export interface CalendarEventRef {
  id: string;
  url: string | null;
}

export interface CalendarProvider {
  /** Nombre del proveedor que se guarda junto al evento ("google"). */
  readonly provider: string;
  listCalendars(): Promise<CalendarInfo[]>;
  /** Intervalos ocupados del calendario entre `from` y `to`. */
  busy(calendarId: string, from: Date, to: Date): Promise<TimeInterval[]>;
  createEvent(calendarId: string, input: CalendarEventInput): Promise<CalendarEventRef>;
  updateEvent(calendarId: string, eventId: string, input: Partial<CalendarEventInput>): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}
