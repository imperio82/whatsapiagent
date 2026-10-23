import { prisma } from "@shared/infrastructure/prisma/client";
import { agendaFrom, type AgendaSettings } from "../domain/agenda";
import type { CalendarProvider } from "../domain/ports/calendar-provider";
import type { SpreadsheetProvider } from "../domain/ports/spreadsheet-provider";
import { isGoogleConfigured } from "./google/google-auth";
import { GoogleCalendarProvider } from "./google/google-calendar";
import { GoogleSheetsProvider } from "./google/google-sheets";

/**
 * Resuelve qué conexiones cumplen cada capacidad para un negocio. Es el único lugar que conoce
 * las implementaciones: el resto de la app pide "los calendarios" o "una hoja".
 *
 * Calendarios: si hay asesores con su calendario conectado y que reciben visitas, se agenda en
 * los de ellos (cada cita queda asignada a un asesor). Si no hay ninguno, se usa el calendario
 * del negocio. Así un negocio de una sola persona conecta uno y listo, y uno con equipo reparte.
 */

export interface ConnectedCalendar {
  integrationId: string;
  /** Asesor dueño del calendario; null si es el del negocio. */
  userId: string | null;
  /** Para mostrar: el nombre del asesor o "el negocio". */
  label: string;
  calendar: CalendarProvider;
  agenda: AgendaSettings;
}

const hasCalendarScope = (scopes: string[]) => scopes.some((s) => s.includes("calendar"));
/** Un asesor puede tener su calendario conectado y no recibir visitas (vacaciones, otro rol). */
export const acceptsVisits = (settings: unknown) =>
  !(settings && typeof settings === "object" && (settings as Record<string, unknown>).acceptsVisits === false);

function toConnected(row: { id: string; userId: string | null; settings: unknown; user: { name: string } | null }): ConnectedCalendar {
  return {
    integrationId: row.id,
    userId: row.userId,
    label: row.user?.name ?? "el negocio",
    calendar: new GoogleCalendarProvider(row.id),
    agenda: agendaFrom(row.settings),
  };
}

/** Calendarios donde se puede agendar hoy: los de los asesores disponibles o, si no hay, el del negocio. */
export async function resolveCalendars(tenantId: string): Promise<ConnectedCalendar[]> {
  if (!(await isGoogleConfigured(tenantId))) return [];
  const rows = await prisma.integration.findMany({
    where: { tenantId, provider: "GOOGLE", status: "CONNECTED" },
    include: { user: { select: { name: true, memberships: { where: { tenantId }, select: { status: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const usable = rows.filter((r) => hasCalendarScope(r.scopes));
  // Un asesor que ya no está activo en el negocio no recibe citas
  const advisors = usable.filter((r) => r.userId && r.user?.memberships[0]?.status === "ACTIVE" && acceptsVisits(r.settings));
  if (advisors.length > 0) return advisors.map(toConnected);
  const business = usable.find((r) => r.ownerKey === "business");
  return business ? [toConnected(business)] : [];
}

/** El calendario donde quedó un evento, para moverlo o borrarlo aunque el asesor ya no reciba visitas. */
export async function resolveCalendarById(tenantId: string, integrationId: string): Promise<ConnectedCalendar | null> {
  const row = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId, status: "CONNECTED" },
    include: { user: { select: { name: true } } },
  });
  return row && hasCalendarScope(row.scopes) ? toConnected(row) : null;
}

/** Las hojas de cálculo son del negocio: se leen con la conexión de Google del negocio. */
export async function resolveSpreadsheets(tenantId: string): Promise<SpreadsheetProvider | null> {
  if (!(await isGoogleConfigured(tenantId))) return null;
  const google = await prisma.integration.findUnique({
    where: { tenantId_provider_ownerKey: { tenantId, provider: "GOOGLE", ownerKey: "business" } },
    select: { id: true, status: true, scopes: true },
  });
  if (!google || google.status !== "CONNECTED") return null;
  if (!google.scopes.some((s) => s.includes("spreadsheets"))) return null;
  return new GoogleSheetsProvider(google.id);
}
