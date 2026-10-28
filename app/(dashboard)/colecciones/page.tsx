"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { PencilLine, Plus, Sparkles, Table2, Upload, X } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@components/ui/dialog";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import { FieldsEditor, fieldsProblem, newField, type FieldDraft } from "@components/features/collections/fields-editor";
import { useCollections, useCreateBlankCollection, useCreateCollection } from "@hooks/use-collections";
import { cn } from "@lib/utils";

const int = new Intl.NumberFormat("es-CO");
const ACCEPT = ".xlsx,.csv,.json";
const TEXTAREA =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function CollectionsPage(): React.ReactElement {
  const { data, isLoading } = useCollections();
  const [open, setOpen] = useState(false);

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Colecciones</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Toda la información que consulta tu agente, en tablas: tu inventario o tus productos y las tablas que crees aquí o
            subas en Excel, CSV o JSON (sedes y horarios, tarifas, requisitos, zonas de cobertura, preguntas frecuentes…) con
            los campos que quieras. Qué tablas usa el agente lo eliges aquí o en Mi agente → Permisos del agente.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva tabla
        </Button>
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-muted/50" />
      ) : !data || data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <Table2 className="h-6 w-6" />
            Todavía no tienes tablas. Crea la primera: por ejemplo, tus sedes con dirección y horario, o tus tarifas.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((c) => (
            <Link key={c.id} href={`/colecciones/${c.id}`}>
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold">
                      <Table2 className="h-4 w-4 text-muted-foreground" /> {c.name}
                      {c.system && <Badge variant="secondary">Del sistema</Badge>}
                    </div>
                    {c.system && !c.aiEnabled ? (
                      <Badge variant="secondary">Sin permiso del agente</Badge>
                    ) : c.aiEnabled ? (
                      <Badge variant="wa">
                        <Sparkles className="mr-1 h-3 w-3" /> La usa el agente
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Oculta al agente</Badge>
                    )}
                  </div>
                  {c.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                  ) : (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Sin descripción: agrégala para que el agente sepa cuándo usarla.
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {int.format(c.rowCount)} filas · {c.columns.length} columnas: {c.columns.slice(0, 5).join(", ")}
                    {c.columns.length > 5 ? "…" : ""}
                  </div>
                  {!c.system && (
                    <div className="text-[11px] text-muted-foreground">
                      Actualizada {formatDistanceToNow(new Date(c.updatedAt), { locale: es, addSuffix: true })}
                      {c.sourceName ? ` · ${c.sourceName}` : ""}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewCollectionDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

type Mode = "manual" | "archivo";

const MODES = [
  { value: "manual", label: "Crear desde cero", icon: PencilLine },
  { value: "archivo", label: "Importar archivo", icon: Upload },
] as const;

const FIELD_PLACEHOLDERS = ["Sede", "Dirección", "Horario", "Teléfono"];

function NewCollectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const create = useCreateCollection();
  const createBlank = useCreateBlankCollection();
  const [mode, setMode] = useState<Mode>("manual");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FieldDraft[]>(() => [newField(), newField()]);
  // Cada fila guarda sus valores por la clave del campo: si renombran el campo no se pierde lo escrito
  const [rows, setRows] = useState<Record<string, string>[]>([]);

  const reset = () => {
    setMode("manual");
    setName("");
    setDescription("");
    setAiEnabled(true);
    setFile(null);
    setFields([newField(), newField()]);
    setRows([]);
  };
  const close = () => {
    reset();
    onOpenChange(false);
  };

  const problem = mode === "manual" ? fieldsProblem(fields) : file ? null : "Elige el archivo";
  const pending = create.isPending || createBlank.isPending;
  const meta = { name: name.trim(), description: description.trim() || null, aiEnabled };

  const submit = () => {
    if (mode === "archivo") {
      create.mutate({ meta, file: file! }, { onSuccess: close });
      return;
    }
    createBlank.mutate(
      {
        meta,
        columns: fields.map((f) => f.name.trim()),
        rows: rows.map((r) => Object.fromEntries(fields.map((f) => [f.name.trim(), r[f.key] ?? ""]))),
      },
      {
        onSuccess: (c) => {
          close();
          router.push(`/colecciones/${c.id}`);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva tabla</DialogTitle>
          <DialogDescription>Créala aquí con los campos que necesites o súbela desde un archivo.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm" role="tablist">
          {MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "flex items-center justify-center gap-2 rounded px-3 py-1.5 transition-colors",
                mode === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="col-name">Nombre</Label>
            <Input id="col-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Sedes y horarios" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="col-desc">Para qué sirve</Label>
            <textarea
              id="col-desc"
              rows={2}
              maxLength={500}
              className={TEXTAREA}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dirección, teléfono y horario de cada sede. Úsala cuando pregunten dónde estamos o a qué hora abrimos."
            />
          </div>

          {mode === "manual" ? (
            <>
              <div className="space-y-1.5">
                <Label>Campos</Label>
                <p className="text-xs text-muted-foreground">Las columnas de la tabla. Enter agrega otro campo.</p>
                <FieldsEditor fields={fields} onChange={setFields} placeholders={FIELD_PLACEHOLDERS} />
              </div>
              <div className="space-y-1.5">
                <Label>Datos (opcional)</Label>
                <p className="text-xs text-muted-foreground">Escribe las primeras filas; después puedes agregar más desde la tabla.</p>
                <RowsGrid fields={fields} rows={rows} onChange={setRows} />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="col-file">Archivo (.xlsx, .csv o .json, hasta 5 MB)</Label>
              <Input id="col-file" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">
                La primera fila del Excel o CSV son los nombres de las columnas. En JSON, una lista de objetos; lo anidado se
                convierte en columnas.
              </p>
            </div>
          )}

          <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
            <span>
              <span className="font-medium">El agente la puede consultar</span>
              <span className="block text-xs text-muted-foreground">Apágalo para guardarla sin que el agente la use.</span>
            </span>
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
          </label>
        </div>
        <DialogFooter className="items-center gap-2">
          {name.trim().length >= 2 && problem && <span className="mr-auto text-xs text-muted-foreground">{problem}</span>}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!!problem || name.trim().length < 2 || pending} onClick={submit}>
            {pending ? (mode === "archivo" ? "Subiendo…" : "Creando…") : "Crear tabla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Las primeras filas, escritas en una cuadrícula con los campos de la tabla. */
function RowsGrid({
  fields,
  rows,
  onChange,
}: {
  fields: FieldDraft[];
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
}) {
  const setCell = (i: number, key: string, value: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {fields.map((f, i) => (
                  <th key={f.key} className="min-w-[9rem] px-2 py-1.5 text-left font-medium">
                    {f.name.trim() || `Campo ${i + 1}`}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {fields.map((f) => (
                    <td key={f.key} className="p-1">
                      <Input
                        className="h-8"
                        value={r[f.key] ?? ""}
                        maxLength={2000}
                        aria-label={`${f.name.trim() || "Campo"}, fila ${i + 1}`}
                        onChange={(e) => setCell(i, f.key, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="p-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onChange(rows.filter((_, j) => j !== i))}
                      aria-label="Quitar fila"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, {}])}>
        <Plus className="h-4 w-4" /> Agregar fila
      </Button>
    </div>
  );
}
