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

export default function AiRulesPage(): React.ReactElement {
  const { data: tenant } = useCurrentTenant();
  const { data: rules, isLoading } = useAiRules();
  const update = useUpdateAiRule();
  const remove = useDeleteAiRule();
  const restore = useRestoreAiRules();
  const [editing, setEditing] = useState<Editing>(null);

  const brokerage = tenant?.agentProfile === "BROKERAGE";
  const activeCount = rules?.filter((r) => r.isActive).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/configuracion/ia" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Asistente con IA
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Reglas de la IA</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Lo que el asistente puede y no puede hacer en tu nombre. Los cambios aplican desde el siguiente mensaje que
            llegue. {rules ? `${activeCount} de ${rules.length} reglas activas.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => restore.mutate()}
            disabled={restore.isPending}
            title="Vuelve a crear las reglas que vienen por defecto y las reactiva. No toca las que agregaste tú."
          >
            <RotateCcw className="h-4 w-4" /> Restaurar por defecto
          </Button>
          <Button onClick={() => setEditing({ mode: "create", category: "POLICY" })}>
            <Plus className="h-4 w-4" /> Nueva regla
          </Button>
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex gap-3 p-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-wa" />
          <p>
            Aunque apagues una regla, hay protecciones que siempre están activas: la IA solo da precios que estén en tu
            {brokerage ? " inventario" : " catálogo"}, nunca envía teléfonos que no sean del negocio o del propio cliente
            {brokerage ? ", y nunca recibe los datos privados del propietario (nombre, teléfono, dirección exacta)" : ""}.
            Una revisión automática bloquea la respuesta antes de enviarla si algo no cuadra.
          </p>
        </CardContent>
      </Card>

      {isLoading || !rules ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : (
        CATEGORIES.map((category) => {
          const items = rules.filter((r) => r.category === category);
          return (
            <section key={category} className="space-y-2">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">{RULE_CATEGORY_LABELS[category]}</h2>
                  <p className="text-xs text-muted-foreground">{CATEGORY_HELP[category]}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing({ mode: "create", category })}>
                  <Plus className="h-3.5 w-3.5" /> Agregar
                </Button>
              </div>
              {items.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
                  Sin reglas en esta sección.
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((rule, i) => (
                    <Card key={rule.id} className={rule.isActive ? "" : "opacity-60"}>
                      <CardContent className="flex items-start gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">
                              {category === "QUALIFICATION" ? `${i + 1}. ` : ""}
                              {rule.title}
                            </span>
                            {rule.isDefault && <Badge variant="secondary">Por defecto</Badge>}
                            {!rule.isActive && <Badge variant="outline">Apagada</Badge>}
                          </div>
                          <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{rule.content}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={(isActive) => update.mutate({ id: rule.id, input: { isActive } })}
                            aria-label={rule.isActive ? "Apagar regla" : "Activar regla"}
                          />
                          <Button variant="ghost" size="icon" onClick={() => setEditing({ mode: "edit", rule })} aria-label="Editar regla">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => remove.mutate(rule.id)}
                            disabled={remove.isPending}
                            aria-label="Eliminar regla"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}

      <RuleDialog editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function RuleDialog({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const create = useCreateAiRule();
  const update = useUpdateAiRule();
  const initial = editing?.mode === "edit" ? editing.rule : null;
  const [category, setCategory] = useState<AiRuleCategoryValue>("POLICY");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [openedFor, setOpenedFor] = useState<Editing>(null);

  // Al abrir el diálogo se cargan los valores de la regla (o vacíos si es nueva)
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
          <DialogTitle>{initial ? "Editar regla" : "Nueva regla"}</DialogTitle>
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
            <Label htmlFor="rule-content">{category === "QUALIFICATION" ? "Pregunta" : "Regla"}</Label>
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
            {initial ? "Guardar" : "Crear regla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
