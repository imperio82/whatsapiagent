"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { BellRing, CalendarClock, Check, ClipboardList, Loader2, MessageCircle, MessageSquareReply, Plus, RefreshCw, Send, Settings2, X } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import {
  useCompleteReminder,
  useDismissReminder,
  usePrepareReminders,
  useReminderSettings,
  useReminders,
  useSendReminder,
  useUpdateReminderSettings,
} from "@hooks/use-reminders";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";
import { REMINDER_PLACEHOLDERS, type ReminderKindValue } from "@modules/reminders/domain/reminders";
import type { ReminderDto, ReminderSettingsDto, ReminderStatusValue } from "@modules/reminders/application/use-cases";
import { cn } from "@lib/utils";
import { NewReminderDialog } from "./new-reminder-dialog";

const TEXTAREA =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const TABS: { status: ReminderStatusValue; label: string }[] = [
  { status: "PENDING", label: "Por enviar" },
  { status: "SENT", label: "Enviados" },
  { status: "FAILED", label: "Con error" },
  { status: "DISMISSED", label: "Descartados" },
];

const INTRO: Record<ReminderKindValue, string> = {
  APPOINTMENT: "Antes de cada cita agendada se le escribe al cliente para que la confirme. Si la cita se cancela o cambia de hora, el recordatorio se actualiza solo.",
  FOLLOW_UP: "Cuando un cliente deja de responder, se le escribe una vez para retomar la conversación. Si vuelve a escribir y otra vez se queda callado, se prepara otro.",
  CUSTOM: "Programa un mensaje para un cliente en la fecha y hora que quieras, o una tarea para ti (“llamar a Carlos el lunes”): te llega un aviso por WhatsApp cuando toque.",
};

const EMPTY: Record<ReminderKindValue, string> = {
  APPOINTMENT: "No hay recordatorios de citas por enviar. Se preparan solos un día antes de cada cita con fecha y hora.",
  FOLLOW_UP: "No hay clientes sin responder por ahora. Cuando alguien deje de contestar, aquí aparece el mensaje para retomar.",
  CUSTOM: "No tienes recordatorios programados. Crea uno con «Nuevo recordatorio».",
};

const isTask = (r: Pick<ReminderDto, "kind" | "autoSend">) => r.kind === "CUSTOM" && !r.autoSend;

/** "hoy 3:00 p. m.", "mañana 9:00 a. m." o "jueves 29 de octubre, 3:00 p. m.". */
function dueLabel(iso: string): string {
  const date = new Date(iso);
  const tz = "America/Bogota";
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const time = date.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: tz });
  if (day(date) === day(new Date())) return `Hoy ${time}`;
  if (day(date) === day(new Date(Date.now() + 86_400_000))) return `Mañana ${time}`;
  return `${date.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: tz })}, ${time}`;
}

