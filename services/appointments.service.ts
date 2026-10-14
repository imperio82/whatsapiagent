import { api } from "./api-client";
import type { AppointmentDto, UpdateAppointmentInput } from "@modules/appointments/application/use-cases";

export const appointmentsService = {
  list: () => api.get<AppointmentDto[]>("/api/v1/appointments"),
  update: (id: string, input: UpdateAppointmentInput) => api.patch<AppointmentDto>(`/api/v1/appointments/${id}`, input),
};
