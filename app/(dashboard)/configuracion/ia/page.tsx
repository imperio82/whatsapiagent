"use client";

import { useEffect, useState } from "react";
import { Bot, Info, Sparkles } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import { useCurrentTenant, useUpdateTenant } from "@hooks/use-tenant";

export default function AIConfigPage(): React.ReactElement {
  const { data: tenant, isLoading } = useCurrentTenant();
  const update = useUpdateTenant();
  const [enabled, setEnabled] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (tenant) {
      setEnabled(tenant.aiAutoReply ?? false);
      setAgentName(tenant.aiAgentName ?? "");
      setDescription(tenant.description ?? "");
    }
  }, [tenant]);

  if (isLoading || !tenant) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Asistente con IA</h1>
        <p className="text-sm text-muted-foreground">
          La IA responde automáticamente a los chats entrantes consultando tu catálogo.
          Vos podés intervenir en cualquier momento.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-wa/15 p-2 text-wa">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Auto-respuesta con IA</span>
                  <Badge variant={enabled ? "wa" : "secondary"}>
                    {enabled ? "Activa" : "Desactivada"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cuando un cliente escribe a tu WhatsApp, la IA responde usando tu catálogo,
                  cotiza precios y puede crear pedidos. Soporta entrega humana cuando algo
                  excede su alcance.
                </p>
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <div className="text-sm font-semibold">Personalización</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Estos campos van al prompt del sistema que define cómo se comporta la IA.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agentName">Nombre del asistente (opcional)</Label>
            <Input
              id="agentName"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Ej: Sofía, María, asistente de ventas"
            />
            <p className="text-xs text-muted-foreground">
              Si lo dejás vacío, la IA se presenta como “el asistente de {tenant.name}”.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Descripción del negocio</Label>
            <textarea
              id="description"
              rows={4}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Tienda de café especialidad, atendemos por WhatsApp y enviamos a todo el país. Aceptamos transferencia y depósito."
            />
            <p className="text-xs text-muted-foreground">
              Esto define el contexto y tono. Cuánto mejor lo describas, mejores serán las respuestas.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              onClick={() =>
                update.mutate({
                  aiAutoReply: enabled,
                  aiAgentName: agentName.trim() || null,
                  description: description.trim() || null,
                })
              }
              disabled={update.isPending}
            >
              <Sparkles className="h-4 w-4" /> Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="flex gap-3 p-4 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            La IA usa OpenAI ({process.env.NEXT_PUBLIC_APP_URL ? "GPT-4o-mini" : "según OPENAI_MODEL"}).
            Cada respuesta consume tokens; el costo lo paga tu cuenta de OpenAI. Si
            <code className="mx-1 rounded bg-muted px-1 font-mono">OPENAI_API_KEY</code>
            no está configurado en el server, el toggle se ignora y los chats quedan sin auto-respuesta.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
