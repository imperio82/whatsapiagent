"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Sparkles, Table2 } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@components/ui/dialog";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import { useCollections, useCreateCollection } from "@hooks/use-collections";

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
            Tablas con la información que tu agente necesita y no cabe en productos o inventario: sedes y horarios,
            tarifas, requisitos, zonas de cobertura, preguntas frecuentes… Súbelas en Excel, CSV o JSON con las columnas
            que quieras; el agente ve el nombre y la descripción de cada tabla y consulta la que necesite.
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
            Todavía no tienes tablas. Sube la primera: por ejemplo, tus sedes con dirección y horario, o tus tarifas.
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
                    </div>
                    {c.aiEnabled ? (
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
                  <div className="text-[11px] text-muted-foreground">
                    Actualizada {formatDistanceToNow(new Date(c.updatedAt), { locale: es, addSuffix: true })}
                    {c.sourceName ? ` · ${c.sourceName}` : ""}
                  </div>
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

function NewCollectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateCollection();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setAiEnabled(true);
    setFile(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva tabla</DialogTitle>
          <DialogDescription>
            La primera fila del Excel o CSV son los nombres de las columnas. En JSON, una lista de objetos; lo anidado se
            convierte en columnas.
          </DialogDescription>
        </DialogHeader>
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
          <div className="space-y-1.5">
            <Label htmlFor="col-file">Archivo (.xlsx, .csv o .json, hasta 5 MB)</Label>
            <Input id="col-file" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
            <span>
              <span className="font-medium">El agente la puede consultar</span>
              <span className="block text-xs text-muted-foreground">Apágalo para guardarla sin que el agente la use.</span>
            </span>
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!file || name.trim().length < 2 || create.isPending}
            onClick={() =>
              create.mutate(
                { meta: { name: name.trim(), description: description.trim() || null, aiEnabled }, file: file! },
                {
                  onSuccess: () => {
                    reset();
                    onOpenChange(false);
                  },
                },
              )
            }
          >
            {create.isPending ? "Subiendo…" : "Crear tabla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
