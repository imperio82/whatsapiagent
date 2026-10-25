"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarHeart, Cake, Gift, Loader2, RefreshCw, Send, Settings2, X } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Label } from "@components/ui/label";
import {
  useDismissGreeting,
  useGreetingSettings,
  useGreetings,
  usePrepareGreetings,
  useSendGreeting,
  useUpcomingDates,
  useUpdateGreetingSettings,
} from "@hooks/use-greetings";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";
import {
  DATE_KIND_LABELS,
  TEMPLATE_KEY_LABELS,
  TEMPLATE_PLACEHOLDERS,
  formatMonthDay,
  type GreetingTemplateKey,
} from "@modules/clients/domain/special-dates";
import type { GreetingDto, GreetingStatusValue } from "@modules/greetings/application/use-cases";
import { cn } from "@lib/utils";

const TEXTAREA =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const TABS: { status: GreetingStatusValue; label: string }[] = [
  { status: "PENDING", label: "Por enviar" },
  { status: "SENT", label: "Enviadas" },
  { status: "FAILED", label: "Con error" },
  { status: "DISMISSED", label: "Descartadas" },
];

/** "hoy", "mañana" o "jueves 16 de octubre". */
function whenLabel(day: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  if (day === today) return "Hoy";
  if (day === tomorrow) return "Mañana";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function whatLabel(date: { kind: GreetingDto["date"]["kind"]; label: string | null; personName: string | null }): string {
  if (date.kind === "BIRTHDAY") return date.personName ? `Cumpleaños de ${date.personName}` : "Cumpleaños";
  return date.label ?? DATE_KIND_LABELS[date.kind];
}

/** Felicitaciones de cumpleaños y fechas especiales: una pestaña de Recordatorios. */
export function GreetingsPanel(): React.ReactElement {
  const [tab, setTab] = useState<GreetingStatusValue>("PENDING");
  const [showSettings, setShowSettings] = useState(false);
  const { data, isLoading } = useGreetings(tab);
  const { data: pending } = useGreetings("PENDING");
  const { data: settings } = useGreetingSettings();
  const prepare = usePrepareGreetings();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Cumpleaños y fechas especiales de tus clientes y de su gente. El día anterior se prepara el mensaje;{" "}
            {settings?.mode === "AUTO"
              ? "está en modo automático: sale solo el día de la fecha entre 9 a. m. y 7 p. m."
              : "nada sale sin tu aprobación."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => prepare.mutate()} disabled={prepare.isPending}>
            <RefreshCw className={cn("h-4 w-4", prepare.isPending && "animate-spin")} /> Preparar ahora
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>
            <Settings2 className="h-4 w-4" /> Configurar
          </Button>
        </div>
      </div>

      {showSettings && <SettingsCard />}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
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
                {t.label}
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
                <Cake className="h-6 w-6" />
                {tab === "PENDING"
                  ? "No hay felicitaciones por enviar. Agrega fechas en la ficha de cada cliente, importa tu lista de clientes con su cumpleaños, o deja que la IA las guarde cuando un cliente las mencione."
                  : "No hay felicitaciones en esta pestaña."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2">
              {data.map((g) => (
                <GreetingCard key={g.id} greeting={g} />
              ))}
            </div>
          )}
        </div>

        <UpcomingCard />
      </div>
    </div>
  );
}

