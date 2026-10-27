"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useSetTrialSettings, useTrialSettings } from "@hooks/use-platform";

const int = new Intl.NumberFormat("es-CO");
const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Lo que se regala en la prueba gratis. Aplica a los negocios sin ningún pago del plan registrado. */
export function TrialCard(): React.ReactElement {
  const { data, isLoading } = useTrialSettings();
  const save = useSetTrialSettings();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (data) setValue(String(data.limits.valueUsd));
  }, [data]);

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Cargando la prueba gratis…</CardContent>
      </Card>
    );
  }

  const parsed = Number(value.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed >= 0.5 && parsed <= data.maxValueUsd;
  const changed = valid && parsed !== data.limits.valueUsd;
  const { limits } = data;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Gift className="h-4 w-4" /> Prueba gratis
            </h2>
            <p className="text-xs text-muted-foreground">
              Lo que se regala a los negocios nuevos, en dólares a precio de venta. Aplica a todo negocio sin ningún pago
              del plan registrado; al registrar el primer pago pasa a los límites de su plan.
            </p>
          </div>
          <Badge variant="secondary">{int.format(data.tenantsInTrial)} negocios en prueba</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_1fr]">
          <div className="space-y-2">
            <Label htmlFor="trial-value">Valor regalado (US$)</Label>
            <Input id="trial-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            <Button size="sm" variant="wa" className="w-full" disabled={!changed || save.isPending} onClick={() => save.mutate({ valueUsd: parsed })}>
              Guardar
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {valid ? `Por defecto US$ ${data.defaultValueUsd}.` : `Entre US$ 0,50 y US$ ${data.maxValueUsd}.`} Aplica en menos de un minuto.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border p-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Valor regalado</dt>
              <dd className="font-medium tabular-nums">{usd.format(limits.valueUsd)}</dd>
              <dd className="text-[10px] text-muted-foreground">~{cop.format(limits.valueUsd * data.usdCopRate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Gasto real de IA (tope)</dt>
              <dd className="font-medium tabular-nums">{usd.format(limits.aiBudgetUsd)}</dd>
              <dd className="text-[10px] text-muted-foreground">el 30 % del valor, como en los planes</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Clientes aproximados</dt>
              <dd className="font-medium tabular-nums">~{int.format(limits.chats)}</dd>
              <dd className="text-[10px] text-muted-foreground">al precio por cliente de Emprende</dd>
            </div>
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}
