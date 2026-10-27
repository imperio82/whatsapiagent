"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Wallet } from "lucide-react";
import { Button } from "@components/ui/button";
import { RechargeDialog } from "@components/features/billing/recharge-dialog";
import { useMyUsage } from "@hooks/use-billing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu";
import { cn } from "@lib/utils";

const usd2 = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const usd3 = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 3 });
// Cada respuesta cuesta fracciones de centavo: con menos de un dólar se muestra el tercer decimal para que se vea avanzar
const usd = { format: (n: number) => (n > 0 && n < 1 ? usd3 : usd2).format(n) };
const int = new Intl.NumberFormat("es-CO");

/** Presupuesto de IA gastado en el mes, siempre a la vista en el encabezado. */
export function UsageMeter() {
  const { data } = useMyUsage();
  const [recharging, setRecharging] = useState(false);
  if (!data) return null;

  const ratio = data.budgetUsd > 0 ? data.spentUsd / data.budgetUsd : 1;
  const tone = ratio >= 1 ? "bg-destructive" : ratio >= 0.8 ? "bg-amber-500" : "bg-wa";
  const overdue = data.paidUntil !== null && new Date(data.paidUntil) < new Date();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent"
            aria-label={`Saldo usado este mes: ${usd.format(data.spentUsd)} de ${usd.format(data.budgetUsd)}`}
          >
            <Wallet className={cn("h-4 w-4", ratio >= 1 ? "text-destructive" : "text-muted-foreground")} />
            <span className="hidden flex-col items-start leading-tight sm:flex">
              <span className="font-medium tabular-nums">
                {usd.format(data.spentUsd)} <span className="text-muted-foreground">/ {usd.format(data.budgetUsd)}</span>
              </span>
              <span className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="font-normal">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {data.trial ? data.planName : `Plan ${data.planName}`} · este mes
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <dl className="space-y-1.5 px-2 py-1.5 text-sm">
            <Row label="Saldo usado" value={`${usd.format(data.spentUsd)} de ${usd.format(data.budgetUsd)}`} />
            {data.creditUsd > 0 && <Row label="Saldo recargado" value={usd.format(data.creditUsd)} />}
            {/* Sin "de X": el saldo se muestra como algo que se recarga, no como un cupo de clientes */}
            <Row label="Clientes atendidos" value={int.format(data.chats)} />
            <Row label="Chats activos (24 h)" value={int.format(data.activeChats)} />
            {data.paidUntil && (
              <Row
                label={overdue ? "Plan vencido el" : "Pagado hasta"}
                value={format(new Date(data.paidUntil), "d 'de' MMM yyyy", { locale: es })}
                warn={overdue}
              />
            )}
          </dl>
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            {ratio >= 1
              ? "Se acabó el saldo del mes: recarga para que tu agente siga atendiendo sin pausas."
              : data.trial
                ? "Tu prueba incluye saldo para conocer el agente. Si se te acaba, recarga y sigue atendiendo."
                : "Si se te acaba el saldo, recarga o sube de plan y tu agente sigue atendiendo."}
          </p>
          <div className="px-2 pb-2">
            <Button size="sm" variant="wa" className="w-full" onClick={() => setRecharging(true)}>
              <Plus className="h-4 w-4" /> Recargar saldo
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <RechargeDialog open={recharging} onOpenChange={setRecharging} />
    </>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium tabular-nums", warn && "text-destructive")}>{value}</dd>
    </div>
  );
}
