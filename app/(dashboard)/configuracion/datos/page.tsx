"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, Database, FileSpreadsheet, Plus, RefreshCw, Sheet, Trash2, Upload } from "lucide-react";
import { Badge, type BadgeProps } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@components/ui/dialog";
import { Switch } from "@components/ui/switch";
import { ImportWizard } from "@components/features/data-import/import-wizard";
import { useDataSources, useDeleteSource, useSyncSource, useUpdateSource } from "@hooks/use-data-sources";
import { useCurrentTenant } from "@hooks/use-tenant";
import { IMPORT_TARGETS, type ImportTargetValue } from "@modules/data-import/domain/targets";
import type { DataSourceDto } from "@modules/data-import/application/use-cases";

const SELECT =
  "h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const TYPE_ICON = { FILE: Upload, GOOGLE_SHEET: Sheet, POSTGRES: Database, MYSQL: Database } as const;
const STATUS: Record<NonNullable<DataSourceDto["lastStatus"]>, { label: string; variant: BadgeProps["variant"] }> = {
  OK: { label: "Al día", variant: "success" },
  PARTIAL: { label: "Con filas por corregir", variant: "warning" },
  ERROR: { label: "Error", variant: "destructive" },
};
const TARGET_PARAM: Record<string, ImportTargetValue> = { productos: "PRODUCTS", inventario: "LISTINGS", clientes: "CLIENTS" };

export default function DataSourcesPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <DataSources />
    </Suspense>
  );
}

function DataSources() {
  const params = useSearchParams();
  const { data: tenant } = useCurrentTenant();
  const { data, isLoading } = useDataSources();
  const fromParam = TARGET_PARAM[params.get("destino") ?? ""];
  const [open, setOpen] = useState(Boolean(fromParam));
  const defaultTarget: ImportTargetValue = fromParam ?? (tenant?.agentProfile === "BROKERAGE" ? "LISTINGS" : "PRODUCTS");

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fuentes de datos</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Carga productos, inventario o clientes desde Excel, Google Sheets o tu propia base de datos. Las hojas y bases se sincronizan solas: crean
            lo nuevo y actualizan lo que cambió, sin borrar nada.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Importar o conectar
        </Button>
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-muted/50" />
      ) : !data || data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <FileSpreadsheet className="h-6 w-6" />
            Todavía no has cargado datos. Sube un Excel con tu {tenant?.agentProfile === "BROKERAGE" ? "inventario" : "catálogo"} o tu lista de clientes
            con sus cumpleaños.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((s) => (
            <SourceRow key={s.id} source={s} />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importar o conectar datos</DialogTitle>
            <DialogDescription>Nada se borra: lo que ya existe se actualiza según la columna llave.</DialogDescription>
          </DialogHeader>
          {open && <ImportWizard defaultTarget={defaultTarget} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SourceRow({ source }: { source: DataSourceDto }) {
  const [expanded, setExpanded] = useState(false);
  const sync = useSyncSource();
  const update = useUpdateSource();
  const remove = useDeleteSource();
  const Icon = TYPE_ICON[source.type];
  const r = source.lastResult;
  const status = source.lastStatus ? STATUS[source.lastStatus] : null;
  const connected = source.type !== "FILE";

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{source.name}</span>
                <Badge variant="outline">{IMPORT_TARGETS[source.target].label}</Badge>
                {status && <Badge variant={status.variant}>{status.label}</Badge>}
                {connected && !source.isActive && <Badge variant="secondary">Pausada</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">{source.detail}</div>
              <div className="mt-1 text-xs">
                {source.lastSyncAt ? (
                  <>
                    {connected ? "Última sincronización" : "Importado"} {formatDistanceToNow(new Date(source.lastSyncAt), { locale: es, addSuffix: true })}
                    {r && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {r.created} nuevos · {r.updated} actualizados{r.skipped > 0 ? ` · ${r.skipped} con problemas` : ""}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">Aún no se sincroniza</span>
                )}
              </div>
              {source.lastError && <p className="mt-1 text-xs text-destructive">{source.lastError}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {connected && (
              <>
                <select
                  className={SELECT}
                  aria-label="Frecuencia"
                  value={source.syncEveryMinutes ?? ""}
                  onChange={(e) =>
                    update.mutate({ id: source.id, input: { syncEveryMinutes: e.target.value ? (Number(e.target.value) as 60 | 360 | 1440) : null } })
                  }
                >
                  <option value={60}>Cada hora</option>
                  <option value={360}>Cada 6 horas</option>
                  <option value={1440}>Una vez al día</option>
                  <option value="">Solo manual</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch checked={source.isActive} onCheckedChange={(v) => update.mutate({ id: source.id, input: { isActive: v } })} />
                  Activa
                </label>
                <Button size="sm" variant="outline" onClick={() => sync.mutate(source.id)} disabled={sync.isPending}>
                  <RefreshCw className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} /> Sincronizar
                </Button>
              </>
            )}
            <Button size="icon" variant="ghost" aria-label="Eliminar fuente" onClick={() => remove.mutate(source.id)} disabled={remove.isPending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {r && r.errors.length > 0 && (
          <div>
            <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} /> Ver filas con problemas
            </button>
            {expanded && (
              <ul className="mt-2 space-y-0.5 rounded-md bg-muted/40 p-2 text-xs">
                {r.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">Fila {e.row}:</span> {e.message}
                  </li>
                ))}
                {r.skipped > r.errors.length && <li className="text-muted-foreground">…y {r.skipped - r.errors.length} más</li>}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
