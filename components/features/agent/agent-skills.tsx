"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import {
  useAiRules,
  useCreateAiRule,
  useDeleteAiRule,
  useRestoreAiRules,
  useUpdateAiRule,
} from "@hooks/use-ai-rules";
import { useCurrentTenant } from "@hooks/use-tenant";
import { RULE_CATEGORY_LABELS, type AiRuleCategoryValue } from "@modules/ai/domain/default-rules";
import type { AiRuleDto } from "@modules/ai/application/ai-rules.use-cases";

const TEXTAREA =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const CATEGORIES = Object.keys(RULE_CATEGORY_LABELS) as AiRuleCategoryValue[];

const CATEGORY_HELP: Record<AiRuleCategoryValue, string> = {
  POLICY: "Lo que la IA nunca debe decir o hacer, y cómo responder en casos delicados.",
  QUALIFICATION: "Las preguntas que hace, en este orden, para saber si el cliente va en serio. Una por mensaje.",
  HANDOFF: "Cuándo deja de responder y pasa la conversación a una persona del equipo.",
  TONE: "Cómo trata al cliente: tú o usted, formalidad, emojis.",
};

type Editing = { mode: "create"; category: AiRuleCategoryValue } | { mode: "edit"; rule: AiRuleDto } | null;

/** Habilidades del agente. Con `embedded` (dentro del modal de Mi agente) no muestra el encabezado de página. */
export function AgentSkills({ embedded = false }: { embedded?: boolean }): React.ReactElement {
  const { data: tenant } = useCurrentTenant();
  const { data: rules, isLoading } = useAiRules();
  const update = useUpdateAiRule();
  const remove = useDeleteAiRule();
  const restore = useRestoreAiRules();
  const [editing, setEditing] = useState<Editing>(null);
  const [tab, setTab] = useState<AiRuleCategoryValue>(CATEGORIES[0]!);

  const brokerage = tenant?.agentProfile === "BROKERAGE";
  const activeCount = rules?.filter((r) => r.isActive).length ?? 0;

  return (
    <div className="space-y-6">
      <div className={`flex flex-wrap items-start gap-3 ${embedded ? "justify-end" : "justify-between"}`}>
        {!embedded && (
          <div>
            <Link href="/configuracion/ia" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Mi agente
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">Habilidades del agente</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Lo que sabe hacer tu agente y cómo lo hace: cómo trata al cliente, qué puede y no puede hacer, qué preguntas
              hace y cuándo pasa la conversación a una persona. Los cambios aplican desde el siguiente mensaje que llegue.{" "}
              {rules ? `${activeCount} de ${rules.length} habilidades activas.` : ""}
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => restore.mutate()}
            disabled={restore.isPending}
            title="Vuelve a crear las habilidades que vienen por defecto y las reactiva. No toca las que agregaste tú."
          >
            <RotateCcw className="h-4 w-4" /> Restaurar por defecto
          </Button>
          <Button onClick={() => setEditing({ mode: "create", category: tab })}>
            <Plus className="h-4 w-4" /> Nueva habilidad
          </Button>
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex gap-3 p-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-wa" />
          <p>
            Aunque apagues una habilidad, hay protecciones que siempre están activas: la IA solo da precios que estén en tu
            {brokerage ? " inventario" : " catálogo"}, nunca envía teléfonos que no sean del negocio o del propio cliente
            {brokerage ? ", y nunca recibe los datos privados del propietario (nombre, teléfono, dirección exacta)" : ""}.
            Una revisión automática bloquea la respuesta antes de enviarla si algo no cuadra.
          </p>
        </CardContent>
      </Card>

      {/* Una pestaña por sección; las habilidades de la sección elegida van en cuadrícula */}
      <div role="tablist" aria-label="Secciones de habilidades" className="flex gap-1 overflow-x-auto border-b border-border">
        {CATEGORIES.map((category) => {
          const items = rules?.filter((r) => r.category === category) ?? [];
          const selected = category === tab;
          return (
            <button
              key={category}
              type="button"
              role="tab"
              id={`tab-${category}`}
              aria-selected={selected}
              aria-controls={`panel-${category}`}
              onClick={() => setTab(category)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ${
                selected
                  ? "border-wa font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {RULE_CATEGORY_LABELS[category]}
              <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                {items.filter((r) => r.isActive).length}/{items.length}
              </span>
            </button>
          );
        })}
      </div>

      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="max-w-2xl text-sm text-muted-foreground">{CATEGORY_HELP[tab]}</p>
          <Button variant="outline" size="sm" onClick={() => setEditing({ mode: "create", category: tab })}>
            <Plus className="h-3.5 w-3.5" /> Agregar a {RULE_CATEGORY_LABELS[tab].toLowerCase()}
          </Button>
        </div>

        {isLoading || !rules ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rules
              .filter((r) => r.category === tab)
              .map((rule, i) => (
                <Card key={rule.id} className={`flex flex-col ${rule.isActive ? "" : "opacity-60"}`}>
                  <CardContent className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-snug">
                        {tab === "QUALIFICATION" ? `${i + 1}. ` : ""}
                        {rule.title}
                      </span>
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={(isActive) => update.mutate({ id: rule.id, input: { isActive } })}
                        aria-label={rule.isActive ? "Apagar habilidad" : "Activar habilidad"}
                      />
                    </div>
                    <p className="flex-1 whitespace-pre-line text-sm text-muted-foreground">{rule.content}</p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap gap-1">
                        {rule.isDefault && <Badge variant="secondary">Por defecto</Badge>}
                        {!rule.isActive && <Badge variant="outline">Apagada</Badge>}
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Button variant="ghost" size="icon" onClick={() => setEditing({ mode: "edit", rule })} aria-label="Editar habilidad">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove.mutate(rule.id)}
                          disabled={remove.isPending}
                          aria-label="Eliminar habilidad"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            <button
              type="button"
              onClick={() => setEditing({ mode: "create", category: tab })}
              className="flex min-h-36 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-wa hover:text-foreground"
            >
              <Plus className="h-5 w-5" />
              Nueva habilidad
            </button>
          </div>
        )}
      </section>

      <SkillDialog editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function SkillDialog({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const create = useCreateAiRule();
  const update = useUpdateAiRule();
  const initial = editing?.mode === "edit" ? editing.rule : null;
  const [category, setCategory] = useState<AiRuleCategoryValue>("POLICY");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [openedFor, setOpenedFor] = useState<Editing>(null);

  // Al abrir el diálogo se cargan los valores de la habilidad (o vacíos si es nueva)
  if (editing !== openedFor) {
    setOpenedFor(editing);
    setCategory(initial?.category ?? (editing?.mode === "create" ? editing.category : "POLICY"));
    setTitle(initial?.title ?? "");
    setContent(initial?.content ?? "");
  }

  const pending = create.isPending || update.isPending;
  const valid = title.trim().length >= 2 && content.trim().length >= 5;

  async function save() {
    const input = { category, title: title.trim(), content: content.trim() };
    if (initial) await update.mutateAsync({ id: initial.id, input });
    else await create.mutateAsync(input);
    onClose();
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar habilidad" : "Nueva habilidad"}</DialogTitle>
          <DialogDescription>
            Escríbela como se la explicarías a un empleado nuevo: corta, concreta y con ejemplos si hace falta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rule-category">Sección</Label>
            <select
              id="rule-category"
              className={SELECT}
              value={category}
              onChange={(e) => setCategory(e.target.value as AiRuleCategoryValue)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {RULE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-title">Nombre</Label>
            <Input id="rule-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: No dar la placa" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-content">{category === "QUALIFICATION" ? "Pregunta" : "Instrucción"}</Label>
            <textarea
              id="rule-content"
              rows={4}
              maxLength={1500}
              className={TEXTAREA}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                category === "QUALIFICATION"
                  ? "Ej: ¿El vehículo lo necesita para trabajo o para la familia?"
                  : "Ej: Nunca envíes la placa completa del vehículo; solo los dos últimos números si la piden."
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!valid || pending}>
            {initial ? "Guardar" : "Crear habilidad"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
