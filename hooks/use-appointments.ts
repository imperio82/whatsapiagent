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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Cita actualizada");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Error inesperado"),
  });
}
