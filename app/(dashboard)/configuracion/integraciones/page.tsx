"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Copy,
  Database,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Plug,
  Unplug,
  UserRound,
  Users,
} from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import {
  useDeleteGoogleApp,
  useDisconnectGoogle,
  useGoogleCalendars,
  useIntegrations,
  useSaveGoogleApp,
  useUpdateGoogleSettings,
} from "@hooks/use-integrations";
import { integrationsService, type ConnectionScope } from "@services/integrations.service";
import type { AgendaSettings } from "@modules/integrations/domain/agenda";
import type { ConnectionDto, GoogleOverviewDto } from "@modules/integrations/application/use-cases";
import { cn } from "@lib/utils";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const WEEK = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

export default function IntegrationsPage(): React.ReactElement {
  const { data, isLoading } = useIntegrations();
  const google = data?.google;

  return (
    <div className="max-w-3xl space-y-5">
      <Suspense fallback={null}>
        <GoogleReturnNotice />
      </Suspense>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integraciones</h1>
        <p className="text-sm text-muted-foreground">
          Cada negocio conecta sus propias cuentas, y cada persona del equipo su propio calendario. El asistente agenda las visitas en el calendario del
          asesor que esté libre.
        </p>
      </div>

      {isLoading || !google ? (
        <div className="h-48 animate-pulse rounded-lg bg-muted/50" />
      ) : (
        <>
          {!google.configured && <NotConfiguredNotice canManage={google.canManage} />}
          <MyCalendarCard google={google} />
          <BusinessCard google={google} />
          {google.canManage && <TeamCard google={google} />}
          {google.canManage && <CredentialsCard google={google} />}
        </>
      )}

      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">Excel, Google Sheets y bases de datos</div>
              <p className="text-xs text-muted-foreground">Cada negocio conecta sus propias fuentes. Las conexiones se guardan cifradas.</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/configuracion/datos">Ir a Fuentes de datos</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** Vuelta del flujo de Google: se avisa el resultado y se limpia la URL. */
function GoogleReturnNotice(): null {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const result = params.get("google");
    if (!result) return;
    const which = params.get("conexion") === "business" ? "La cuenta del negocio quedó conectada" : "Tu calendario quedó conectado";
    if (result === "ok") toast.success(`${which}. Revisa la agenda de visitas.`);
    else toast.error(params.get("mensaje") ?? "No se pudo conectar Google");
    router.replace("/configuracion/integraciones");
  }, [params, router]);
  return null;
}

function NotConfiguredNotice({ canManage }: { canManage: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div>
        Para conectar Google, el negocio necesita sus credenciales de Google Cloud (Client ID y Secret).{" "}
        {canManage ? "Cárgalas abajo en “Credenciales de Google”." : "Pídele al administrador del negocio que las cargue."}
      </div>
    </div>
  );
}

function StatusBadge({ connection }: { connection: ConnectionDto | null }) {
  if (!connection) return <Badge variant="outline">Sin conectar</Badge>;
  if (connection.status === "ERROR") return <Badge variant="destructive">Hay que reconectar</Badge>;
  return <Badge variant="success">Conectado</Badge>;
}

function ConnectButton({ scope, connection, disabled }: { scope: ConnectionScope; connection: ConnectionDto | null; disabled: boolean }) {
  const disconnect = useDisconnectGoogle(scope);
  if (connection?.status === "CONNECTED") {
    return (
      <Button variant="ghost" size="sm" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
        <Unplug className="h-4 w-4" /> Desconectar
      </Button>
    );
  }
  if (disabled) {
    return (
      <Button variant="wa" size="sm" disabled>
        <Plug className="h-4 w-4" /> Conectar con Google
      </Button>
    );
  }
  return (
    <Button asChild variant="wa" size="sm">
      {/* Navegación completa: el servidor redirige a la pantalla de permisos de Google */}
      <a href={integrationsService.googleConnectUrl(scope)}>
        <Plug className="h-4 w-4" /> {connection?.status === "ERROR" ? "Reconectar" : "Conectar con Google"}
      </a>
    </Button>
  );
}

