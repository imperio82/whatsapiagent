"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Badge } from "@components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@components/ui/dialog";
import {
  useCreateTemplate,
  useDeleteTemplate,
  useTemplates,
  useUpdateTemplate,
} from "@hooks/use-templates";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  extractVariables,
  upsertTemplateSchema,
  type TemplateDto,
  type UpsertTemplateInput,
} from "@modules/templates/application/dtos";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function TemplatesPage(): React.ReactElement {
  const { data } = useTemplates();
  const [editing, setEditing] = useState<TemplateDto | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plantillas de mensajes</h1>
          <p className="text-sm text-muted-foreground">
            Reutiliza textos frecuentes con variables como{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">{"{{cliente}}"}</code> o{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">{"{{total}}"}</code>.
          </p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Nueva plantilla
            </Button>
          </DialogTrigger>
          <TemplateDialog onClose={() => setCreating(false)} />
        </Dialog>
      </div>

      {(data?.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Aún no creaste plantillas.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Clave</th>
                <th className="px-4 py-2.5">Categoría</th>
                <th className="px-4 py-2.5">Variables</th>
                <th className="px-4 py-2.5">Actualizada</th>
                <th className="px-4 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-accent/30">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{t.name}</div>
                    <div className="line-clamp-1 text-xs text-muted-foreground">{t.body}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{t.key}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="secondary">{TEMPLATE_CATEGORY_LABELS[t.category]}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {t.variables.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {t.variables.map((v) => (
                          <span
                            key={v}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {format(new Date(t.updatedAt), "dd MMM HH:mm", { locale: es })}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditing(t)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <DeleteButton id={t.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <TemplateDialog template={editing} onClose={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  const del = useDeleteTemplate();
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7 text-destructive hover:text-destructive"
      onClick={() => {
        if (confirm("¿Eliminar esta plantilla?")) del.mutate(id);
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

function TemplateDialog({
  template,
  onClose,
}: {
  template?: TemplateDto;
  onClose: () => void;
}) {
  const create = useCreateTemplate();
  const update = useUpdateTemplate();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<UpsertTemplateInput>({
    resolver: zodResolver(upsertTemplateSchema),
    defaultValues: template ?? {
      key: "",
      name: "",
      body: "",
      category: "CUSTOM",
      isActive: true,
    },
  });

  const body = useWatch({ control, name: "body" }) ?? "";
  const detected = extractVariables(body);

  async function onSubmit(values: UpsertTemplateInput) {
    if (template) {
      await update.mutateAsync({ id: template.id, input: values });
    } else {
      await create.mutateAsync(values);
    }
    onClose();
  }

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{template ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
        <DialogDescription>
          Usá{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">{"{{nombre}}"}</code> para variables.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key">Clave</Label>
            <Input id="key" {...register("key")} placeholder="welcome" disabled={!!template} />
            {errors.key && <p className="text-xs text-destructive">{errors.key.message}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Categoría</Label>
          <select
            id="category"
            {...register("category")}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TEMPLATE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="body">Mensaje</Label>
          <textarea
            id="body"
            rows={6}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm"
            placeholder="Hola {{cliente}}, tu pedido {{codigo}} por {{total}} ya está confirmado."
            {...register("body")}
          />
          {errors.body && <p className="text-xs text-destructive">{errors.body.message}</p>}
        </div>
        {detected.length > 0 && (
          <div className="rounded-md border border-dashed border-border p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Variables detectadas
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {detected.map((v) => (
                <Badge key={v} variant="wa">
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending || update.isPending}>
            {template ? "Guardar cambios" : "Crear plantilla"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
