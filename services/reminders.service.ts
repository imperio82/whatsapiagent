import { api } from "./api-client";
import type { ReminderDto, ReminderSettingsDto, ReminderStatusValue } from "@modules/reminders/application/use-cases";
import type { ReminderKindValue, ReminderTemplateKey } from "@modules/reminders/domain/reminders";

export interface CreateReminderBody {
  clientId: string;
  dueAt: string;
  message: string;
  note: string | null;
  autoSend: boolean;
}

export type ReminderSettingsInput = Partial<Omit<ReminderSettingsDto, "templates" | "defaults">> & {
  templates?: Partial<Record<ReminderTemplateKey, string>>;
};

export const remindersService = {
  list: (filter: { status?: ReminderStatusValue; kind?: ReminderKindValue }) => {
    const usp = new URLSearchParams();
    if (filter.status) usp.set("status", filter.status);
    if (filter.kind) usp.set("kind", filter.kind);
    const q = usp.toString();
    return api.get<ReminderDto[]>(`/api/v1/reminders${q ? `?${q}` : ""}`);
  },
  create: (body: CreateReminderBody) => api.post<{ id: string }>("/api/v1/reminders", body),
  prepare: () => api.post<{ created: number }>("/api/v1/reminders/prepare"),
  send: (id: string, message?: string) =>
    api.post<{ status: "SENT" | "FAILED"; error?: string }>(`/api/v1/reminders/${id}/send`, message ? { message } : {}),
  complete: (id: string) => api.post<void>(`/api/v1/reminders/${id}/complete`),
  dismiss: (id: string) => api.post<void>(`/api/v1/reminders/${id}/dismiss`),
  settings: () => api.get<ReminderSettingsDto>("/api/v1/reminders/settings"),
  updateSettings: (input: ReminderSettingsInput) => api.patch<ReminderSettingsDto>("/api/v1/reminders/settings", input),
};
