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

const TEXTAREA =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Campos de contexto que el agente consulta para responder. */
const CONTEXT_FIELDS = [
  {
    key: "description",
    label: "Descripción del negocio",
    rows: 3,
    placeholder: "Ej: Distribuidora de víveres y aseo en Quinchía. Vendemos al por mayor a tiendas y al detal.",
    help: "Define el contexto y el tono. Cuanto mejor lo describas, mejores serán las respuestas.",
  },
  {
    key: "businessHours",
    label: "Horario de atención",
    rows: 2,
    placeholder: "Ej: Lunes a sábado de 7:00 a. m. a 6:00 p. m. Domingos y festivos cerrado.",
    help: "La IA lo usa para decir cuándo se atienden o despachan los pedidos.",
  },
  {
    key: "deliveryInfo",
    label: "Envíos y entregas",
    rows: 3,
    placeholder: "Ej: Domicilio gratis en el casco urbano en compras desde $50.000. Veredas: $5.000. Entregamos el mismo día si pides antes de las 2 p. m.",
    help: "Cobertura, costos y tiempos. Si no lo escribes, la IA no promete plazos.",
  },
  {
    key: "paymentInfo",
    label: "Medios de pago",
    rows: 2,
    placeholder: "Ej: Efectivo contra entrega, Nequi y Daviplata al 300 000 0000, transferencia Bancolombia.",
    help: "La IA solo ofrece los medios que escribas aquí.",
  },
  {
    key: "faq",
    label: "Preguntas frecuentes y políticas",
    rows: 5,
    placeholder: "Ej: ¿Hacen cambios? Sí, dentro de los 3 días con la factura.\n¿Venden por unidad? Sí, salvo bebidas, que van por paca.",
    help: "Cambios, garantías, pedidos mínimos o cualquier respuesta que se repita.",
  },
] as const;

type ContextKey = (typeof CONTEXT_FIELDS)[number]["key"];

export default function AIConfigPage(): React.ReactElement {
  const { data: tenant, isLoading } = useCurrentTenant();
  const update = useUpdateTenant();
  const [enabled, setEnabled] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [context, setContext] = useState<Record<ContextKey, string>>({
    description: "",
    businessHours: "",
    deliveryInfo: "",
    paymentInfo: "",
    faq: "",
  });

  useEffect(() => {
    if (tenant) {
      setEnabled(tenant.aiAutoReply ?? false);
      setAgentName(tenant.aiAgentName ?? "");
      setContext({
        description: tenant.description ?? "",
        businessHours: tenant.businessHours ?? "",
        deliveryInfo: tenant.deliveryInfo ?? "",
        paymentInfo: tenant.paymentInfo ?? "",
        faq: tenant.faq ?? "",
      });
    }
  }, [tenant]);

  if (isLoading || !tenant) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>;
  }

  function save() {
    const trimmed = Object.fromEntries(
      CONTEXT_FIELDS.map((f) => [f.key, context[f.key].trim() || null]),
    ) as Record<ContextKey, string | null>;
    update.mutate({ aiAutoReply: enabled, aiAgentName: agentName.trim() || null, ...trimmed });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Asistente con IA</h1>
        <p className="text-sm text-muted-foreground">
          La IA responde automáticamente a los chats entrantes consultando tu catálogo.
          Puedes intervenir en cualquier momento.
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
                  <span className="font-semibold">Respuesta automática con IA</span>
                  <Badge variant={enabled ? "wa" : "secondary"}>
                    {enabled ? "Activa" : "Desactivada"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cuando un cliente escribe a tu WhatsApp, la IA responde con tu catálogo,
                  cotiza y puede crear pedidos. Pasa la conversación a una persona cuando algo
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
            <div className="text-sm font-semibold">Lo que la IA sabe de tu negocio</div>
            <p className="mt-1 text-xs text-muted-foreground">
              La IA responde solo con lo que escribas aquí y con tu catálogo. Lo que no esté, no lo inventa:
              lo pasa a una persona.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agentName">Nombre del asistente (opcional)</Label>
            <Input
              id="agentName"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Ej: Sofía, asistente de ventas"
            />
            <p className="text-xs text-muted-foreground">
              Si lo dejas vacío, la IA se presenta como “el asistente de {tenant.name}”.
            </p>
          </div>

          {CONTEXT_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              <textarea
                id={f.key}
                rows={f.rows}
                className={TEXTAREA}
                value={context[f.key]}
                onChange={(e) => setContext((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
              <p className="text-xs text-muted-foreground">{f.help}</p>
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={save} disabled={update.isPending}>
              <Sparkles className="h-4 w-4" /> Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="flex gap-3 p-4 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            El proveedor de IA se elige en el servidor con
            <code className="mx-1 rounded bg-muted px-1 font-mono">AI_PROVIDER</code>
            (Gemini u OpenAI). Cada respuesta consume tokens y su costo queda registrado por conversación.
            Si la clave del proveedor no está configurada, los chats quedan sin respuesta automática.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
