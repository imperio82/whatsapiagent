"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { appointmentsService } from "@services/appointments.service";
import { ApiError } from "@services/api-client";
import type { UpdateAppointmentInput } from "@modules/appointments/application/use-cases";

const KEY = "appointments";

export function useAppointments() {
  return useQuery({ queryKey: [KEY], queryFn: () => appointmentsService.list() });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAppointmentInput }) => appointmentsService.update(id, input),
    onSuccess: (appointment) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      // La cita se guardó; si el calendario conectado falló, se avisa para revisarlo allá
      if (appointment.calendarError) toast.warning(`Cita actualizada, pero no se pudo reflejar en el calendario: ${appointment.calendarError}`);
      else toast.success(appointment.calendarEventUrl ? "Cita actualizada en el panel y en el calendario" : "Cita actualizada");
      // El aviso de confirmación al cliente (habilidad "Avisar al cliente cuando se confirma la cita")
      if (appointment.clientNotice?.sent) toast.success("Se le avisó al cliente por WhatsApp");
      else if (appointment.clientNotice) toast.warning(`No se pudo avisar al cliente: ${appointment.clientNotice.error}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Error inesperado"),
  });
}
