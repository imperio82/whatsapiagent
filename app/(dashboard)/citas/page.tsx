"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarCheck, CalendarClock, Car, Building2, ExternalLink, Phone, UserRound } from "lucide-react";
import { Badge, type BadgeProps } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { useAppointments, useUpdateAppointment } from "@hooks/use-appointments";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";
import type { AppointmentDto } from "@modules/appointments/application/use-cases";

type Status = AppointmentDto["status"];

// Se repiten aquí (y no se importan del caso de uso) para no llevar Prisma al navegador
const STATUS_LABELS: Record<Status, string> = {
  REQUESTED: "Por confirmar",
  CONFIRMED: "Confirmada",
  DONE: "Realizada",
  CANCELLED: "Cancelada",
};

const STATUS_VARIANT: Record<Status, BadgeProps["variant"]> = {
  REQUESTED: "warning",
  CONFIRMED: "success",
  DONE: "secondary",
  CANCELLED: "outline",
};

export default function AppointmentsPage(): React.ReactElement {
  const { data, isLoading } = useAppointments();
  const pending = data?.filter((a) => a.status === "REQUESTED") ?? [];
  const rest = data?.filter((a) => a.status !== "REQUESTED") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Citas</h1>
        <p className="text-sm text-muted-foreground">
          Visitas y pruebas de manejo que pidieron los clientes por WhatsApp. La IA deja la solicitud; tú confirmas la hora.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4 text-amber-600" /> Por confirmar ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground">No hay solicitudes pendientes.</p>
            ) : (
              pending.map((a) => <AppointmentRow key={a.id} appointment={a} />)
            )}
          </section>
          {rest.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CalendarCheck className="h-4 w-4 text-muted-foreground" /> Historial
              </h2>
              {rest.map((a) => (
                <AppointmentRow key={a.id} appointment={a} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function AppointmentRow({ appointment: a }: { appointment: AppointmentDto }) {
  const update = useUpdateAppointment();
  const [when, setWhen] = useState(toLocalInput(a.scheduledAt));
  const Icon = a.listing?.kind === "PROPERTY" ? Building2 : Car;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{a.client?.name ?? "Cliente"}</span>
            <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABELS[a.status]}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {a.listing && (
              <span className="flex items-center gap-1">
                <Icon className="h-3.5 w-3.5" /> {a.listing.title} ({a.listing.code})
              </span>
            )}
            {a.client && (
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {clientPhoneToDisplay(a.client.phone)}
              </span>
            )}
            <span>Pidió: {a.requestedSlot}</span>
            {a.advisor && (
              <span className="flex items-center gap-1">
                <UserRound className="h-3.5 w-3.5" /> La atiende {a.advisor.name}
              </span>
            )}
            {a.calendarEventUrl && (
              <a href={a.calendarEventUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-wa hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> En el calendario
              </a>
            )}
            <span>{formatDistanceToNow(new Date(a.createdAt), { locale: es, addSuffix: true })}</span>
          </div>
          {a.notes && <p className="mt-1 text-xs text-muted-foreground">Nota: {a.notes}</p>}
        </div>
        {a.status === "REQUESTED" || a.status === "CONFIRMED" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-52" aria-label="Fecha y hora" />
            <Button
              size="sm"
              variant="wa"
              disabled={!when || update.isPending}
              onClick={() => update.mutate({ id: a.id, input: { status: "CONFIRMED", scheduledAt: new Date(when).toISOString() } })}
            >
              {a.status === "CONFIRMED" ? "Cambiar hora" : "Confirmar"}
            </Button>
            {a.status === "CONFIRMED" && (
              <Button size="sm" variant="outline" onClick={() => update.mutate({ id: a.id, input: { status: "DONE" } })}>
                Realizada
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: a.id, input: { status: "CANCELLED" } })}>
              Cancelar
            </Button>
          </div>
        ) : (
          a.scheduledAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(a.scheduledAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          )
        )}
      </CardContent>
    </Card>
  );
}
