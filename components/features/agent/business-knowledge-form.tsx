"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@components/ui/button";
import { Label } from "@components/ui/label";
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
    help: "El agente lo usa para decir cuándo se atienden o despachan los pedidos.",
  },
  {
    key: "deliveryInfo",
    label: "Envíos y entregas",
    rows: 3,
    placeholder: "Ej: Domicilio gratis en el casco urbano en compras desde $50.000. Veredas: $5.000. Entregamos el mismo día si pides antes de las 2 p. m.",
    help: "Cobertura, costos y tiempos. Si no lo escribes, el agente no promete plazos.",
  },
  {
    key: "paymentInfo",
    label: "Medios de pago",
    rows: 2,
    placeholder: "Ej: Efectivo contra entrega, Nequi y Daviplata al 300 000 0000, transferencia Bancolombia.",
    help: "El agente solo ofrece los medios que escribas aquí.",
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

/** En intermediación los mismos campos se usan para otra cosa: cambian los textos y ejemplos. */
const BROKERAGE_FIELDS: Partial<Record<ContextKey, { label: string; placeholder: string; help: string }>> = {
  description: {
    label: "Descripción del negocio",
    placeholder: "Ej: Intermediamos la compra, venta y arriendo de vehículos usados e inmuebles en Manizales y el Eje Cafetero.",
    help: "Qué tipo de bienes manejas y en qué zonas. El agente lo usa para presentarse.",
  },
  deliveryInfo: {
    label: "Cobertura y zonas",
    placeholder: "Ej: Manizales, Villamaría, Chinchiná y Pereira. Vehículos de cualquier ciudad del país con traspaso.",
    help: "Dónde tienes bienes y hasta dónde llegas. Los horarios de visitas van en las habilidades del agente.",
  },
  paymentInfo: {
    label: "Formas de pago y financiación",
    placeholder: "Ej: Contado, crédito con bancos aliados (sujeto a estudio), leasing habitacional y vehículo en parte de pago.",
    help: "El agente solo menciona lo que escribas aquí. Nunca confirma la aprobación de un crédito.",
  },
  faq: {
    label: "Preguntas frecuentes",
    placeholder: "Ej: ¿Cobran comisión al comprador? No, la paga el vendedor.\n¿Hacen el traspaso? Sí, lo gestionamos con el comprador.",
    help: "Respuestas que se repiten. Lo que el agente no debe decir va en las habilidades del agente.",
  },
};

/** Lo que el agente sabe del negocio. Va dentro del modal de Mi agente. */
export function BusinessKnowledgeForm({ onSaved }: { onSaved?: () => void }): React.ReactElement {
  const { data: tenant, isLoading } = useCurrentTenant();
  const update = useUpdateTenant();
  const [context, setContext] = useState<Record<ContextKey, string>>({
    description: "",
    businessHours: "",
    deliveryInfo: "",
    paymentInfo: "",
    faq: "",
  });

  useEffect(() => {
    if (tenant) {
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
    update.mutate(
      Object.fromEntries(CONTEXT_FIELDS.map((f) => [f.key, context[f.key].trim() || null])) as Record<ContextKey, string | null>,
      { onSuccess: onSaved },
    );
  }

  const brokerage = tenant.agentProfile === "BROKERAGE";
  const fields = CONTEXT_FIELDS.map((f) => ({ ...f, ...(brokerage ? BROKERAGE_FIELDS[f.key] : {}) }));

  return (
    <div className="space-y-4">
      {fields.map((f) => (
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

      <div className="flex justify-end pt-2">
        <Button onClick={save} disabled={update.isPending}>
          <Sparkles className="h-4 w-4" /> Guardar cambios
        </Button>
      </div>
    </div>
  );
}