function GreetingCard({ greeting }: { greeting: GreetingDto }) {
  const [message, setMessage] = useState(greeting.message);
  const send = useSendGreeting();
  const dismiss = useDismissGreeting();
  const editable = greeting.status === "PENDING" || greeting.status === "FAILED";

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{greeting.client.name}</span>
              <Badge variant="wa" className="gap-1">
                <Gift className="h-3 w-3" /> {whatLabel(greeting.date)}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">{clientPhoneToDisplay(greeting.client.phone)}</div>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {greeting.sentAt ? `Enviada ${formatDistanceToNow(new Date(greeting.sentAt), { locale: es, addSuffix: true })}` : whenLabel(greeting.occursOn)}
          </span>
        </div>

        {editable ? (
          <textarea
            rows={3}
            className={TEXTAREA}
            value={message}
            maxLength={1000}
            onChange={(e) => setMessage(e.target.value)}
            aria-label={`Mensaje para ${greeting.client.name}`}
          />
        ) : (
          <p className="whitespace-pre-line rounded border border-border px-3 py-2 text-sm">{greeting.message}</p>
        )}

        {greeting.error && <p className="text-xs text-destructive">{greeting.status === "DISMISSED" ? greeting.error : `Error al enviar: ${greeting.error}`}</p>}

        {editable && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => dismiss.mutate(greeting.id)} disabled={dismiss.isPending || send.isPending}>
              <X className="h-4 w-4" /> Descartar
            </Button>
            <Button
              variant="wa"
              size="sm"
              onClick={() => send.mutate({ id: greeting.id, message: message.trim() !== greeting.message ? message.trim() : undefined })}
              disabled={send.isPending || message.trim().length < 2}
            >
              <Send className="h-4 w-4" /> {greeting.status === "FAILED" ? "Reintentar" : "Enviar ahora"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingCard() {
  const { data, isLoading } = useUpcomingDates();
  return (
    <Card className="h-fit">
      <CardContent className="p-0">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarHeart className="h-4 w-4 text-wa" /> Próximos 30 días
          </div>
          <div className="text-xs text-muted-foreground">Para adelantarte con una llamada o un detalle</div>
        </div>
        {isLoading ? (
          <div className="h-24 animate-pulse bg-muted/30" />
        ) : !data || data.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">No hay fechas en los próximos 30 días.</div>
        ) : (
          <ul className="max-h-[480px] divide-y divide-border overflow-y-auto">
            {data.map((d) => (
              <li key={`${d.id}-${d.day}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.client.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {whatLabel(d)}
                    {d.year && d.kind === "BIRTHDAY" && !d.personName ? ` · cumple ${Number(d.day.slice(0, 4)) - d.year}` : ""}
                    {d.client.greetingsOptOut ? " · no recibe mensajes" : ""}
                  </div>
                </div>
                <span className={cn("shrink-0 text-xs", d.inDays <= 1 ? "font-semibold text-wa" : "text-muted-foreground")}>
                  {d.inDays === 0 ? "Hoy" : d.inDays === 1 ? "Mañana" : `${formatMonthDay({ month: Number(d.day.slice(5, 7)), day: Number(d.day.slice(8, 10)), year: null })}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsCard() {
  const { data } = useGreetingSettings();
  const save = useUpdateGreetingSettings();
  const [mode, setMode] = useState<"APPROVAL" | "AUTO">("APPROVAL");
  const [templates, setTemplates] = useState<Record<GreetingTemplateKey, string> | null>(null);

  useEffect(() => {
    if (data) {
      setMode(data.mode);
      setTemplates(data.templates);
    }
  }, [data]);

  if (!data || !templates) return <div className="h-40 animate-pulse rounded-md bg-muted/50" />;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="space-y-2">
          <Label>¿Cómo salen las felicitaciones?</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { value: "APPROVAL", title: "Pedirme permiso (recomendado)", text: "Las preparo el día anterior y tú las apruebas o editas." },
                { value: "AUTO", title: "Enviar automático", text: "Salen solas el día de la fecha, de 9 a. m. a 7 p. m." },
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

        <div className="space-y-3">
          <div>
            <Label>Mensajes</Label>
            <p className="text-xs text-muted-foreground">
              Puedes usar {TEMPLATE_PLACEHOLDERS.join(", ")}. Si dejas uno vacío se usa el de fábrica. Cada fecha puede tener además su propio mensaje en
              la ficha del cliente.
            </p>
          </div>
          {(Object.keys(TEMPLATE_KEY_LABELS) as GreetingTemplateKey[]).map((key) => (
            <div key={key} className="space-y-1">
              <span className="text-xs font-medium">{TEMPLATE_KEY_LABELS[key]}</span>
              <textarea
                rows={2}
                className={TEXTAREA}
                value={templates[key]}
                placeholder={data.defaults[key]}
                onChange={(e) => setTemplates({ ...templates, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <p className="rounded-md bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
          Con la API oficial de WhatsApp (Meta), un mensaje a alguien que no te ha escrito en las últimas 24 horas necesita una plantilla aprobada por
          Meta. Si el envío falla por eso, la felicitación queda en “Con error” para que la envíes por otro medio.
        </p>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate({ mode, templates })} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
