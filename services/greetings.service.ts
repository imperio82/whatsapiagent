import { api } from "./api-client";
import type {
  GreetingDto,
  GreetingSettingsDto,
  GreetingStatusValue,
  UpcomingDateDto,
} from "@modules/greetings/application/use-cases";
import type { GreetingTemplateKey } from "@modules/clients/domain/special-dates";

export const greetingsService = {
  list: (status?: GreetingStatusValue) => api.get<GreetingDto[]>(`/api/v1/greetings${status ? `?status=${status}` : ""}`),
  upcoming: () => api.get<UpcomingDateDto[]>("/api/v1/greetings/upcoming"),
  prepare: () => api.post<{ created: number }>("/api/v1/greetings/prepare"),
  send: (id: string, message?: string) =>
    api.post<{ status: "SENT" | "FAILED"; error?: string }>(`/api/v1/greetings/${id}/send`, message ? { message } : {}),
  dismiss: (id: string) => api.post<void>(`/api/v1/greetings/${id}/dismiss`),
  settings: () => api.get<GreetingSettingsDto>("/api/v1/greetings/settings"),
  updateSettings: (input: { mode?: "APPROVAL" | "AUTO"; templates?: Partial<Record<GreetingTemplateKey, string>> }) =>
    api.patch<GreetingSettingsDto>("/api/v1/greetings/settings", input),
};
