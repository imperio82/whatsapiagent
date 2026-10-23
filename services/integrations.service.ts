import { api } from "./api-client";
import type { ConnectionDto, ConnectionSettingsInput, IntegrationsOverviewDto } from "@modules/integrations/application/use-cases";
import type { CalendarInfo } from "@modules/integrations/domain/ports/calendar-provider";

/** "business": la conexión del negocio (calendario compartido y Sheets). "user": el calendario propio. */
export type ConnectionScope = "business" | "user";

export const integrationsService = {
  overview: () => api.get<IntegrationsOverviewDto>("/api/v1/integrations"),
  /** Se navega a esta URL: el servidor redirige a la pantalla de permisos de Google. */
  googleConnectUrl: (scope: ConnectionScope) => `/api/v1/integrations/google/connect?scope=${scope}`,
  googleCalendars: (scope: ConnectionScope) => api.get<CalendarInfo[]>(`/api/v1/integrations/google/calendars?scope=${scope}`),
  updateGoogle: (scope: ConnectionScope, input: ConnectionSettingsInput) =>
    api.patch<ConnectionDto>(`/api/v1/integrations/google?scope=${scope}`, input),
  disconnectGoogle: (scope: ConnectionScope) => api.delete<void>(`/api/v1/integrations/google?scope=${scope}`),
  saveGoogleApp: (input: { clientId: string; clientSecret: string }) => api.put<void>("/api/v1/integrations/google/app", input),
  deleteGoogleApp: () => api.delete<void>("/api/v1/integrations/google/app"),
};
