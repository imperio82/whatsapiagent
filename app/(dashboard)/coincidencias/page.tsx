"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ImageOff, RefreshCw, Send, Target, X } from "lucide-react";
import { Badge, type BadgeProps } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { useDismissMatch, useMatches, useRunAllMatches, useSendMatch } from "@hooks/use-matches";
import { useCurrentTenant } from "@hooks/use-tenant";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";
import type { MatchDto, MatchStatusValue } from "@modules/matching/application/use-cases";
import { cn } from "@lib/utils";

const TEXTAREA =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const TABS: { status: MatchStatusValue; label: string }[] = [
  { status: "PENDING", label: "Por aprobar" },
  { status: "SENT", label: "Enviadas" },
  { status: "FAILED", label: "Con error" },
  { status: "DISMISSED", label: "Descartadas" },
];

const TEMPERATURE: Record<NonNullable<MatchDto["buyer"]["temperature"]>, { label: string; variant: BadgeProps["variant"] }> = {
  HOT: { label: "🔥 Caliente", variant: "destructive" },
  WARM: { label: "Tibio", variant: "warning" },
  COLD: { label: "Frío", variant: "secondary" },
};

const cop = (v: number) => `$${v.toLocaleString("es-CO")}`;

export default function MatchesPage(): React.ReactElement {
  const [tab, setTab] = useState<MatchStatusValue>("PENDING");
  const { data: tenant } = useCurrentTenant();
  const { data, isLoading } = useMatches(tab);
  const { data: pending } = useMatches("PENDING");
  const review = useRunAllMatches();
  const near = review.data?.nearMisses ?? [];

  // Se agrupan por bien: el asesor ve "entró este carro → estos compradores"
  const groups = new Map<string, { listing: MatchDto["listing"]; matches: MatchDto[] }>();
  for (const m of data ?? []) {
    const g = groups.get(m.listing.id) ?? { listing: m.listing, matches: [] };
    g.matches.push(m);
    groups.set(m.listing.id, g);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Coincidencias</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Cuando entra un vehículo o inmueble, el sistema busca a los compradores que buscan algo así y te propone un mensaje.{" "}
            {tenant?.matchAlertMode === "AUTO"
              ? "Está en modo automático: los mensajes salen solos en horario hábil (máximo uno por cliente al día); los demás quedan aquí."
              : "Nada se envía sin tu aprobación: revisa, edita si quieres y envía."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate()}>
            <RefreshCw className={cn("h-4 w-4", review.isPending && "animate-spin")} />
            {review.isPending ? "Revisando…" : "Revisar inventario ahora"}
          </Button>
          <Link href="/configuracion/ia" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            Cambiar a {tenant?.matchAlertMode === "AUTO" ? "aprobación manual" : "envío automático"} o las reglas de ciudad
          </Link>
        </div>
      </div>

      {near.length > 0 && (
        <Card className="border-amber-500/40">
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="font-medium">Casi coinciden ({near.length})</div>
            <p className="text-xs text-muted-foreground">
              A estos compradores les falla una sola condición, así que no se les propuso mensaje. Si igual les sirve, escríbeles
              desde su conversación.
            </p>
            <ul className="space-y-1">
              {near.map((n) => (
                <li key={`${n.leadId}-${n.listingTitle}`} className="flex flex-wrap gap-x-2">
                  <Link href="/leads" className="font-medium underline-offset-4 hover:underline">
                    {n.name}
                  </Link>
                  <span className="text-muted-foreground">
                    · {n.listingTitle}: {n.missed}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : groups.size === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <Target className="h-6 w-6" />
            {tab === "PENDING"
              ? "No hay coincidencias por aprobar. Aparecen cuando agregas o apruebas un bien en el Inventario y hay compradores que buscan algo así."
              : "No hay coincidencias en esta pestaña."}
          </CardContent>
        </Card>
      ) : (
        [...groups.values()].map(({ listing, matches }) => (
          <section key={listing.id} className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-12 w-16 shrink-0 overflow-hidden rounded bg-muted">
                {listing.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={listing.photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <ImageOff className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold">
                  {listing.title} <span className="text-xs font-normal text-muted-foreground">{listing.code}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {cop(listing.priceCop)} · {[listing.zone, listing.city].filter(Boolean).join(", ")} · {matches.length} comprador
                  {matches.length === 1 ? "" : "es"}
                </div>
              </div>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {matches.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function MatchCard({ match }: { match: MatchDto }) {
  const [message, setMessage] = useState(match.message);
  const send = useSendMatch();
  const dismiss = useDismissMatch();
  const editable = match.status === "PENDING" || match.status === "FAILED";
  const temperature = match.buyer.temperature ? TEMPERATURE[match.buyer.temperature] : null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{match.buyer.name}</span>
              {temperature && <Badge variant={temperature.variant}>{temperature.label}</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">{clientPhoneToDisplay(match.buyer.phone)}</div>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(match.sentAt ?? match.createdAt), { locale: es, addSuffix: true })}
          </span>
        </div>

        <p className="rounded bg-muted/60 px-2 py-1 text-xs">
          <span className="font-medium">Por qué coincide:</span> {match.reasons}
        </p>

        {editable ? (
          <textarea
            rows={4}
            className={TEXTAREA}
            value={message}
            maxLength={1000}
            onChange={(e) => setMessage(e.target.value)}
            aria-label={`Mensaje para ${match.buyer.name}`}
          />
        ) : (
          <p className="whitespace-pre-line rounded border border-border px-3 py-2 text-sm">{match.message}</p>
        )}

        {match.error && <p className="text-xs text-destructive">Error al enviar: {match.error}</p>}

        {editable && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => dismiss.mutate(match.id)} disabled={dismiss.isPending || send.isPending}>
              <X className="h-4 w-4" /> Descartar
            </Button>
            <Button
              variant="wa"
              size="sm"
              onClick={() => send.mutate({ id: match.id, message: message.trim() !== match.message ? message.trim() : undefined })}
              disabled={send.isPending || message.trim().length < 5}
            >
              <Send className="h-4 w-4" /> {match.status === "FAILED" ? "Reintentar" : "Aprobar y enviar"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
