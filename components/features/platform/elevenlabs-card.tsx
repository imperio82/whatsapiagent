"use client";

import { useState } from "react";
import { AudioLines, KeyRound } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import { useElevenLabsSettings, useSetElevenLabsSettings } from "@hooks/use-platform";

/**
 * Voces premium y clonadas de ElevenLabs para todos los negocios. La clave se guarda cifrada y nunca vuelve
 * al navegador; solo se muestran sus últimos 4 caracteres.
 */
export function ElevenLabsCard(): React.ReactElement {
  const { data, isLoading } = useElevenLabsSettings();
  const save = useSetElevenLabsSettings();
  const [apiKey, setApiKey] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Cargando ElevenLabs…</CardContent>
      </Card>
    );
  }

  const active = data.enabled && data.source !== null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <AudioLines className="h-4 w-4" /> Voces premium (ElevenLabs)
            </h2>
            <p className="text-xs text-muted-foreground">
              Con ElevenLabs activo, cada negocio elige en Voz del agente entre las voces incluidas de Gemini y las premium
              de ElevenLabs, y puede clonar su propia voz. La cuenta de ElevenLabs es una sola para toda la plataforma.
            </p>
          </div>
          <Badge variant={active ? "wa" : "secondary"}>
            {active ? "Activo" : data.source === null ? "Sin clave" : "Desactivado"}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="elevenlabs-key">API key</Label>
            <Input
              id="elevenlabs-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={data.last4 ? `Guardada: ••••${data.last4}` : "Pega la clave de ElevenLabs"}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="wa"
                disabled={apiKey.trim().length < 20 || save.isPending}
                onClick={() => save.mutate({ apiKey: apiKey.trim() }, { onSuccess: () => setApiKey("") })}
              >
                <KeyRound className="h-4 w-4" /> {save.isPending ? "Probando la clave…" : "Probar y guardar"}
              </Button>
              {data.source === "panel" &&
                (confirmRemove ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={save.isPending}
                      onClick={() => save.mutate({ removeKey: true }, { onSuccess: () => setConfirmRemove(false) })}
                    >
                      Sí, borrar la clave
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                    Borrar clave
                  </Button>
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {data.source === "panel"
                ? "La clave está guardada aquí, cifrada."
                : data.source === "env"
                  ? "La clave sale de ELEVENLABS_API_KEY en las variables de entorno. Si guardas una aquí, se usa esta."
                  : "Antes de guardarla se prueba con ElevenLabs. Necesita permiso de Text to Speech y de Voices (lectura, y escritura para clonar)."}
            </p>
          </div>

          <label className="flex h-fit items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
            <span>
              <span className="font-medium">Ofrecer ElevenLabs a los negocios</span>
              <span className="block text-xs text-muted-foreground">
                Apagado, solo ven las voces de Gemini. Los que ya usaban ElevenLabs responden por texto hasta que elijan otra voz.
              </span>
            </span>
            <Switch
              checked={data.enabled}
              disabled={save.isPending}
              onCheckedChange={(enabled) => save.mutate({ enabled })}
              aria-label="Ofrecer ElevenLabs a los negocios"
            />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
