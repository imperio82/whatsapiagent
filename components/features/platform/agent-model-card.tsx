"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Label } from "@components/ui/label";
import { useAgentModel, useSetAgentModel } from "@hooks/use-platform";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const int = new Intl.NumberFormat("es-CO");
const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Monto de referencia para "cuántas respuestas alcanzan" */
const BUDGET_COP = 10_000;

/** El modelo con el que responde el agente en todos los negocios, con lo que cuesta cada opción. */
export function AgentModelCard(): React.ReactElement {
  const { data, isLoading } = useAgentModel();
  const save = useSetAgentModel();
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (data) setSelected(data.current.modelName);
  }, [data]);

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Cargando el modelo del agente…</CardContent>
      </Card>
    );
  }

  const option = data.options.find((o) => o.id === selected);
  const changed = selected !== data.current.modelName;
  const { average } = data;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Bot className="h-4 w-4" /> Modelo del agente
            </h2>
            <p className="text-xs text-muted-foreground">
              Con este modelo responden el agente de todos los negocios y el asistente del asesor. El cambio se aplica en
              menos de un minuto, sin volver a desplegar.
            </p>
          </div>
          <Badge variant={data.current.source === "panel" ? "wa" : "secondary"}>
            {data.current.modelName} · {data.current.source === "panel" ? "elegido aquí" : "variables de entorno"}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="space-y-2">
            <Label htmlFor="agent-model">Modelo</Label>
            <select id="agent-model" className={SELECT} value={selected} onChange={(e) => setSelected(e.target.value)}>
              {data.options.map((o) => (
                <option key={o.id} value={o.id} disabled={!o.available}>
                  {o.label} · {cop.format(o.replyCop)} por respuesta{o.available ? "" : " (falta la clave)"}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="wa"
                disabled={!changed || !option?.available || save.isPending}
                onClick={() => save.mutate({ model: selected })}
              >
                {save.isPending ? "Probando el modelo…" : "Probar y usar este modelo"}
              </Button>
              {data.current.source === "panel" && (
                <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ model: null })}>
                  Volver al de las variables de entorno ({data.env.modelName})
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Antes de guardar se le hace una pregunta corta al modelo (unos pocos tokens). Si no responde, por ejemplo
              porque no hay saldo, no se cambia.
            </p>
          </div>

          {option && (
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p className="text-muted-foreground">{option.note}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Entrada / salida</dt>
                  <dd className="font-medium tabular-nums">
                    {usd.format(option.inPerMillion)} / {usd.format(option.outPerMillion)}
                  </dd>
                  <dd className="text-[10px] text-muted-foreground">por millón de tokens</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Por respuesta</dt>
                  <dd className="font-medium tabular-nums">{cop.format(option.replyCop)}</dd>
                  <dd className="text-[10px] text-muted-foreground">US$ {option.replyUsd.toFixed(5)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Con {cop.format(BUDGET_COP)}</dt>
                  <dd className="font-medium tabular-nums">
                    {option.replyCop > 0 ? `~${int.format(Math.floor(BUDGET_COP / option.replyCop))} respuestas` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Respuesta promedio</dt>
                  <dd className="font-medium tabular-nums">
                    {int.format(average.tokensIn)} / {int.format(average.tokensOut)}
                  </dd>
                  <dd className="text-[10px] text-muted-foreground">
                    {average.sample > 0
                      ? `tokens, de ${int.format(average.sample)} respuestas en ${average.days} días`
                      : "tokens, estimado: aún no hay respuestas"}
                  </dd>
                </div>
              </dl>
              <p className="text-[10px] text-muted-foreground">
                Precios de lista aproximados, a {int.format(data.usdCopRate)} pesos por dólar (USD_COP_RATE). No descuenta la
                caché, así que el costo real suele ser menor.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
