"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Database, FileSpreadsheet, Loader2, Sheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { dataSourcesService, type ConnectedSourceInput, type Mapping } from "@services/data-sources.service";
import { ApiError } from "@services/api-client";
import { announceResult, useInvalidateImported } from "@hooks/use-data-sources";
import { IMPORT_TARGETS, type ImportTargetValue } from "@modules/data-import/domain/targets";
import type { PreviewDto } from "@modules/data-import/application/use-cases";
import { cn } from "@lib/utils";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type SourceKind = "FILE" | "GOOGLE_SHEET" | "POSTGRES" | "MYSQL";

const SOURCES: { value: SourceKind; title: string; text: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "FILE", title: "Archivo Excel o CSV", text: "Se importa una vez. Para actualizar, súbelo de nuevo.", icon: Upload },
  { value: "GOOGLE_SHEET", title: "Google Sheets", text: "Se sincroniza solo cada cierto tiempo. Requiere conectar Google.", icon: Sheet },
  { value: "POSTGRES", title: "PostgreSQL", text: "Lee una tabla o vista de tu base, en solo lectura.", icon: Database },
  { value: "MYSQL", title: "MySQL", text: "Lee una tabla o vista de tu base, en solo lectura.", icon: Database },
];

const FREQUENCIES: { value: 60 | 360 | 1440 | null; label: string }[] = [
  { value: 60, label: "Cada hora" },
  { value: 360, label: "Cada 6 horas" },
  { value: 1440, label: "Una vez al día" },
  { value: null, label: "Solo cuando lo pida" },
];

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : "Error inesperado");

