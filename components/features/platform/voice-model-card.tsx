"use client";

import { useEffect, useState } from "react";
import { AudioLines } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Label } from "@components/ui/label";
import { useSetVoiceModel, useVoiceModel } from "@hooks/use-platform";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const int = new Intl.NumberFormat("es-CO");
const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 3, maximumFractionDigits: 4 });

/** El modelo de Gemini con el que salen las notas de voz de todos los negocios. */
export function VoiceModelCard(): React.ReactElement {
  const { data, isLoading } = useVoiceModel();
  const save = useSetVoiceModel();
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (data) setSelected(data.current.modelName);
  }, [data]);

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Cargando el modelo de voz…</CardContent>
      </Card>
    );
  }

  const option = data.options.find((o) => o.id === selected);
  const changed = selected !== data.current.modelName;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <AudioLines className="h-4 w-4" /> Modelo de voz
            </h2>
            <p className="text-xs text-muted-foreground">
              Con este modelo de Gemini salen las notas de voz de los negocios que usan voces de Gemini (las de ElevenLabs no
              cambian). La voz y el tono los elige cada negocio en su configuración.
            </p>
          </div>
          <Badge variant={data.current.source === "panel" ? "wa" : "secondary"}>
            {data.current.modelName} · {data.current.source === "panel" ? "elegido aquí" : "variables de entorno"}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="space-y-2">
            <Label htmlFor="voice-model">Modelo</Label>
            <select
              id="voice-model"
              className={SELECT}
              value={selected}
              disabled={!data.available}
              onChange={(e) => setSelected(e.target.value)}
            >
              {data.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} · {cop.format(o.minuteCop)} por minuto
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="wa"
                disabled={!changed || !data.available || save.isPending}
                onClick={() => save.mutate({ model: selected })}
              >
                {save.isPending ? "Probando la voz…" : "Probar y usar este modelo"}
              </Button>
              {data.current.source === "panel" && (
                <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ model: null })}>
                  Volver al de las variables de entorno ({data.env})
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {data.available
                ? "Antes de guardar se genera una frase corta de prueba. Si falla, por ejemplo por falta de cupo, no se cambia."
                : "Falta GEMINI_API_KEY en las variables de entorno."}
            </p>
          </div>

          {option && (
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p className="text-muted-foreground">{option.note}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Por minuto de audio</dt>
                  <dd className="font-medium tabular-nums">{cop.format(option.minuteCop)}</dd>
                  <dd className="text-[10px] text-muted-foreground">{usd.format(option.minuteUsd)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Nota de 30 segundos</dt>
                  <dd className="font-medium tabular-nums">{cop.format(option.minuteCop / 2)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Con {cop.format(10_000)}</dt>
                  <dd className="font-medium tabular-nums">
                    {option.minuteCop > 0 ? `~${int.format(Math.floor(10_000 / option.minuteCop))} minutos` : "—"}
                  </dd>
                </div>
              </dl>
              <p className="text-[10px] text-muted-foreground">
                Precios de lista aproximados, a {int.format(data.usdCopRate)} pesos por dólar (USD_COP_RATE).
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
