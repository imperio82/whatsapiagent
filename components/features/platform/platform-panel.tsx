"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Banknote,
  BarChart3,
  Building2,
  Coins,
  Cpu,
  History,
  MessageSquare,
  PiggyBank,
  Search,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import {
  useAddBillingEntry,
  useBillingEntries,
  usePlatformOverview,
  useTenantCosts,
  useUpdateTenantBilling,
} from "@hooks/use-platform";
import {
  EXTRA_CHAT_COP,
  META_FREE_SERVICE_MESSAGES,
  META_SERVICE_COP,
  PLANS,
  PLAN_TIERS,
  extendPaidUntil,
  monthKey,
  type PlanTier,
} from "@modules/billing/domain/plans";
import type { PlatformTenantDto } from "@modules/platform/application/platform.use-cases";
import { cn } from "@lib/utils";
import { AgentModelCard } from "./agent-model-card";
import { VoiceModelCard } from "./voice-model-card";
import { UsageLimitsCard } from "./usage-limits-card";
import { RechargesCard } from "./recharges-card";

const SELECT =
  "flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const usd4 = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
// Cada respuesta cuesta fracciones de centavo: por debajo de un dólar se muestran más decimales
const usd = { format: (n: number) => (n > 0 && n < 1 ? usd4 : usd2).format(n) };
const int = new Intl.NumberFormat("es-CO");
const one = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const compact = {
  format: (n: number) => (n >= 1_000_000 ? `${one.format(n / 1_000_000)} M` : n >= 1_000 ? `${one.format(n / 1_000)} k` : int.format(n)),
};
const day = (iso: string) => format(new Date(iso), "d MMM yyyy", { locale: es });
const monthLabel = (key: string) => format(new Date(`${key}-01T12:00:00`), "MMMM yyyy", { locale: es });

const STATUS_LABEL = { ACTIVE: "Activo", SUSPENDED: "Suspendido", CANCELLED: "Cancelado" } as const;

type EntryMode = { tenant: PlatformTenantDto; kind: "PAYMENT" | "CREDIT" };

