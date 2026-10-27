"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Coins } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { usePlatformRecharges, useResolveRecharge, useSetPaymentInstructions } from "@hooks/use-platform";
import type { PlatformRechargeDto } from "@modules/platform/application/recharges-admin.use-cases";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const int = new Intl.NumberFormat("es-CO");
const when = (iso: string) => format(new Date(iso), "d MMM, HH:mm", { locale: es });

/** Recargas que pidieron los negocios: se confirman cuando llega el pago y ahí se suman clientes y saldo. */
export function RechargesCard(): React.ReactElement | null {
  const { data } = usePlatformRecharges();
  const resolve = useResolveRecharge();
  const saveInstructions = useSetPaymentInstructions();
  const [instructions, setInstructions] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) setInstructions(data.instructions);
  }, [data]);

  if (!data) return null;

  const act = (r: PlatformRechargeDto, action: "confirm" | "cancel") =>
    resolve.mutate({ id: r.id, input: { action, note: notes[r.id] || undefined } });

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Coins className="h-4 w-4" /> Recargas de saldo
            </h2>
            <p className="text-xs text-muted-foreground">
              Los negocios piden la recarga desde su panel. Cuando te llegue el pago, confírmalo aquí: se suman los clientes
              al cupo del mes y el saldo de IA.
            </p>
          </div>
          {data.pending.length > 0 && <Badge variant="warning">{data.pending.length} por confirmar</Badge>}
        </div>

        {data.pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay recargas pendientes.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {data.pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="min-w-[12rem] flex-1">
                  <div className="font-medium">
                    {r.tenant.name} · {cop.format(r.amountCop)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{r.reference}</span> · {int.format(r.clients)} clientes y {usd.format(r.creditUsd)} de IA
                    · pedida el {when(r.createdAt)}
                  </div>
                </div>
                <Input
                  className="h-8 w-48 text-xs"
                  placeholder="Referencia del pago (opcional)"
                  value={notes[r.id] ?? ""}
                  maxLength={200}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => act(r, "cancel")}>
                    Cancelar
                  </Button>
                  <Button size="sm" variant="wa" disabled={resolve.isPending} onClick={() => act(r, "confirm")}>
                    Confirmar pago
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data.recent.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Últimas resueltas</summary>
            <ul className="mt-2 divide-y divide-border">
              {data.recent.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {r.tenant.name} · <span className="font-mono">{r.reference}</span> · {cop.format(r.amountCop)} ·{" "}
                    {int.format(r.clients)} clientes{r.note ? ` · ${r.note}` : ""}
                  </span>
                  <Badge variant={r.status === "PAID" ? "success" : "secondary"}>
                    {r.status === "PAID" ? `Pagada ${r.paidAt ? when(r.paidAt) : ""}` : "Cancelada"}
                  </Badge>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="payment-instructions">Formas de pago que ve el negocio al recargar</Label>
          <textarea
            id="payment-instructions"
            rows={3}
            maxLength={1000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Nequi 300 000 0000 a nombre de…, o el link de pago"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={instructions.trim().length < 10 || instructions === data.instructions || saveInstructions.isPending}
            onClick={() => saveInstructions.mutate(instructions)}
          >
            Guardar formas de pago
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