export function ImportWizard({ defaultTarget, onDone }: { defaultTarget: ImportTargetValue; onDone: () => void }) {
  const [target, setTarget] = useState<ImportTargetValue>(defaultTarget);
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [spreadsheet, setSpreadsheet] = useState("");
  const [connectionUrl, setConnectionUrl] = useState("");
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [table, setTable] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<60 | 360 | 1440 | null>(360);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateImported();

  const definition = IMPORT_TARGETS[target];
  const connected = (): ConnectedSourceInput =>
    kind === "GOOGLE_SHEET" ? { type: "GOOGLE_SHEET", spreadsheet, sheetName } : { type: kind as "POSTGRES" | "MYSQL", connectionUrl, table };

  async function read(next?: { sheetName?: string | null; table?: string | null }) {
    const sheet = next?.sheetName !== undefined ? next.sheetName : sheetName;
    const tbl = next?.table !== undefined ? next.table : table;
    setBusy(true);
    try {
      const result =
        kind === "FILE"
          ? await dataSourcesService.previewFile(file!, target, sheet)
          : await dataSourcesService.previewSource(
              target,
              kind === "GOOGLE_SHEET" ? { type: "GOOGLE_SHEET", spreadsheet, sheetName: sheet } : { type: kind as "POSTGRES" | "MYSQL", connectionUrl, table: tbl },
            );
      setPreview(result);
      setSheetName(result.sheetName ?? sheet ?? null);
      setMapping(result.suggestedMapping);
      if (!name) setName(kind === "FILE" ? file!.name : `${definition.label} desde ${kind === "GOOGLE_SHEET" ? "Google Sheets" : kind === "POSTGRES" ? "PostgreSQL" : "MySQL"}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      const source =
        kind === "FILE"
          ? await dataSourcesService.importFile(file!, target, mapping, sheetName)
          : await dataSourcesService.create({ ...connected(), name, target, mapping, syncEveryMinutes: frequency });
      invalidate();
      announceResult(source);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const missing = definition.fields.filter((f) => f.required && !mapping[f.key]);
  const mappedColumns = new Set(Object.entries(mapping).filter(([k]) => k !== "_extra").map(([, v]) => v as string));
  const extraColumns = (mapping._extra as string[] | undefined) ?? [];
  const canRead =
    kind === "FILE" ? Boolean(file) : kind === "GOOGLE_SHEET" ? spreadsheet.length > 10 : connectionUrl.length > 10;
  const hasColumns = (preview?.columns.length ?? 0) > 0;

  // Columnas visibles en la muestra: las asignadas, en el orden de los campos
  const sampleColumns = useMemo(
    () => definition.fields.map((f) => mapping[f.key] as string | undefined).filter((c): c is string => Boolean(c)),
    [definition, mapping],
  );

  return (
    <div className="space-y-5">
      {/* 1. Destino */}
      <section className="space-y-2">
        <Label>1. ¿Qué vas a cargar?</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(IMPORT_TARGETS) as ImportTargetValue[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={target === t}
              onClick={() => {
                setTarget(t);
                setPreview(null);
              }}
              className={cn(
                "rounded-md border p-3 text-left text-sm transition-colors",
                target === t ? "border-wa bg-wa/5" : "border-border hover:bg-accent/50",
              )}
            >
              <span className="block font-medium">{IMPORT_TARGETS[t].label}</span>
              <span className="block text-xs text-muted-foreground">{IMPORT_TARGETS[t].description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 2. Origen */}
      <section className="space-y-2">
        <Label>2. ¿De dónde?</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOURCES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={kind === s.value}
                onClick={() => {
                  setKind(s.value);
                  setPreview(null);
                  setTable(null);
                  setSheetName(null);
                }}
                className={cn(
                  "flex items-start gap-2.5 rounded-md border p-3 text-left text-sm transition-colors",
                  kind === s.value ? "border-wa bg-wa/5" : "border-border hover:bg-accent/50",
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", kind === s.value ? "text-wa" : "text-muted-foreground")} />
                <span>
                  <span className="block font-medium">{s.title}</span>
                  <span className="block text-xs text-muted-foreground">{s.text}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Conexión */}
      {kind && (
        <section className="space-y-3">
          <Label>3. {kind === "FILE" ? "Sube el archivo" : kind === "GOOGLE_SHEET" ? "Pega el enlace de la hoja" : "Datos de conexión"}</Label>
          {kind === "FILE" && (
            <Input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setSheetName(null);
              }}
            />
          )}
          {kind === "GOOGLE_SHEET" && (
            <Input placeholder="https://docs.google.com/spreadsheets/d/…" value={spreadsheet} onChange={(e) => setSpreadsheet(e.target.value)} />
          )}
          {(kind === "POSTGRES" || kind === "MYSQL") && (
            <div className="space-y-1.5">
              <Input
                type="password"
                autoComplete="off"
                placeholder={kind === "POSTGRES" ? "postgresql://usuario:clave@servidor:5432/base?sslmode=require" : "mysql://usuario:clave@servidor:3306/base"}
                value={connectionUrl}
                onChange={(e) => setConnectionUrl(e.target.value)}
              />
              <p className="flex gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                Usa un usuario de solo lectura. La conexión se guarda cifrada y solo se leen la tabla o vista que elijas.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            {preview?.sheets && preview.sheets.length > 1 && (
              <div className="min-w-48 flex-1 space-y-1">
                <span className="text-xs text-muted-foreground">Pestaña</span>
                <select className={SELECT} value={sheetName ?? ""} onChange={(e) => void read({ sheetName: e.target.value })}>
                  {preview.sheets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {preview?.tables && (
              <div className="min-w-48 flex-1 space-y-1">
                <span className="text-xs text-muted-foreground">Tabla o vista</span>
                <select
                  className={SELECT}
                  value={table ?? ""}
                  onChange={(e) => {
                    setTable(e.target.value);
                    void read({ table: e.target.value });
                  }}
                >
                  <option value="" disabled>
                    Elige una tabla…
                  </option>
                  {preview.tables.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button type="button" variant="outline" onClick={() => void read()} disabled={!canRead || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {preview ? "Volver a leer" : kind === "POSTGRES" || kind === "MYSQL" ? "Conectar" : "Leer columnas"}
            </Button>
          </div>
          {preview && !hasColumns && !preview.tables && <p className="text-xs text-destructive">No se encontraron datos. Revisa que la primera fila tenga los encabezados.</p>}
          {preview?.tables && preview.tables.length === 0 && <p className="text-xs text-destructive">El usuario de la conexión no ve ninguna tabla.</p>}
        </section>
      )}

      {/* 4. Mapeo */}
      {preview && hasColumns && (
        <section className="space-y-3">
          <div>
            <Label>4. ¿Qué columna va en cada campo?</Label>
            <p className="text-xs text-muted-foreground">
              {preview.total} fila{preview.total === 1 ? "" : "s"} encontradas. Ya propusimos las que reconocimos por el nombre; revisa y ajusta. La columna
              marcada como llave identifica cada fila: con ella se actualiza lo existente en vez de duplicarlo.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {definition.fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <span className="text-xs font-medium">
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                  {f.isKey && <span className="ml-1 rounded bg-wa/15 px-1 text-[10px] text-wa">llave</span>}
                </span>
                <select
                  className={SELECT}
                  value={(mapping[f.key] as string) ?? ""}
                  onChange={(e) =>
                    setMapping((m) => {
                      const next = { ...m };
                      if (e.target.value) next[f.key] = e.target.value;
                      else delete next[f.key];
                      return next;
                    })
                  }
                >
                  <option value="">— No usar —</option>
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {f.hint && <span className="block text-[11px] text-muted-foreground">{f.hint}</span>}
              </div>
            ))}
          </div>

          {definition.allowsExtraColumns && preview.columns.some((c) => !mappedColumns.has(c)) && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium">Guardar también como características del bien (año, kilometraje, área…)</span>
              <div className="flex flex-wrap gap-1.5">
                {preview.columns
                  .filter((c) => !mappedColumns.has(c))
                  .map((c) => {
                    const on = extraColumns.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setMapping((m) => ({ ...m, _extra: on ? extraColumns.filter((x) => x !== c) : [...extraColumns, c] }))}
                        className={cn("rounded border px-2 py-1 text-xs", on ? "border-wa bg-wa/10 text-wa" : "border-border text-muted-foreground")}
                      >
                        {c}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {sampleColumns.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    {sampleColumns.map((c) => (
                      <th key={c} className="whitespace-nowrap px-2 py-1.5 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.sample.map((row, i) => (
                    <tr key={i}>
                      {sampleColumns.map((c) => (
                        <td key={c} className="max-w-48 truncate px-2 py-1.5">
                          {row[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {kind !== "FILE" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="text-xs font-medium">Nombre de la fuente</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium">Sincronizar</span>
                <select className={SELECT} value={frequency ?? ""} onChange={(e) => setFrequency(e.target.value ? (Number(e.target.value) as 60 | 360 | 1440) : null)}>
                  {FREQUENCIES.map((f) => (
                    <option key={f.label} value={f.value ?? ""}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {missing.length > 0 && (
            <p className="text-xs text-destructive">Falta asignar: {missing.map((f) => f.label).join(", ")}</p>
          )}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
              <ArrowLeft className="h-4 w-4" /> Cambiar origen
            </Button>
            <Button type="button" variant="wa" onClick={() => void submit()} disabled={busy || missing.length > 0 || (kind !== "FILE" && name.trim().length < 2)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {kind === "FILE" ? `Importar ${preview.total} fila${preview.total === 1 ? "" : "s"}` : "Guardar y sincronizar"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