export function PlatformPanel(): React.ReactElement {
  const currentMonth = monthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const { data, isLoading } = usePlatformOverview(month);
  const update = useUpdateTenantBilling();
  const [query, setQuery] = useState("");
  const [entry, setEntry] = useState<EntryMode | null>(null);
  const [history, setHistory] = useState<PlatformTenantDto | null>(null);
  const [costs, setCosts] = useState<PlatformTenantDto | null>(null);

  const tenants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data || !q) return data?.tenants ?? [];
    return data.tenants.filter((t) => `${t.name} ${t.slug} ${t.ownerEmail ?? ""}`.toLowerCase().includes(q));
  }, [data, query]);

  const totals = data?.totals;
  const now = new Date();
  const isCurrent = month === currentMonth;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes, cobros y costos</h1>
          <p className="text-sm text-muted-foreground">
            Todos los negocios: su plan, lo que pagaron, los tokens y dólares de IA que gastaron y lo que te deja cada uno.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="platform-month" className="text-xs text-muted-foreground">
            Mes
          </Label>
          <Input
            id="platform-month"
            type="month"
            value={month}
            max={currentMonth}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="h-9 w-44"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat icon={Building2} label="Negocios activos" value={totals ? `${totals.activeTenants} de ${totals.tenants}` : "—"} />
        <Stat icon={Banknote} label="Ingreso mensual" value={totals ? cop.format(totals.mrrCop) : "—"} hint="Activos y al día" />
        <Stat icon={Coins} label="Pagos del mes" value={totals ? cop.format(totals.paymentsCop) : "—"} />
        <Stat
          icon={Wallet}
          label="Costo IA del mes"
          value={totals ? usd.format(totals.spentUsd) : "—"}
          hint={totals ? `${cop.format(totals.aiCostCop)} · ${int.format(totals.aiReplies)} respuestas` : undefined}
        />
        <Stat
          icon={Cpu}
          label="Tokens del mes"
          value={totals ? compact.format(totals.tokensIn + totals.tokensOut) : "—"}
          hint={
            totals
              ? `${compact.format(totals.tokensIn)} entrada (${compact.format(totals.cachedTokensIn)} en caché) · ${compact.format(totals.tokensOut)} salida`
              : undefined
          }
        />
        <Stat
          icon={PiggyBank}
          label="Margen estimado"
          value={totals ? cop.format(totals.marginCop) : "—"}
          hint="Ingreso de los que están al día menos IA"
        />
        <Stat
          icon={MessageSquare}
          label="Chats activos (24 h)"
          value={totals ? int.format(totals.activeChats) : "—"}
          hint={totals ? `${int.format(totals.chats)} clientes en el mes` : undefined}
        />
        <Stat
          icon={TriangleAlert}
          label="Vencidos o sin pago"
          value={totals ? int.format(totals.overdue) : "—"}
          warn={!!totals && totals.overdue > 0}
        />
      </div>

      <RechargesCard />

      <UsageLimitsCard month={month} />

      <AgentModelCard />

      <VoiceModelCard />

      <Card>
        <div className="flex items-center gap-3 border-b border-border p-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por negocio o correo" className="pl-8" />
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            {tenants.length} negocios · {monthLabel(month)}
          </span>
        </div>
        <CardContent className="overflow-x-auto p-0">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : tenants.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Sin negocios.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2.5">Negocio</th>
                  <th className="px-3 py-2.5">Plan y estado</th>
                  <th className="px-3 py-2.5">Pagado hasta</th>
                  <th className="px-3 py-2.5 text-right">Clientes</th>
                  <th className="px-3 py-2.5 text-right">Respuestas IA</th>
                  <th className="px-3 py-2.5 text-right">Tokens</th>
                  <th className="px-3 py-2.5">Costo IA</th>
                  <th className="px-3 py-2.5 text-right" title="Notas de voz del agente y audios de clientes transcritos (incluido en el costo IA)">
                    Voz
                  </th>
                  <th className="px-3 py-2.5 text-right">Por cliente</th>
                  <th className="px-3 py-2.5 text-right" title="Lo que el negocio le paga a Meta, estimado">
                    Meta (est.)
                  </th>
                  <th className="px-3 py-2.5 text-right">Margen</th>
                  <th className="px-3 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tenants.map((t) => {
                  const overdue = !t.paidUntil || new Date(t.paidUntil) < now;
                  const ratio = t.budgetUsd > 0 ? t.spentUsd / t.budgetUsd : 1;
                  return (
                    <tr key={t.id} className={cn("align-top", t.status !== "ACTIVE" && "opacity-60")}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.ownerEmail ?? t.slug}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {t.agentProfile === "BROKERAGE" ? "Intermediación" : "Tienda"} · {t.members}{" "}
                          {t.members === 1 ? "usuario" : "usuarios"} ·{" "}
                          {t.whatsapp ? <span className="font-mono">+{t.whatsapp.phone}</span> : "sin WhatsApp"}
                        </div>
                      </td>
                      <td className="space-y-1 px-3 py-2.5">
                        <select
                          className={SELECT}
                          value={t.plan}
                          disabled={update.isPending}
                          onChange={(e) => update.mutate({ id: t.id, input: { plan: e.target.value as PlanTier } })}
                          aria-label={`Plan de ${t.name}`}
                        >
                          {PLAN_TIERS.map((tier) => (
                            <option key={tier} value={tier}>
                              {PLANS[tier].name} · {cop.format(PLANS[tier].priceCop)}
                            </option>
                          ))}
                        </select>
                        <select
                          className={SELECT}
                          value={t.status}
                          disabled={update.isPending}
                          onChange={(e) =>
                            update.mutate({ id: t.id, input: { status: e.target.value as PlatformTenantDto["status"] } })
                          }
                          aria-label={`Estado de ${t.name}`}
                        >
                          {Object.entries(STATUS_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        {t.paidUntil ? (
                          <Badge variant={overdue ? "destructive" : "success"}>
                            {overdue ? "Venció " : ""}
                            {day(t.paidUntil)}
                          </Badge>
                        ) : (
                          <Badge variant="warning">Sin pagos</Badge>
                        )}
                        {t.lastPaymentAt && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">Último pago {day(t.lastPaymentAt)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={cn(t.chats > t.chatLimit && "font-semibold text-destructive")}>{int.format(t.chats)}</span>
                        <span className="text-muted-foreground"> / {int.format(t.chatLimit)}</span>
                        {isCurrent && <div className="text-[10px] text-muted-foreground">{t.activeChats} activos hoy</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {int.format(t.aiReplies)}
                        <div className="text-[10px] text-muted-foreground">{usd.format(t.costPerReplyUsd)} c/u</div>
                      </td>
                      <td
                        className="px-3 py-2.5 text-right tabular-nums"
                        title={`${int.format(t.tokensIn)} de entrada · ${int.format(t.tokensOut)} de salida`}
                      >
                        {compact.format(t.tokensIn + t.tokensOut)}
                        <div className="text-[10px] text-muted-foreground">
                          {compact.format(t.tokensIn)} / {compact.format(t.tokensOut)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="tabular-nums">
                          {usd.format(t.spentUsd)} <span className="text-muted-foreground">/ {usd2.format(t.budgetUsd)}</span>
                        </div>
                        <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full", ratio >= 1 ? "bg-destructive" : ratio >= 0.8 ? "bg-amber-500" : "bg-wa")}
                            style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                          />
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{cop.format(t.aiCostCop)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {usd.format(t.voiceUsd)}
                        <div className="text-[10px] text-muted-foreground">
                          {int.format(t.voiceNotes)} notas · {int.format(t.transcriptions)} oídas
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{usd.format(t.costPerChatUsd)}</td>
                      <td
                        className="px-3 py-2.5 text-right tabular-nums"
                        title={`${int.format(t.outboundMessages)} mensajes enviados en el mes`}
                      >
                        {cop.format(t.metaCostCop)}
                        <div className="text-[10px] text-muted-foreground">{int.format(t.outboundMessages)} enviados</div>
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-right font-medium tabular-nums", t.marginCop < 0 && "text-destructive")}
                      >
                        {cop.format(t.marginCop)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="wa" onClick={() => setEntry({ tenant: t, kind: "PAYMENT" })}>
                            Pago
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEntry({ tenant: t, kind: "CREDIT" })}>
                            Crédito
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCosts(t)} aria-label={`Costos de ${t.name}`} title="Costos">
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setHistory(t)} aria-label={`Historial de cobros de ${t.name}`} title="Historial de cobros">
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>
          Costo IA: lo que cobra el proveedor de IA por los tokens de cada respuesta, más las notas de voz y los audios
          transcritos (columna Voz), calculado con las tablas de precios del servidor. En pesos a {data ? cop.format(data.usdCopRate) : "—"} por dólar (USD_COP_RATE).
        </li>
        <li>
          Meta (est.): lo que el negocio le paga a Meta por sus mensajes enviados, {META_SERVICE_COP} pesos cada uno después de
          las {int.format(META_FREE_SERVICE_MESSAGES)} gratis del mes. Las plantillas de marketing no están incluidas.
        </li>
        <li>
          Margen: precio del plan menos el costo de IA; Meta lo paga el negocio. El presupuesto de IA del mes es el del plan más
          los créditos que le sumes. Qué pasa al llegar al cupo o al tope: ver <em>Límites de uso</em>. Cliente adicional por
          encima del cupo: desde {cop.format(EXTRA_CHAT_COP)}.
        </li>
      </ul>

      {entry && <EntryDialog key={`${entry.tenant.id}-${entry.kind}`} mode={entry} onClose={() => setEntry(null)} />}
      <HistoryDialog tenant={history} onClose={() => setHistory(null)} />
      <CostsDialog tenant={costs} month={month} onClose={() => setCosts(null)} />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  warn,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className={cn("h-3.5 w-3.5", warn && "text-destructive")} /> {label}
        </div>
        <div className={cn("text-lg font-semibold tabular-nums", warn && "text-destructive")}>{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function CostsDialog({ tenant, month, onClose }: { tenant: PlatformTenantDto | null; month: string; onClose: () => void }) {
  const { data, isLoading } = useTenantCosts(tenant?.id ?? null, month);
  return (
    <Dialog open={tenant !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Costos de {tenant?.name}</DialogTitle>
          <DialogDescription>
            Últimos 6 meses hasta {monthLabel(month)}. El detalle por modelo y por chat es de {monthLabel(month)}.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="space-y-5">
            <section className="overflow-x-auto">
              <h3 className="mb-2 text-sm font-semibold">Por mes</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 pr-3">Mes</th>
                    <th className="py-1.5 pr-3 text-right">Clientes</th>
                    <th className="py-1.5 pr-3 text-right">Respuestas</th>
                    <th className="py-1.5 pr-3 text-right">Tokens entrada</th>
                    <th className="py-1.5 pr-3 text-right">Tokens salida</th>
                    <th className="py-1.5 pr-3 text-right">Costo IA</th>
                    <th className="py-1.5 pr-3 text-right">En pesos</th>
                    <th className="py-1.5 pr-3 text-right">Voz</th>
                    <th className="py-1.5 pr-3 text-right">Por cliente</th>
                    <th className="py-1.5 pr-3 text-right">Por respuesta</th>
                    <th className="py-1.5 text-right">Meta (est.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <td className="py-1.5 pr-3 capitalize">{monthLabel(m.month)}</td>
                      <td className="py-1.5 pr-3 text-right">{int.format(m.chats)}</td>
                      <td className="py-1.5 pr-3 text-right">{int.format(m.aiReplies)}</td>
                      <td className="py-1.5 pr-3 text-right">{int.format(m.tokensIn)}</td>
                      <td className="py-1.5 pr-3 text-right">{int.format(m.tokensOut)}</td>
                      <td className="py-1.5 pr-3 text-right font-medium">{usd.format(m.spentUsd)}</td>
                      <td className="py-1.5 pr-3 text-right">{cop.format(m.aiCostCop)}</td>
                      <td className="py-1.5 pr-3 text-right" title={`${m.voiceNotes} notas de voz · ${m.transcriptions} audios transcritos`}>
                        {usd.format(m.voiceUsd)}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{usd.format(m.costPerChatUsd)}</td>
                      <td className="py-1.5 pr-3 text-right">{usd.format(m.costPerReplyUsd)}</td>
                      <td className="py-1.5 text-right">{cop.format(m.metaCostCop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <div className="grid gap-5 md:grid-cols-2">
              <section>
                <h3 className="mb-2 text-sm font-semibold">Por modelo</h3>
                {data.models.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin uso de IA en el mes.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-1.5 pr-3">Modelo</th>
                        <th className="py-1.5 pr-3 text-right">Respuestas</th>
                        <th className="py-1.5 pr-3 text-right">Tokens</th>
                        <th className="py-1.5 text-right">Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {data.models.map((m) => (
                        <tr key={m.model}>
                          <td className="py-1.5 pr-3 font-mono">{m.model}</td>
                          <td className="py-1.5 pr-3 text-right">{int.format(m.replies)}</td>
                          <td className="py-1.5 pr-3 text-right" title={`${int.format(m.tokensIn)} / ${int.format(m.tokensOut)}`}>
                            {compact.format(m.tokensIn + m.tokensOut)}
                          </td>
                          <td className="py-1.5 text-right">{usd.format(m.spentUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Chats que más costaron</h3>
                {data.topConversations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin uso de IA en el mes.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-1.5 pr-3">Cliente</th>
                        <th className="py-1.5 pr-3 text-right">Respuestas</th>
                        <th className="py-1.5 pr-3 text-right">Tokens</th>
                        <th className="py-1.5 text-right">Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {data.topConversations.map((c) => (
                        <tr key={c.id}>
                          <td className="max-w-[12rem] truncate py-1.5 pr-3" title={c.label}>
                            {c.label}
                          </td>
                          <td className="py-1.5 pr-3 text-right">{int.format(c.replies)}</td>
                          <td className="py-1.5 pr-3 text-right" title={`${int.format(c.tokensIn)} / ${int.format(c.tokensOut)}`}>
                            {compact.format(c.tokensIn + c.tokensOut)}
                          </td>
                          <td className="py-1.5 text-right">{usd.format(c.spentUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EntryDialog({ mode, onClose }: { mode: EntryMode; onClose: () => void }) {
  const { tenant, kind } = mode;
  const add = useAddBillingEntry();
  const plan = PLANS[tenant.plan];
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(String(plan.priceCop));
  const [credit, setCredit] = useState("5");
  const [note, setNote] = useState("");

  const value = Number(kind === "PAYMENT" ? amount : credit);
  const valid = Number.isFinite(value) && value > 0;
  const newPaidUntil = extendPaidUntil(tenant.paidUntil ? new Date(tenant.paidUntil) : null, months);

  function pickMonths(next: number) {
    setMonths(next);
    // Pago anual: 12 meses por el precio de 10
    setAmount(String(plan.priceCop * (next === 12 ? 10 : next)));
  }

  function save() {
    if (!valid) return;
    const input =
      kind === "PAYMENT"
        ? { kind, amountCop: Math.round(value), months, note: note || undefined }
        : { kind, creditUsd: value, note: note || undefined };
    add.mutate({ id: tenant.id, input }, { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === "PAYMENT" ? "Registrar pago" : "Agregar crédito de IA"}</DialogTitle>
          <DialogDescription>
            {tenant.name} · plan {plan.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {kind === "PAYMENT" ? (
            <>
              <div className="space-y-1.5">
                <Label>Meses que cubre</Label>
                <div className="flex gap-1.5">
                  {[1, 3, 6, 12].map((m) => (
                    <Button key={m} size="sm" variant={months === m ? "wa" : "outline"} onClick={() => pickMonths(m)}>
                      {m === 12 ? "12 (anual)" : m}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Monto recibido (COP)</Label>
                <Input id="pay-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
                <p className="text-xs text-muted-foreground">
                  Queda pagado hasta el <span className="font-medium text-foreground">{day(newPaidUntil.toISOString())}</span>.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="credit-usd">Crédito (USD)</Label>
              <Input id="credit-usd" inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value.replace(",", "."))} />
              <p className="text-xs text-muted-foreground">
                Se suma al presupuesto de IA del mes en curso.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="entry-note">Nota (opcional)</Label>
            <Input
              id="entry-note"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={kind === "PAYMENT" ? "Nequi, transferencia, referencia…" : "Recarga, cortesía…"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="wa" onClick={save} disabled={!valid || add.isPending}>
            {kind === "PAYMENT" ? "Registrar pago" : "Agregar crédito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ tenant, onClose }: { tenant: PlatformTenantDto | null; onClose: () => void }) {
  const { data: entries, isLoading } = useBillingEntries(tenant?.id ?? null);
  return (
    <Dialog open={tenant !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Historial de cobros</DialogTitle>
          <DialogDescription>{tenant?.name}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : !entries?.length ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Todavía no hay pagos ni créditos.</div>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {entries.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-medium">
                      {e.kind === "PAYMENT" ? `Pago · ${e.months} ${e.months === 1 ? "mes" : "meses"}` : "Crédito de IA"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(e.createdAt), "d MMM yyyy, HH:mm", { locale: es })}
                      {e.note && ` · ${e.note}`}
                    </div>
                  </div>
                  <div className="font-medium tabular-nums">
                    {e.kind === "PAYMENT" ? cop.format(e.amountCop ?? 0) : usd2.format(e.creditUsd ?? 0)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
