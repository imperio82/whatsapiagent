"use client";

import { useState } from "react";
import { Gauge } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { useSetLimitsEnforcement, useUsageLimits } from "@hooks/use-platform";
import type { TenantLimitsDto } from "@modules/platform/application/usage-limits.use-cases";
import { cn } from "@lib/utils";

const int = new Intl.NumberFormat("es-CO");
const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${Math.round(n * 100)} %`;

const LEVEL: Record<TenantLimitsDto["level"], { label: string; variant: "secondary" | "warning" | "destructive" | "success" }> = {
  NORMAL: { label: "Normal", variant: "success" },
  AVISO_70: { label: "70 %", variant: "warning" },
  AVISO_90: { label: "90 %", variant: "warning" },
  TOPE: { label: "Tope", variant: "destructive" },
};

/** Cupo de clientes y tope de IA de cada negocio, con las métricas del documento de límites de uso. */
export function UsageLimitsCard({ month }: { month: string }): React.ReactElement {
  const { data, isLoading } = useUsageLimits(month);
  const setEnforcement = useSetLimitsEnforcement();
  const [confirming, setConfirming] = useState(false);

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Cargando los límites de uso…</CardContent>
      </Card>
    );
  }

  const { totals, targets } = data;
  const active = data.enforcement === "activo";
  const tenants = data.tenants.filter((t) => t.status === "ACTIVE" || t.clientsServed > 0);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Gauge className="h-4 w-4" /> Límites de uso
            </h2>
            <p className="text-xs text-muted-foreground">
              Cliente atendido = un contacto que recibió al menos una respuesta de IA en el mes. Al llegar al cupo o al
              tope de IA (lo que pase primero), los chats abiertos siguen {targets.graceHours} h con el agente y los clientes
              nuevos reciben un mensaje fijo, sin IA, y pasan al equipo. El simulador no cuenta.
            </p>
          </div>
          <div className="space-y-1.5 text-right">
            <Badge variant={active ? "wa" : "secondary"}>{active ? "Activo: se aplica" : "Solo registro: no corta a nadie"}</Badge>
            <div className="flex justify-end gap-2">
              {active ? (
                <Button size="sm" variant="ghost" disabled={setEnforcement.isPending} onClick={() => setEnforcement.mutate({ enforcement: "registro" })}>
                  Volver a solo registro
                </Button>
              ) : confirming ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="wa"
                    disabled={setEnforcement.isPending}
                    onClick={() => {
                      setEnforcement.mutate({ enforcement: "activo" });
                      setConfirming(false);
                    }}
                  >
                    Sí, aplicar los límites
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                  Activar límites
                </Button>
              )}
            </div>
            {!active && (
              <p className="max-w-xs text-[10px] text-muted-foreground">
                Mientras tanto sigue el freno anterior: sin saldo de IA, el agente deja de responder.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Metric
            label="Costo de IA por cliente"
            value={cop.format(totals.costPerClientCop)}
            hint={`meta ≤ ${cop.format(targets.costPerClientCop)} · ${int.format(totals.clientsServed)} clientes`}
            warn={totals.costPerClientCop > targets.costPerClientCop}
          />
          <Metric label="Peso de la IA en el ingreso" value={pct(totals.aiShare)} hint={`meta ≤ ${pct(targets.aiShare)}`} warn={totals.aiShare > targets.aiShare} />
          <Metric label="Negocios en el tope" value={int.format(totals.tenantsAtCap)} hint={`${int.format(totals.tenantsWarned)} con aviso de 70 o 90 %`} />
          <Metric label="Clientes que quedaron en espera" value={int.format(totals.waitMessages)} hint="meta: lo más cerca de 0" warn={totals.waitMessages > 0} />
          <Metric
            label={`Contactos con ${targets.maxRepliesPerContact}+ respuestas`}
            value={int.format(totals.contactsAtLimit)}
            hint="revisar si son bots o spam"
            warn={totals.contactsAtLimit > 0}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-medium">Negocio</th>
                <th className="py-2 pr-3 font-medium">Clientes / cupo</th>
                <th className="py-2 pr-3 font-medium">IA / tope</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 pr-3 text-right font-medium">Por cliente</th>
                <th className="py-2 pr-3 text-right font-medium" title="Costo de IA sobre el precio del plan">Peso IA</th>
                <th className="py-2 pr-3 text-right font-medium">En espera</th>
                <th className="py-2 text-right font-medium" title={`Contactos con ${targets.maxRepliesPerContact} o más respuestas`}>
                  {targets.maxRepliesPerContact}+
                </th>
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-muted-foreground">
                    Todavía no hay uso este mes.
                  </td>
                </tr>
              )}
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-[10px] text-muted-foreground">{data.plans.find((p) => p.tier === t.plan)?.name}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <Bar value={t.clientsServed / t.chatLimit} />
                    <span className="tabular-nums">
                      {int.format(t.clientsServed)} / {int.format(t.chatLimit)}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <Bar value={t.budgetUsd > 0 ? t.spentUsd / t.budgetUsd : 0} />
                    <span className="tabular-nums">
                      {usd.format(t.spentUsd)} / {usd.format(t.budgetUsd)}
                    </span>
                    {t.simulatorUsd > 0 && (
                      <div className="text-[10px] text-muted-foreground">+ {usd.format(t.simulatorUsd)} del simulador</div>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge variant={LEVEL[t.level].variant}>{LEVEL[t.level].label}</Badge>
                    {t.inGrace && <div className="mt-0.5 text-[10px] text-muted-foreground">en gracia</div>}
                  </td>
                  <td className={cn("py-2 pr-3 text-right tabular-nums", t.costPerClientCop > targets.costPerClientCop && "text-destructive")}>
                    {t.clientsServed > 0 ? cop.format(t.costPerClientCop) : "—"}
                  </td>
                  <td className={cn("py-2 pr-3 text-right tabular-nums", t.aiShare > targets.aiShare && "text-destructive")}>{pct(t.aiShare)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{int.format(t.waitMessages)}</td>
                  <td className={cn("py-2 text-right tabular-nums", t.contactsAtLimit > 0 && "font-semibold text-destructive")}>
                    {int.format(t.contactsAtLimit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Límites por plan:{" "}
          {data.plans
            .map((p) => `${p.name} ${int.format(p.chats)} clientes y ${usd.format(p.aiBudgetUsd)} de IA (adicional ${cop.format(p.extraChatCop)})`)
            .join(" · ")}
          . Costos a {int.format(data.usdCopRate)} pesos por dólar, con la caché descontada.
        </p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("text-base font-semibold tabular-nums", warn && "text-destructive")}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  const width = Math.min(Math.max(value, 0), 1) * 100;
  return (
    <div className="mb-1 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", value >= 1 ? "bg-destructive" : value >= 0.7 ? "bg-amber-500" : "bg-emerald-500")}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
