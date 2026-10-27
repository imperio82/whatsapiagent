"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
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
import { useRechargeOptions, useRequestRecharge } from "@hooks/use-billing";
import type { RechargeDto } from "@modules/billing/application/recharges.use-cases";
import { cn } from "@lib/utils";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("es-CO");

const STATUS = {
  PENDING: { label: "Pendiente de pago", variant: "warning" },
  PAID: { label: "Pagada", variant: "success" },
  CANCELLED: { label: "Cancelada", variant: "secondary" },
} as const;

/**
 * El dueño elige un paquete o escribe el monto que quiera. La recarga queda pendiente con una referencia y
 * las formas de pago; cuando se confirma el pago, los clientes y el saldo se suman solos.
 */
export function RechargeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data } = useRechargeOptions(open);
  const request = useRequestRecharge();
  const [choice, setChoice] = useState<number | "custom" | null>(null);
  const [custom, setCustom] = useState("");
  const [done, setDone] = useState<RechargeDto | null>(null);

  useEffect(() => {
    if (open) {
      setDone(null);
      setCustom("");
      setChoice(null);
    }
  }, [open]);

  const customCop = Number(custom.replace(/\D/g, "")) || 0;
  const amountCop = choice === "custom" ? customCop : (choice ?? 0);
  const valid = !!data && amountCop >= data.minCop && amountCop <= data.maxCop;
  const pack = data?.packs.find((p) => p.amountCop === amountCop);
  // Monto libre: al precio del cliente adicional del plan
  const clients = pack ? pack.clients : data ? Math.floor(amountCop / data.extraChatCop) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recargar saldo</DialogTitle>
          <DialogDescription>
            Suma saldo para que tu agente siga atendiendo a tus clientes. Lo recargado dura {data?.validDays ?? 60} días.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : done ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-wa" />
              <div>
                <div className="font-medium">
                  Recarga {done.reference} por {cop.format(done.amountCop)}
                </div>
                <div className="text-muted-foreground">Alcanza para atender unos {int.format(done.clients)} clientes más.</div>
                <div className="text-muted-foreground">Queda pendiente hasta que confirmemos el pago.</div>
              </div>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="mb-1 font-medium">Cómo pagar</div>
              <p className="whitespace-pre-line text-muted-foreground">{data.instructions}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Usa la referencia <span className="font-mono font-semibold text-foreground">{done.reference}</span> al pagar.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {data.packs.map((p) => (
                <button
                  key={p.amountCop}
                  type="button"
                  onClick={() => setChoice(p.amountCop)}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors hover:bg-accent",
                    choice === p.amountCop ? "border-wa ring-1 ring-wa" : "border-border",
                  )}
                >
                  <div className="text-base font-semibold">{cop.format(p.amountCop)}</div>
                  <div className="text-[11px] text-muted-foreground">Para atender unos {int.format(p.clients)} clientes</div>
                </button>
              ))}
            </div>

            <div
              className={cn(
                "space-y-1.5 rounded-md border p-3",
                choice === "custom" ? "border-wa ring-1 ring-wa" : "border-border",
              )}
            >
              <Label htmlFor="recharge-custom">Otro monto</Label>
              <Input
                id="recharge-custom"
                inputMode="numeric"
                placeholder={`Desde ${cop.format(data.minCop)}`}
                value={custom ? int.format(customCop) : ""}
                onFocus={() => setChoice("custom")}
                onChange={(e) => {
                  setChoice("custom");
                  setCustom(e.target.value);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Entre {cop.format(data.minCop)} y {cop.format(data.maxCop)}.
              </p>
            </div>

            {amountCop > 0 && (
              <p className={cn("text-sm", valid ? "text-foreground" : "text-destructive")}>
                {valid
                  ? `Recargas ${cop.format(amountCop)}: alcanza para atender unos ${int.format(clients)} clientes más.`
                  : amountCop < data.minCop
                    ? `El mínimo es ${cop.format(data.minCop)}.`
                    : `El máximo es ${cop.format(data.maxCop)}.`}
              </p>
            )}

            {data.recharges.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Tus recargas</div>
                <ul className="max-h-40 divide-y divide-border overflow-y-auto text-xs">
                  {data.recharges.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span>
                        <span className="font-mono">{r.reference}</span> · {cop.format(r.amountCop)}
                        <span className="text-muted-foreground"> · {format(new Date(r.createdAt), "d MMM", { locale: es })}</span>
                      </span>
                      <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => onOpenChange(false)}>Listo</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                variant="wa"
                disabled={!valid || request.isPending}
                onClick={() => request.mutate(amountCop, { onSuccess: (r) => setDone(r) })}
              >
                {request.isPending ? "Enviando…" : valid ? `Recargar ${cop.format(amountCop)}` : "Recargar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
