"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  Rows3,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@components/ui/dialog";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import { useCollectionRows, useDeleteCollection, useReplaceCollectionData, useUpdateCollection } from "@hooks/use-collections";
import type { CollectionDto } from "@modules/collections/application/collections.use-cases";
import { cn } from "@lib/utils";

const int = new Intl.NumberFormat("es-CO");
const TEXTAREA =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type View = "filas" | "tarjetas";
/** La vista elegida se recuerda en este navegador */
const VIEW_KEY = "collection-view";
/** Columna que va de título en las tarjetas, si la tabla la tiene */
const TITLE_COLUMNS = ["titulo", "nombre", "title", "name", "producto", "sede"];

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "tarjetas" ? "tarjetas" : "filas";
  } catch {
    return "filas";
  }
}

function saveView(view: View): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // sin almacenamiento: la vista no se recuerda
  }
}

const plain = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function titleColumn(columns: string[]): string | undefined {
  return columns.find((c) => TITLE_COLUMNS.includes(plain(c))) ?? columns[0];
}

export default function CollectionPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>("filas");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data, isLoading, error } = useCollectionRows(id, search, page);

  useEffect(() => setView(loadView()), []);

  // Buscar al dejar de escribir
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const collection = data?.collection;

  if (error) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-sm text-muted-foreground">No se encontró la tabla.</p>
      </div>
    );
  }
  if (isLoading || !data || !collection) return <div className="h-48 animate-pulse rounded-lg bg-muted/50" />;

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const changeView = (v: View) => {
    setView(v);
    saveView(v);
  };

  return (
    <div className="space-y-4">
      <BackLink />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {collection.name}
            {collection.system && <Badge variant="secondary">Del sistema</Badge>}
            {collection.aiEnabled ? <Badge variant="wa">La usa el agente</Badge> : <Badge variant="secondary">Oculta al agente</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {int.format(collection.rowCount)} filas · {collection.columns.length} columnas
            {collection.sourceName ? ` · ${collection.sourceName}` : ""}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en la tabla" className="pl-8" />
          </div>
          <div role="radiogroup" aria-label="Vista" className="inline-flex rounded-md border border-border p-0.5">
            {(
              [
                ["filas", Rows3, "Filas"],
                ["tarjetas", LayoutGrid, "Tarjetas"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={view === value}
                aria-label={label}
                title={label}
                onClick={() => changeView(value)}
                className={cn(
                  "rounded px-2 py-1.5 transition-colors",
                  view === value ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <Button size="icon" variant="outline" className="h-9 w-9" aria-label="Configuración de la tabla" title="Configuración" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {search ? "Ninguna fila tiene esas palabras." : "La tabla está vacía."}
          </CardContent>
        </Card>
      ) : view === "filas" ? (
        <RowsView columns={collection.columns} rows={data.rows} offset={(data.page - 1) * data.pageSize} />
      ) : (
        <CardsView columns={collection.columns} rows={data.rows} />
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            {search ? `${int.format(data.total)} coincidencias · ` : ""}página {data.page} de {pages}
          </span>
          <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configuración de {collection.name}</DialogTitle>
            <DialogDescription>
              {collection.system ? "Esta tabla se arma sola con tus datos." : "Nombre, acceso del agente y datos de la tabla."}
            </DialogDescription>
          </DialogHeader>
          {collection.system ? <SystemSettings collection={collection} /> : <TableSettings collection={collection} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowsView({ columns, rows, offset }: { columns: string[]; rows: Record<string, string>[]; offset: number }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2 text-right font-medium">#</th>
              {columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border align-top">
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">{offset + i + 1}</td>
                {columns.map((c) => (
                  <td key={c} className="max-w-[18rem] px-3 py-2">
                    <span className="line-clamp-3" title={row[c]}>
                      {row[c]}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CardsView({ columns, rows }: { columns: string[]; rows: Record<string, string>[] }) {
  const title = titleColumn(columns);
  const rest = columns.filter((c) => c !== title);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row, i) => (
        <Card key={i}>
          <CardContent className="space-y-2 p-4">
            <div className="font-semibold">{(title && row[title]) || "Sin nombre"}</div>
            <dl className="space-y-1 text-sm">
              {rest
                .filter((c) => row[c])
                .map((c) => (
                  <div key={c} className="grid grid-cols-[minmax(0,7rem)_1fr] gap-2">
                    <dt className="truncate text-xs text-muted-foreground" title={c}>
                      {c}
                    </dt>
                    <dd className="line-clamp-3 min-w-0 break-words" title={row[c]}>
                      {row[c]}
                    </dd>
                  </div>
                ))}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Inventario o productos: se editan en su sección y el acceso lo da el permiso de catálogo. */
function SystemSettings({ collection }: { collection: CollectionDto }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-2 rounded-md border border-border p-3">
        <p>{collection.description}</p>
        <p className="text-xs text-muted-foreground">
          Para agregar, editar, importar, subir fotos o borrar, hazlo en {collection.name}; aquí se ve al instante.
        </p>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link href={collection.system!.editHref}>
            <ExternalLink className="h-4 w-4" /> Editar {collection.name.toLowerCase()}
          </Link>
        </Button>
      </div>
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="font-medium">{collection.aiEnabled ? "El agente la consulta" : "El agente no la consulta"}</div>
        <p className="text-xs text-muted-foreground">El acceso se da en Mi agente → Permisos del agente.</p>
        <Button asChild size="sm" variant="ghost" className="w-full">
          <Link href="/configuracion/ia">
            <ShieldCheck className="h-4 w-4" /> Ir a permisos del agente
          </Link>
        </Button>
      </div>
    </div>
  );
}

function TableSettings({ collection }: { collection: CollectionDto }) {
  const router = useRouter();
  const update = useUpdateCollection();
  const replace = useReplaceCollectionData();
  const remove = useDeleteCollection();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const id = collection.id;
  const metaChanged = name.trim() !== collection.name || description.trim() !== (collection.description ?? "");

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
        <span>
          <span className="font-medium">El agente la puede consultar</span>
          <span className="block text-xs text-muted-foreground">Ve el nombre, la descripción y las columnas.</span>
        </span>
        <Switch checked={collection.aiEnabled} onCheckedChange={(v) => update.mutate({ id, input: { aiEnabled: v } })} />
      </label>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="col-name">Nombre</Label>
          <Input id="col-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="col-desc">Para qué sirve</Label>
          <textarea
            id="col-desc"
            rows={3}
            maxLength={500}
            className={TEXTAREA}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Cuándo debe usarla el agente"
          />
          <p className="text-[11px] text-muted-foreground">El agente decide qué tabla consultar con esto: di qué tiene y cuándo usarla.</p>
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={!metaChanged || name.trim().length < 2 || update.isPending}
          onClick={() => update.mutate({ id, input: { name: name.trim(), description: description.trim() || null } })}
        >
          Guardar
        </Button>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="text-sm font-medium">Reemplazar los datos</div>
        <p className="text-xs text-muted-foreground">
          Sube el archivo actualizado (.xlsx, .csv o .json). Se cambian todas las filas; las columnas pueden ser otras.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) replace.mutate({ id, file });
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" className="w-full" disabled={replace.isPending} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> {replace.isPending ? "Subiendo…" : "Subir archivo"}
        </Button>
      </div>

      <div className="border-t border-border pt-3">
        {confirmDelete ? (
          <div className="space-y-2">
            <p className="text-sm">¿Borrar la tabla y todas sus filas? No se puede deshacer.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(id, { onSuccess: () => router.push("/colecciones") })}
              >
                Sí, borrar
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="w-full text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> Borrar tabla
          </Button>
        )}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/colecciones" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Colecciones
    </Link>
  );
}