function MyCalendarCard({ google }: { google: GoogleOverviewDto }) {
  const mine = google.mine;
  const save = useUpdateGoogleSettings("user");
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 h-5 w-5 text-wa" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Mi calendario</span>
                <StatusBadge connection={mine} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Conecta tu Google Calendar: el asistente te asigna visitas cuando estés libre y las crea en tu calendario. Lo que ya tengas agendado
                cuenta como ocupado.
              </p>
              {mine?.accountEmail && <p className="mt-1 text-xs">Cuenta: <span className="font-medium">{mine.accountEmail}</span></p>}
              {mine?.status === "ERROR" && mine.lastError && <p className="mt-1 text-xs text-destructive">{mine.lastError}</p>}
            </div>
          </div>
          <ConnectButton scope="user" connection={mine} disabled={!google.configured} />
        </div>

        {mine?.status === "CONNECTED" && (
          <>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">Recibir visitas</span>
                <span className="block text-xs text-muted-foreground">Apágalo si estás de vacaciones o no atiendes citas; tu calendario sigue conectado.</span>
              </span>
              <Switch checked={mine.acceptsVisits} onCheckedChange={(v) => save.mutate({ acceptsVisits: v })} disabled={save.isPending} />
            </label>
            <AgendaForm scope="user" agenda={mine.agenda} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BusinessCard({ google }: { google: GoogleOverviewDto }) {
  const business = google.business;
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Cuenta de Google del negocio</span>
                <StatusBadge connection={business} />
                <Badge variant="outline" className="gap-1">
                  <CalendarDays className="h-3 w-3" /> Calendario compartido
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" /> Google Sheets
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Para sincronizar hojas de cálculo, y como calendario de visitas cuando nadie del equipo tiene el suyo conectado.
              </p>
              {business?.accountEmail && <p className="mt-1 text-xs">Cuenta: <span className="font-medium">{business.accountEmail}</span></p>}
              {business?.status === "ERROR" && business.lastError && <p className="mt-1 text-xs text-destructive">{business.lastError}</p>}
            </div>
          </div>
          {google.canManage && <ConnectButton scope="business" connection={business} disabled={!google.configured} />}
        </div>
        {google.canManage && business?.status === "CONNECTED" && <AgendaForm scope="business" agenda={business.agenda} />}
      </CardContent>
    </Card>
  );
}

function TeamCard({ google }: { google: GoogleOverviewDto }) {
  const receiving = google.team.filter((m) => m.connection?.status === "CONNECTED" && m.connection.acceptsVisits).length;
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <div className="font-semibold">Calendarios del equipo</div>
            <p className="text-xs text-muted-foreground">
              {receiving > 0
                ? `Las visitas se reparten entre ${receiving} asesor${receiving === 1 ? "" : "es"}: a cada cita se asigna el libre con menos citas próximas.`
                : google.business?.status === "CONNECTED"
                  ? "Nadie del equipo tiene su calendario conectado: las visitas se agendan en el calendario del negocio."
                  : "Nadie tiene calendario conectado: el asistente deja las visitas como solicitud y un asesor confirma la hora."}{" "}
              Cada persona conecta el suyo desde esta misma página.
            </p>
          </div>
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {google.team.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{m.name}</div>
                <div className="truncate text-xs text-muted-foreground">{m.connection?.accountEmail ?? m.email}</div>
              </div>
              {!m.connection ? (
                <Badge variant="outline">Sin calendario</Badge>
              ) : m.connection.status === "ERROR" ? (
                <Badge variant="destructive">Hay que reconectar</Badge>
              ) : m.connection.acceptsVisits ? (
                <Badge variant="success">Recibe visitas</Badge>
              ) : (
                <Badge variant="secondary">No recibe visitas</Badge>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CredentialsCard({ google }: { google: GoogleOverviewDto }) {
  const save = useSaveGoogleApp();
  const remove = useDeleteGoogleApp();
  const [clientId, setClientId] = useState(google.ownClientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [editing, setEditing] = useState(!google.configured);

  const sourceText =
    google.credentialsSource === "tenant"
      ? "Usando las credenciales propias del negocio."
      : google.credentialsSource === "platform"
        ? "Usando las credenciales de la plataforma. Puedes usar las de tu propio proyecto de Google Cloud."
        : "Aún no hay credenciales.";

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Credenciales de Google</span>
                {google.credentialsSource === "tenant" && <Badge variant="wa">Propias</Badge>}
                {google.credentialsSource === "platform" && <Badge variant="outline">De la plataforma</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {sourceText} El secreto se guarda cifrado y no se vuelve a mostrar. Si cambias las credenciales, las cuentas conectadas deben
                reconectarse.
              </p>
            </div>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              {google.credentialsSource === "tenant" ? "Cambiar" : "Usar las mías"}
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>URI de redireccionamiento autorizado</Label>
          <div className="flex gap-2">
            <Input readOnly value={google.redirectUri} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Copiar URI"
              onClick={() => void navigator.clipboard.writeText(google.redirectUri).then(() => toast.success("Copiado"))}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Regístralo en tu proyecto de Google Cloud (Credenciales → ID de cliente OAuth → Aplicación web). La guía paso a paso está en{" "}
            <code>docs/INTEGRACION-GOOGLE.md</code>.
          </p>
        </div>

        {editing && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="clientId">Client ID</Label>
              <Input id="clientId" placeholder="xxxxxxxx.apps.googleusercontent.com" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <Input
                id="clientSecret"
                type="password"
                autoComplete="off"
                placeholder={google.credentialsSource === "tenant" ? "Escribe el secreto otra vez para cambiarlo" : "GOCSPX-…"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              {google.credentialsSource === "tenant" ? (
                <Button variant="ghost" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
                  Quitar las propias
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                {google.configured && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    Cancelar
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={save.isPending || !clientId.trim() || clientSecret.trim().length < 10}
                  onClick={async () => {
                    await save.mutateAsync({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
                    setClientSecret("");
                    setEditing(false);
                  }}
                >
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar credenciales
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgendaForm({ scope, agenda }: { scope: ConnectionScope; agenda: AgendaSettings }) {
  const [form, setForm] = useState(agenda);
  const calendars = useGoogleCalendars(scope, true);
  const save = useUpdateGoogleSettings(scope);
  const set = <K extends keyof AgendaSettings>(key: K, value: AgendaSettings[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleDay = (d: number) =>
    set("workDays", form.workDays.includes(d) ? form.workDays.filter((x) => x !== d) : [...form.workDays, d].sort());

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div>
        <div className="text-sm font-semibold">{scope === "user" ? "Mi horario de visitas" : "Horario del calendario del negocio"}</div>
        <p className="text-xs text-muted-foreground">El asistente solo ofrece horarios dentro de esto y que estén libres en el calendario elegido.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`calendar-${scope}`}>Calendario donde se crean las citas</Label>
          <select id={`calendar-${scope}`} className={SELECT} value={form.calendarId} onChange={(e) => set("calendarId", e.target.value)}>
            {calendars.isLoading && <option value={form.calendarId}>Cargando calendarios…</option>}
            {calendars.data?.map((c) => (
              <option key={c.id} value={c.primary ? "primary" : c.id}>
                {c.name}
                {c.primary ? " (principal)" : ""}
              </option>
            ))}
            {calendars.isError && <option value={form.calendarId}>{form.calendarId === "primary" ? "Principal" : form.calendarId}</option>}
          </select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Días de visitas</Label>
          <div className="flex flex-wrap gap-1">
            {WEEK.map((d) => (
              <button
                key={d.value}
                type="button"
                aria-pressed={form.workDays.includes(d.value)}
                onClick={() => toggleDay(d.value)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium",
                  form.workDays.includes(d.value) ? "border-wa bg-wa/10 text-wa" : "border-border text-muted-foreground hover:bg-accent/50",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`dayStart-${scope}`}>Desde</Label>
          <Input id={`dayStart-${scope}`} type="time" value={form.dayStart} onChange={(e) => set("dayStart", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`dayEnd-${scope}`}>Hasta</Label>
          <Input id={`dayEnd-${scope}`} type="time" value={form.dayEnd} onChange={(e) => set("dayEnd", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`slot-${scope}`}>Duración de cada cita</Label>
          <select id={`slot-${scope}`} className={SELECT} value={form.slotMinutes} onChange={(e) => set("slotMinutes", Number(e.target.value))}>
            {[
              [30, "30 minutos"],
              [45, "45 minutos"],
              [60, "1 hora"],
              [90, "1 hora y media"],
              [120, "2 horas"],
            ].map(([m, label]) => (
              <option key={m} value={m}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`notice-${scope}`}>Anticipación mínima</Label>
          <select id={`notice-${scope}`} className={SELECT} value={form.minNoticeHours} onChange={(e) => set("minNoticeHours", Number(e.target.value))}>
            {[
              [0, "Sin anticipación"],
              [1, "1 hora"],
              [2, "2 horas"],
              [4, "4 horas"],
              [12, "12 horas"],
              [24, "1 día"],
              [48, "2 días"],
            ].map(([h, label]) => (
              <option key={h} value={h}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate(form)} disabled={save.isPending || form.workDays.length === 0}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar horario
        </Button>
      </div>
    </div>
  );
}
