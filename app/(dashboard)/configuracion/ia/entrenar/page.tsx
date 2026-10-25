"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useCurrentTenant, useUpdateTenant } from "@hooks/use-tenant";
import { cn } from "@lib/utils";

const TEXTAREA =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Cargos sugeridos según el tipo de negocio; el negocio puede escribir el suyo. */
const ROLE_SUGGESTIONS = {
  RETAIL: ["asesora de ventas", "asesor comercial", "asistente de atención al cliente", "encargada de pedidos"],
  BROKERAGE: ["asesora comercial", "asesor inmobiliario", "asesor de vehículos", "asistente de la agencia"],
} as const;

/** Estilos de personalidad listos para usar: el texto se puede editar después. */
const PERSONALITY_PRESETS = [
  {
    title: "Cálido y cercano",
    text: "Eres cálido, cercano y paciente. Saludas con entusiasmo, te interesas de verdad por lo que necesita el cliente y lo haces sentir bien atendido, como en una tienda de barrio de confianza.",
  },
  {
    title: "Profesional",
    text: "Eres profesional, respetuoso y preciso. Vas al punto, das información clara y ordenada, y transmites seguridad y confianza. Evitas expresiones muy informales.",
  },
  {
    title: "Entusiasta vendedor",
    text: "Eres entusiasta y positivo. Resaltas los beneficios de cada producto, propones opciones y acompañas al cliente hasta cerrar la compra, siempre sin presionar.",
  },
  {
    title: "Consultor experto",
    text: "Eres un consultor que conoce muy bien lo que vende. Haces buenas preguntas para entender qué necesita el cliente y le recomiendas la mejor opción explicando por qué.",
  },
  {
    title: "Paisa amable",
    text: "Hablas como una persona amable del Eje Cafetero: cordial, servicial y cercano, con expresiones naturales como «con mucho gusto» o «a la orden», sin exagerar los regionalismos.",
  },
] as const;

export default function TrainAgentPage(): React.ReactElement {
  const { data: tenant, isLoading } = useCurrentTenant();
  const update = useUpdateTenant();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [personality, setPersonality] = useState("");

  useEffect(() => {
    if (tenant) {
      setName(tenant.aiAgentName ?? "");
      setRole(tenant.aiAgentRole ?? "");
      setPersonality(tenant.aiPersonality ?? "");
    }
  }, [tenant]);

  if (isLoading || !tenant) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>;
  }

  function save() {
    update.mutate({
      aiAgentName: name.trim() || null,
      aiAgentRole: role.trim() || null,
      aiPersonality: personality.trim() || null,
    });
  }

  const roles = ROLE_SUGGESTIONS[tenant.agentProfile ?? "RETAIL"];
  const intro = `Hola, soy ${name.trim() || `el asistente de ${tenant.name}`}${role.trim() ? `, ${role.trim()}` : ""}${
    name.trim() ? ` de ${tenant.name}` : ""
  }. ¿En qué te puedo ayudar?`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/configuracion/ia" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Mi agente
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Entrenar mi agente</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Dale identidad a tu agente: cómo se llama, qué cargo tiene y cómo habla. Aplica a la atención por WhatsApp de tu
          negocio, sea tienda o intermediación, desde el siguiente mensaje que llegue.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="agentName">Nombre del agente</Label>
            <Input
              id="agentName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Sofía"
              maxLength={40}
            />
            <p className="text-xs text-muted-foreground">
              Si lo dejas vacío, se presenta como “el asistente de {tenant.name}”. También firma con este nombre las
              felicitaciones y los avisos de coincidencias.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agentRole">Cargo o rol</Label>
            <Input
              id="agentRole"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={`Ej: ${roles[0]}`}
              maxLength={80}
            />
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    role === r ? "border-wa bg-wa/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Con qué cargo se presenta ante el cliente.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="personality">Personalidad</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PERSONALITY_PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => setPersonality(preset.text)}
                  aria-pressed={personality === preset.text}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    personality === preset.text ? "border-wa bg-wa/5" : "border-border hover:bg-accent/50",
                  )}
                >
                  <span className="block text-sm font-medium">{preset.title}</span>
                  <span className="line-clamp-2 block text-xs text-muted-foreground">{preset.text}</span>
                </button>
              ))}
            </div>
            <textarea
              id="personality"
              rows={5}
              maxLength={1500}
              className={TEXTAREA}
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="Describe cómo es tu agente: su tono, cómo saluda, qué expresiones usa o evita. Ej: Eres alegre y servicial, saludas por el nombre y cierras siempre ofreciendo algo más."
            />
            <p className="text-xs text-muted-foreground">
              Elige un estilo y ajústalo a tu gusto, o escríbelo desde cero. La personalidad cambia el tono, no las reglas:
              el trato (tú o usted), lo que puede decir y cuándo pasa a una persona se configuran en{" "}
              <Link href="/configuracion/ia/habilidades" className="underline underline-offset-2 hover:text-foreground">
                Habilidades del agente
              </Link>{" "}
              y siempre mandan.
            </p>
          </div>

          <div className="rounded-md border border-dashed p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5" /> Así se presenta
            </div>
            <p className="inline-block rounded-lg bg-wa/10 px-3 py-2 text-sm">{intro}</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={update.isPending}>
              <Sparkles className="h-4 w-4" /> Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
