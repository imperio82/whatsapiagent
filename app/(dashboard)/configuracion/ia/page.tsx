"use client";

import { useEffect, useState } from "react";
import {
  AudioLines,
  Bell,
  BookOpen,
  Bot,
  Car,
  ChevronRight,
  Clock,
  GraduationCap,
  Info,
  ShieldCheck,
  ListChecks,
  ShoppingBag,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@components/ui/dialog";
import { AgentPermissionsForm } from "@components/features/agent/agent-permissions-form";
import { AgentSkills } from "@components/features/agent/agent-skills";
import { AgentVoice } from "@components/features/agent/agent-voice";
import { BusinessKnowledgeForm } from "@components/features/agent/business-knowledge-form";
import { TrainAgentForm } from "@components/features/agent/train-agent-form";
import { useCurrentTenant, useUpdateTenant } from "@hooks/use-tenant";
import { AGENT_RESOURCES, agentPermissionsFrom, resourcesFor } from "@modules/ai/domain/agent-permissions";

type Profile = "RETAIL" | "BROKERAGE";

const PROFILE_OPTIONS = [
  { value: "RETAIL", icon: ShoppingBag, title: "Tienda", text: "Catálogo de productos, cotización y pedidos." },
  {
    value: "BROKERAGE",
    icon: Car,
    title: "Intermediación",
    text: "Vehículos e inmuebles: inventario, calificación de compradores, vendedores y visitas.",
  },
] as const;

/** Segundos que el agente espera sin mensajes nuevos; "" usa la espera por defecto del servidor. */
const REPLY_DELAY_PRESETS = [
  { value: "0", label: "Inmediato" },
  { value: "3", label: "3 s" },
  { value: "6", label: "6 s" },
  { value: "10", label: "10 s" },
  { value: "20", label: "20 s" },
] as const;

type Section = "entrenar" | "negocio" | "habilidades" | "permisos" | "voz";

/** Qué se abre en el modal de cada tarjeta y cómo de ancho. */
const SECTION_DIALOG: Record<Section, { title: string; description: string; width: string }> = {
  entrenar: {
    title: "Entrenar mi agente",
    description:
      "Dale identidad a tu agente: cómo se llama, qué cargo tiene y cómo habla. Aplica a tienda e intermediación desde el siguiente mensaje que llegue.",
    width: "sm:max-w-3xl",
  },
  negocio: {
    title: "Lo que el agente sabe de tu negocio",
    description:
      "El agente responde solo con lo que escribas aquí y con tu catálogo o inventario. Lo que no esté, no lo inventa: lo pasa a una persona.",
    width: "sm:max-w-3xl",
  },
  habilidades: {
    title: "Habilidades del agente",
    description:
      "Cómo trata al cliente, qué puede y no puede hacer, qué preguntas hace y cuándo pasa la conversación a una persona. Los cambios aplican desde el siguiente mensaje.",
    width: "sm:max-w-5xl",
  },
  permisos: {
    title: "Permisos del agente",
    description:
      "Qué puede consultar, actualizar o crear el agente en cada área. Así controlas, por ejemplo, que cotice pero no cree pedidos, o que consulte la agenda sin agendar visitas.",
    width: "sm:max-w-3xl",
  },
  voz: {
    title: "Voz del agente",
    description:
      "Que escuche las notas de voz de tus clientes y les responda con su propia voz: elige la voz, cómo suena y cuándo habla en vez de escribir.",
    width: "sm:max-w-4xl",
  },
};

function SectionCard({
  onOpen,
  icon: Icon,
  title,
  text,
  status,
}: {
  onOpen: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  status?: string;
}): React.ReactElement {
  return (
    <button type="button" onClick={onOpen} className="block h-full w-full text-left">
      <Card className="h-full transition-colors hover:bg-accent/40">
        <CardContent className="flex h-full items-center gap-3 p-4">
          <div className="rounded-md bg-wa/15 p-2 text-wa">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{title}</span>
              {status && <Badge variant="secondary">{status}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{text}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </button>
  );
}

export default function MyAgentPage(): React.ReactElement {
  const { data: tenant, isLoading } = useCurrentTenant();
  const update = useUpdateTenant();
  const [enabled, setEnabled] = useState(false);
  const [replyDelay, setReplyDelay] = useState("");
  const [profile, setProfile] = useState<Profile>("RETAIL");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [matchMode, setMatchMode] = useState<"APPROVAL" | "AUTO">("APPROVAL");
  const [section, setSection] = useState<Section | null>(null);

  useEffect(() => {
    if (tenant) {
      setEnabled(tenant.aiAutoReply ?? false);
      setReplyDelay(tenant.aiReplyDelaySec == null ? "" : String(tenant.aiReplyDelaySec));
      setProfile(tenant.agentProfile ?? "RETAIL");
      setNotifyPhone(tenant.ownerNotifyPhone ?? "");
      setMatchMode(tenant.matchAlertMode ?? "APPROVAL");
    }
  }, [tenant]);

  if (isLoading || !tenant) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>;
  }

  function save() {
    const delay = replyDelay.trim() === "" ? null : Math.min(Math.max(Math.round(Number(replyDelay)), 0), 120);
    update.mutate({
      aiAutoReply: enabled,
      aiReplyDelaySec: Number.isFinite(delay) ? delay : null,
      agentProfile: profile,
      ownerNotifyPhone: notifyPhone.trim() || null,
      matchAlertMode: matchMode,
    });
  }

  const brokerage = profile === "BROKERAGE";
  const knowledgeCount = [tenant.description, tenant.businessHours, tenant.deliveryInfo, tenant.paymentInfo, tenant.faq].filter(
    (v) => v?.trim(),
  ).length;
  // Los permisos se muestran con el tipo de negocio guardado, igual que en su formulario
  const savedProfile = tenant.agentProfile ?? "RETAIL";
  const permissions = agentPermissionsFrom(tenant.aiPermissions, savedProfile);
  const limited = resourcesFor(savedProfile).filter((r) => {
    const levels = AGENT_RESOURCES[r].levels[savedProfile]!;
    return permissions[r] !== levels[levels.length - 1];
  });
  const trained = !!(tenant.aiAgentName?.trim() || tenant.aiAgentRole?.trim() || tenant.aiPersonality?.trim());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi agente</h1>
        <p className="text-sm text-muted-foreground">
          Tu agente responde automáticamente a los chats entrantes consultando tu {brokerage ? "inventario" : "catálogo"}.
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
                  <span className="font-semibold">Respuesta automática</span>
                  <Badge variant={enabled ? "wa" : "secondary"}>{enabled ? "Activa" : "Desactivada"}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {brokerage
                    ? "Cuando un cliente escribe a tu WhatsApp, el agente responde con tu inventario, califica al comprador, recibe a los vendedores y te avisa cuando hay que actuar."
                    : "Cuando un cliente escribe a tu WhatsApp, el agente responde con tu catálogo, cotiza y puede crear pedidos."}{" "}
                  Pasa la conversación a una persona cuando algo excede su alcance.
                </p>
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="mt-5 space-y-2 border-t pt-5">
            <Label htmlFor="replyDelay" className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Tiempo de espera antes de responder
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              {REPLY_DELAY_PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  size="sm"
                  variant={replyDelay === preset.value ? "default" : "outline"}
                  onClick={() => setReplyDelay(preset.value)}
                >
                  {preset.label}
                </Button>
              ))}
              <div className="flex items-center gap-1.5">
                <Input
                  id="replyDelay"
                  type="number"
                  min={0}
                  max={120}
                  value={replyDelay}
                  onChange={(e) => setReplyDelay(e.target.value)}
                  placeholder="6"
                  className="h-8 w-20"
                />
                <span className="text-xs text-muted-foreground">segundos</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              El agente espera este tiempo sin mensajes nuevos del cliente para responder todo junto (por ejemplo “hola”,
              “tienen jeans?”, “talla 32”). Más tiempo agrupa mejor; menos tiempo responde más rápido. Máximo 120 s. Vacío
              usa el valor por defecto.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <div className="text-sm font-semibold">Tipo de negocio</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Define qué hace el agente y qué habilidades trae por defecto. Al cambiarlo se cargan las del nuevo tipo; las
              que agregaste tú se conservan.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PROFILE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = profile === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setProfile(option.value)}
                  aria-pressed={selected}
                  className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                    selected ? "border-wa bg-wa/5" : "border-border hover:bg-accent/50"
                  }`}
                >
                  <Icon className={`mt-0.5 h-5 w-5 ${selected ? "text-wa" : "text-muted-foreground"}`} />
                  <span>
                    <span className="block text-sm font-medium">{option.title}</span>
                    <span className="block text-xs text-muted-foreground">{option.text}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notifyPhone" className="flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" /> WhatsApp para avisos al dueño (opcional)
            </Label>
            <Input
              id="notifyPhone"
              value={notifyPhone}
              onChange={(e) => setNotifyPhone(e.target.value)}
              placeholder="Ej: 573001234567"
              inputMode="tel"
            />
            <p className="text-xs text-muted-foreground">
              Con indicativo del país y distinto al número que atiende el agente.{" "}
              {brokerage
                ? "El agente te escribe aquí cuando hay un comprador caliente, una oferta, una solicitud de visita o un bien nuevo para aprobar."
                : "El agente te escribe aquí cuando necesita que intervengas."}
            </p>
          </div>

          {brokerage && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" /> Cuando entra un bien que le sirve a un comprador
              </Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    {
                      value: "APPROVAL",
                      title: "Pedirme permiso (recomendado)",
                      text: "Te propongo el mensaje en Coincidencias y tú decides si se envía, lo editas o lo descartas.",
                    },
                    {
                      value: "AUTO",
                      title: "Enviar automático",
                      text: "Sale solo de 8:00 a. m. a 7:00 p. m., máximo un aviso por cliente al día. El resto queda para aprobar.",
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMatchMode(option.value)}
                    aria-pressed={matchMode === option.value}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      matchMode === option.value ? "border-wa bg-wa/5" : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <span className="block text-sm font-medium">{option.title}</span>
                    <span className="block text-xs text-muted-foreground">{option.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={save} disabled={update.isPending}>
              <Sparkles className="h-4 w-4" /> Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <SectionCard
          onOpen={() => setSection("entrenar")}
          icon={GraduationCap}
          title="Entrenar mi agente"
          status={trained ? undefined : "Sin configurar"}
          text={
            tenant.aiAgentName?.trim()
              ? `${tenant.aiAgentName}${tenant.aiAgentRole?.trim() ? `, ${tenant.aiAgentRole}` : ""}. Cambia su nombre, su cargo y su personalidad.`
              : "Dale un nombre, un cargo o rol y una personalidad: cómo saluda, su tono y su forma de hablar."
          }
        />
        <SectionCard
          onOpen={() => setSection("negocio")}
          icon={BookOpen}
          title="Lo que el agente sabe de tu negocio"
          status={`${knowledgeCount} de 5`}
          text={`Descripción, horario, ${brokerage ? "cobertura, financiación" : "envíos, medios de pago"} y preguntas frecuentes. Lo que no esté aquí, no lo inventa.`}
        />
        <SectionCard
          onOpen={() => setSection("habilidades")}
          icon={ListChecks}
          title="Habilidades del agente"
          text="Qué puede y no puede decir, preguntas para calificar, cuándo pasar a una persona y el trato."
        />
        <SectionCard
          onOpen={() => setSection("permisos")}
          icon={ShieldCheck}
          title="Permisos del agente"
          status={limited.length === 0 ? "Acceso completo" : `${limited.length} ${limited.length === 1 ? "área limitada" : "áreas limitadas"}`}
          text={`Lectura, actualización o escritura en ${resourcesFor(savedProfile)
            .map((r) => AGENT_RESOURCES[r].label[savedProfile].toLowerCase())
            .join(", ")}.`}
        />
        <SectionCard
          onOpen={() => setSection("voz")}
          icon={AudioLines}
          title="Voz del agente"
          text="Que entienda las notas de voz de tus clientes y les responda con voz: elige o clona la voz y decide cuándo habla."
        />
      </div>

      <Dialog open={section !== null} onOpenChange={(open) => !open && setSection(null)}>
        {section && (
          <DialogContent className={`max-h-[90vh] overflow-y-auto ${SECTION_DIALOG[section].width}`}>
            <DialogHeader>
              <DialogTitle>{SECTION_DIALOG[section].title}</DialogTitle>
              <DialogDescription>{SECTION_DIALOG[section].description}</DialogDescription>
            </DialogHeader>
            {section === "entrenar" && <TrainAgentForm onSaved={() => setSection(null)} />}
            {section === "negocio" && <BusinessKnowledgeForm onSaved={() => setSection(null)} />}
            {section === "habilidades" && <AgentSkills embedded />}
            {section === "permisos" && <AgentPermissionsForm onSaved={() => setSection(null)} />}
            {section === "voz" && <AgentVoice embedded />}
          </DialogContent>
        )}
      </Dialog>

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
