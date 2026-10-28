"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  Building2,
  CalendarCheck,
  CalendarClock,
  Car,
  Copy,
  ExternalLink,
  PenLine,
  Phone,
  RefreshCw,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { Badge, type BadgeProps } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@components/ui/dialog";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useAppointmentNoticeDraft, useAppointments, useUpdateAppointment } from "@hooks/use-appointments";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";
import { cn } from "@lib/utils";
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
  const [confirming, setConfirming] = useState(false);
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
              onClick={() =>
                a.client
                  ? setConfirming(true)
                  : update.mutate({ id: a.id, input: { status: "CONFIRMED", scheduledAt: new Date(when).toISOString() } })
              }
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
      {confirming && when && (
        <ConfirmDialog appointment={a} scheduledAt={new Date(when).toISOString()} onClose={() => setConfirming(false)} />
      )}
    </Card>
  );
}

type NoticeMode = "agente" | "manual" | "ninguno";

const NOTICE_MODES: { value: NoticeMode; label: string; icon: typeof Sparkles }[] = [
  { value: "agente", label: "Lo escribe el agente", icon: Sparkles },
  { value: "manual", label: "Lo escribo yo", icon: PenLine },
  { value: "ninguno", label: "No avisar", icon: X },
];

const TEXTAREA =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Confirmar (o mover) la cita y decidir cómo se le avisa al cliente. */
function ConfirmDialog({ appointment: a, scheduledAt, onClose }: { appointment: AppointmentDto; scheduledAt: string; onClose: () => void }) {
  const update = useUpdateAppointment();
  const draft = useAppointmentNoticeDraft();
  const [mode, setMode] = useState<NoticeMode>("agente");
  const [agentText, setAgentText] = useState("");
  const [ownText, setOwnText] = useState("");
  const [instructions, setInstructions] = useState("");
  const moving = a.status === "CONFIRMED";

  const redraft = () =>
    draft.mutate({ id: a.id, scheduledAt, instructions: instructions.trim() || null }, { onSuccess: (d) => setAgentText(d.text) });

  useEffect(() => {
    draft.mutate(
      { id: a.id, scheduledAt },
      {
        onSuccess: (d) => {
          setAgentText(d.text);
          // Con la habilidad del aviso apagada, por defecto no se avisa
          if (!d.skillActive) setMode("ninguno");
        },
      },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const closed = draft.data && !draft.data.window.open ? draft.data.window.reason : null;
  const text = mode === "agente" ? agentText.trim() : mode === "manual" ? ownText.trim() : "";
  const when = new Date(scheduledAt).toLocaleString("es-CO", { dateStyle: "full", timeStyle: "short" });

  const submit = () =>
    update.mutate(
      { id: a.id, input: { status: "CONFIRMED", scheduledAt, notice: mode === "ninguno" ? { mode: "none" } : { mode: "send", text } } },
      { onSuccess: onClose },
    );

  const submitLabel =
    mode === "ninguno"
      ? moving
        ? "Cambiar hora sin avisar"
        : "Confirmar sin avisar"
      : closed
        ? "Confirmar y dejar el aviso pendiente"
        : moving
          ? "Cambiar hora y avisar"
          : "Confirmar y avisar";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{moving ? "Cambiar la hora de la cita" : "Confirmar la cita"}</DialogTitle>
          <DialogDescription>
            {a.client?.name ?? "Cliente"}
            {a.listing ? ` · ${a.listing.title}` : ""} · {when}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label>Aviso al cliente por WhatsApp</Label>
          <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1 text-xs" role="tablist">
            {NOTICE_MODES.map(({ value, label, icon: ModeIcon }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded px-2 py-1.5 transition-colors",
                  mode === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ModeIcon className="h-3.5 w-3.5 shrink-0" /> {label}
              </button>
            ))}
          </div>

          {mode === "agente" && (
            <div className="space-y-2">
              {draft.isPending && !agentText ? (
                <div className="h-24 animate-pulse rounded-md bg-muted/50" />
              ) : (
                <textarea
                  rows={4}
                  maxLength={1000}
                  className={TEXTAREA}
                  value={agentText}
                  onChange={(e) => setAgentText(e.target.value)}
                  aria-label="Mensaje que redactó el agente"
                />
              )}
              {draft.data && !draft.data.aiDrafted && (
                <p className="text-[11px] text-muted-foreground">La IA no estaba disponible: es el mensaje base. Puedes editarlo.</p>
              )}
              <div className="flex gap-2">
                <Input
                  value={instructions}
                  maxLength={500}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Indicaciones para el agente (opcional): que traiga la cédula…"
                  onKeyDown={(e) => e.key === "Enter" && redraft()}
                />
                <Button type="button" size="sm" variant="outline" disabled={draft.isPending} onClick={redraft}>
                  <RefreshCw className={cn("h-4 w-4", draft.isPending && "animate-spin")} /> Redactar
                </Button>
              </div>
            </div>
          )}

          {mode === "manual" && (
            <textarea
              rows={4}
              maxLength={1000}
              className={TEXTAREA}
              value={ownText}
              onChange={(e) => setOwnText(e.target.value)}
              placeholder="Escribe el mensaje tal como quieres que le llegue al cliente"
              aria-label="Tu mensaje"
            />
          )}

          {mode !== "ninguno" && closed && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <p>{closed}</p>
              <p className="text-muted-foreground">
                Si confirmas, el mensaje queda pendiente y sale apenas el cliente vuelva a escribir (si la cita no ha pasado). También
                puedes copiarlo y enviarlo por tu cuenta.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!text}
                onClick={() =>
                  navigator.clipboard
                    .writeText(text)
                    .then(() => toast.success("Mensaje copiado"))
                    .catch(() => toast.error("No se pudo copiar"))
                }
              >
                <Copy className="h-4 w-4" /> Copiar mensaje
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Volver
          </Button>
          <Button variant="wa" disabled={update.isPending || (mode !== "ninguno" && !text)} onClick={submit}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