export function RemindersPanel({ kind }: { kind: ReminderKindValue }): React.ReactElement {
  const [tab, setTab] = useState<ReminderStatusValue>("PENDING");
  const [showSettings, setShowSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useReminders({ status: tab, kind });
  const { data: pending } = useReminders({ status: "PENDING", kind });
  const { data: settings } = useReminderSettings();
  const prepare = usePrepareReminders();

  const disabled =
    settings && ((kind === "APPOINTMENT" && !settings.appointmentReminders) || (kind === "FOLLOW_UP" && !settings.followUpEnabled));
  const auto =
    settings && ((kind === "APPOINTMENT" && settings.appointmentReminderMode === "AUTO") || (kind === "FOLLOW_UP" && settings.followUpMode === "AUTO"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {INTRO[kind]}{" "}
          {kind !== "CUSTOM" && settings && (disabled ? "Está apagado." : auto ? "Salen solos de 8 a. m. a 8 p. m." : "Nada sale sin tu aprobación.")}
        </p>
        <div className="flex gap-2">
          {kind === "CUSTOM" ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nuevo recordatorio
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => prepare.mutate()} disabled={prepare.isPending}>
                <RefreshCw className={cn("h-4 w-4", prepare.isPending && "animate-spin")} /> Preparar ahora
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>
                <Settings2 className="h-4 w-4" /> Configurar
              </Button>
            </>
          )}
        </div>
      </div>

      {showSettings && kind !== "CUSTOM" && <SettingsCard kind={kind} />}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              onClick={() => setTab(t.status)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.status ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {kind === "CUSTOM" && t.status === "SENT" ? "Hechos o enviados" : t.label}
              {t.status === "PENDING" && pending && pending.length > 0 && (
                <span className="ml-1.5 rounded bg-wa/20 px-1 text-wa">{pending.length}</span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-muted/50" />
        ) : !data || data.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <BellRing className="h-6 w-6" />
              {tab === "PENDING" ? EMPTY[kind] : "No hay recordatorios en esta pestaña."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {data.map((r) => (
              <ReminderCard key={r.id} reminder={r} />
            ))}
          </div>
        )}
      </div>

      <NewReminderDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function ReminderCard({ reminder }: { reminder: ReminderDto }) {
  const [message, setMessage] = useState(reminder.message);
  const send = useSendReminder();
  const complete = useCompleteReminder();
  const dismiss = useDismissReminder();
  const editable = reminder.status === "PENDING" || reminder.status === "FAILED";
  const task = isTask(reminder);
  const busy = send.isPending || complete.isPending || dismiss.isPending;
  const due = new Date(reminder.dueAt) <= new Date();
  const Icon = reminder.kind === "APPOINTMENT" ? CalendarClock : reminder.kind === "FOLLOW_UP" ? MessageSquareReply : task ? ClipboardList : MessageCircle;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{reminder.client.name}</span>
              <Badge variant={task ? "secondary" : "wa"} className="gap-1">
                <Icon className="h-3 w-3" /> {task ? "Tarea" : reminder.kind === "APPOINTMENT" ? "Cita" : reminder.kind === "FOLLOW_UP" ? "Seguimiento" : "Mensaje"}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">{clientPhoneToDisplay(reminder.client.phone)}</div>
          </div>
          <span className={cn("text-[11px]", editable && due ? "font-semibold text-wa" : "text-muted-foreground")}>
            {reminder.sentAt
              ? `${task ? "Hecho" : "Enviado"} ${formatDistanceToNow(new Date(reminder.sentAt), { locale: es, addSuffix: true })}`
              : dueLabel(reminder.dueAt)}
          </span>
        </div>

        {reminder.note && <p className={cn("text-xs", task ? "text-sm font-medium" : "text-muted-foreground")}>{reminder.note}</p>}

        {editable && (!task || reminder.message) ? (
          <textarea
            rows={3}
            className={TEXTAREA}
            value={message}
            maxLength={1000}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={task ? "Mensaje para el cliente (opcional)" : undefined}
            aria-label={`Mensaje para ${reminder.client.name}`}
          />
        ) : (
          reminder.message && <p className="whitespace-pre-line rounded border border-border px-3 py-2 text-sm">{reminder.message}</p>
        )}

        {reminder.error && (
          <p className="text-xs text-destructive">{reminder.status === "DISMISSED" ? reminder.error : `Error al enviar: ${reminder.error}`}</p>
        )}

        {editable && (
          <div className="flex flex-wrap justify-end gap-2">
            {reminder.conversationId && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/chats?c=${reminder.conversationId}`}>Ver chat</Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => dismiss.mutate(reminder.id)} disabled={busy}>
              <X className="h-4 w-4" /> Descartar
            </Button>
            {task && (
              <Button variant={message.trim() ? "outline" : "wa"} size="sm" onClick={() => complete.mutate(reminder.id)} disabled={busy}>
                <Check className="h-4 w-4" /> Marcar hecho
              </Button>
            )}
            {(!task || message.trim().length >= 2) && (
              <Button
                variant="wa"
                size="sm"
                onClick={() => send.mutate({ id: reminder.id, message: message.trim() !== reminder.message ? message.trim() : undefined })}
                disabled={busy || message.trim().length < 2}
              >
                <Send className="h-4 w-4" /> {reminder.status === "FAILED" ? "Reintentar" : "Enviar ahora"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const HOURS_PRESETS: Record<"APPOINTMENT" | "FOLLOW_UP", { value: number; label: string }[]> = {
  APPOINTMENT: [
    { value: 2, label: "2 h antes" },
    { value: 12, label: "12 h antes" },
    { value: 24, label: "1 día antes" },
    { value: 48, label: "2 días antes" },
  ],
  FOLLOW_UP: [
    { value: 4, label: "4 horas" },
    { value: 20, label: "20 horas" },
    { value: 48, label: "2 días" },
    { value: 72, label: "3 días" },
  ],
};

function SettingsCard({ kind }: { kind: "APPOINTMENT" | "FOLLOW_UP" }) {
  const { data } = useReminderSettings();
  const save = useUpdateReminderSettings();
  const [form, setForm] = useState<ReminderSettingsDto | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!form || !data) return <div className="h-40 animate-pulse rounded-md bg-muted/50" />;

  const appointment = kind === "APPOINTMENT";
  const enabled = appointment ? form.appointmentReminders : form.followUpEnabled;
  const hours = appointment ? form.appointmentReminderHours : form.followUpHours;
  const mode = appointment ? form.appointmentReminderMode : form.followUpMode;
  const set = (patch: Partial<ReminderSettingsDto>) => setForm({ ...form, ...patch });
  const setEnabled = (v: boolean) => set(appointment ? { appointmentReminders: v } : { followUpEnabled: v });
  const setHours = (v: number) => set(appointment ? { appointmentReminderHours: v } : { followUpHours: v });
  const setMode = (v: "APPROVAL" | "AUTO") => set(appointment ? { appointmentReminderMode: v } : { followUpMode: v });
  const maxHours = appointment ? 72 : 168;

  function submit() {
    save.mutate(
      appointment
        ? {
            appointmentReminders: form!.appointmentReminders,
            appointmentReminderHours: form!.appointmentReminderHours,
            appointmentReminderMode: form!.appointmentReminderMode,
            templates: { APPOINTMENT: form!.templates.APPOINTMENT },
          }
        : {
            followUpEnabled: form!.followUpEnabled,
            followUpHours: form!.followUpHours,
            followUpMode: form!.followUpMode,
            templates: { FOLLOW_UP: form!.templates.FOLLOW_UP },
          },
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">{appointment ? "Recordar las citas" : "Hacer seguimiento"}</div>
            <p className="text-xs text-muted-foreground">
              {appointment ? "Escribirle al cliente antes de su cita para confirmarla." : "Escribirle una vez al cliente que dejó de responder."}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`hours-${kind}`}>{appointment ? "¿Cuándo se le recuerda?" : "¿Después de cuánto tiempo sin respuesta?"}</Label>
          <div className="flex flex-wrap items-center gap-2">
            {HOURS_PRESETS[kind].map((p) => (
              <Button key={p.value} type="button" size="sm" variant={hours === p.value ? "default" : "outline"} onClick={() => setHours(p.value)}>
                {p.label}
              </Button>
            ))}
            <div className="flex items-center gap-1.5">
              <Input
                id={`hours-${kind}`}
                type="number"
                min={1}
                max={maxHours}
                value={hours}
                onChange={(e) => setHours(Math.min(Math.max(Math.round(Number(e.target.value) || 1), 1), maxHours))}
                className="h-8 w-20"
              />
              <span className="text-xs text-muted-foreground">horas</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>¿Cómo salen?</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { value: "APPROVAL", title: "Pedirme permiso (recomendado)", text: "Los preparo y tú los apruebas, editas o descartas." },
                { value: "AUTO", title: "Enviar automático", text: "Salen solos a la hora, de 8 a. m. a 8 p. m." },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={mode === o.value}
                onClick={() => setMode(o.value)}
                className={cn("rounded-md border p-3 text-left text-sm", mode === o.value ? "border-wa bg-wa/5" : "border-border hover:bg-accent/50")}
              >
                <span className="block font-medium">{o.title}</span>
                <span className="block text-xs text-muted-foreground">{o.text}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`template-${kind}`}>Mensaje</Label>
          <textarea
            id={`template-${kind}`}
            rows={3}
            className={TEXTAREA}
            value={form.templates[kind]}
            placeholder={data.defaults[kind]}
            onChange={(e) => set({ templates: { ...form.templates, [kind]: e.target.value } })}
          />
          <p className="text-xs text-muted-foreground">
            Puedes usar {REMINDER_PLACEHOLDERS[kind].join(", ")}. Si lo dejas vacío se usa el de fábrica.
          </p>
        </div>

        <p className="rounded-md bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
          Con la API oficial de WhatsApp (Meta), un mensaje a alguien que no te ha escrito en las últimas 24 horas necesita una plantilla aprobada
          por Meta. {appointment ? "Si el cliente no ha escrito en el último día" : "Si eliges más de 24 horas"}, el envío puede fallar y el recordatorio
          queda en “Con error” para que lo envíes por otro medio.
        </p>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
