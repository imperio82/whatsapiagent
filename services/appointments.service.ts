import { api } from "./api-client";
import type { AppointmentDto, NoticeDraftDto, UpdateAppointmentInput } from "@modules/appointments/application/use-cases";

export const appointmentsService = {
  list: () => api.get<AppointmentDto[]>("/api/v1/appointments"),
  update: (id: string, input: UpdateAppointmentInput) => api.patch<AppointmentDto>(`/api/v1/appointments/${id}`, input),
  draftNotice: (id: string, input: { scheduledAt: string; instructions?: string | null }) =>
    api.post<NoticeDraftDto>(`/api/v1/appointments/${id}/notice-draft`, input),
};
