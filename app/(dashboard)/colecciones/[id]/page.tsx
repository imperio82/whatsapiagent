"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Pencil,
  Plus,
  Rows3,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@components/ui/dialog";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import { ListingForm } from "@components/features/listings/listing-form";
import { announceMatches } from "@components/features/listings/announce-matches";
import { ProductForm } from "@components/features/products/product-form";
import { FieldsEditor, fieldsProblem, newField, type FieldDraft } from "@components/features/collections/fields-editor";
import {
  useCollectionRows,
  useDeleteCollection,
  useDeleteCollectionRow,
  useReplaceCollectionData,
  useSaveCollectionRow,
  useUpdateCollection,
  useUpdateCollectionColumns,
} from "@hooks/use-collections";
import { useCreateListing, useListing, useUpdateListing } from "@hooks/use-listings";
import { useRunListingMatches } from "@hooks/use-matches";
import { useCreateProduct, useDeleteProduct, useProduct, useUpdateProduct } from "@hooks/use-products";
import type { CollectionDto, CollectionRowDto } from "@modules/collections/application/collections.use-cases";
import { cn } from "@lib/utils";

const int = new Intl.NumberFormat("es-CO");
const TEXTAREA =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type View = "filas" | "tarjetas";
/** La vista elegida se recuerda en este navegador */
const VIEW_KEY = "collection-view";
/** Columna que va de título en las tarjetas, si la tabla la tiene */
const TITLE_COLUMNS = ["titulo", "nombre", "title", "name", "producto", "sede"];
/** Fila que se está editando: una que ya existe (por su id) o una nueva */
type Editing = { rowId: string | null } | null;

const ADD_LABEL = { inventario: "Agregar bien", productos: "Nuevo producto" } as const;

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
  // ?q= abre la tabla ya filtrada (por ejemplo, los bienes por aprobar desde el resumen)
  const initialQuery = useSearchParams().get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>("filas");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
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
  const edit = (rowId: string) => setEditing({ rowId });
  const editingRow = editing?.rowId ? data.rows.find((r) => r.id === editing.rowId) : undefined;

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
          <Button onClick={() => setEditing({ rowId: null })}>
            <Plus className="h-4 w-4" /> {collection.system ? ADD_LABEL[collection.system.kind] : "Agregar fila"}
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
        <RowsView columns={collection.columns} rows={data.rows} offset={(data.page - 1) * data.pageSize} onEdit={edit} />
      ) : (
        <CardsView columns={collection.columns} rows={data.rows} onEdit={edit} />
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configuración de {collection.name}</DialogTitle>
            <DialogDescription>
              {collection.system ? "Esta tabla se arma con tus datos; cada fila se edita desde aquí." : "Nombre, acceso del agente, campos y datos de la tabla."}
            </DialogDescription>
          </DialogHeader>
          {collection.system ? <SystemSettings collection={collection} /> : <TableSettings collection={collection} />}
        </DialogContent>
      </Dialog>

      {editing && collection.system?.kind === "inventario" && <ListingEditor rowId={editing.rowId} onClose={() => setEditing(null)} />}
      {editing && collection.system?.kind === "productos" && <ProductEditor rowId={editing.rowId} onClose={() => setEditing(null)} />}
      {editing && !collection.system && (
        <RowEditor collection={collection} row={editingRow} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Editar" title="Editar" onClick={onClick}>
      <Pencil className="h-3.5 w-3.5" />
    </Button>
  );
}

function RowsView({
  columns,
  rows,
  offset,
  onEdit,
}: {
  columns: string[];
  rows: CollectionRowDto[];
  offset: number;
  onEdit: (rowId: string) => void;
}) {
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
              <th className="w-10 px-2 py-2">
                <span className="sr-only">Editar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className="cursor-pointer border-t border-border align-top hover:bg-accent/30" onClick={() => onEdit(row.id)}>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">{offset + i + 1}</td>
                {columns.map((c) => (
                  <td key={c} className="max-w-[18rem] px-3 py-2">
                    <span className="line-clamp-3" title={row.data[c]}>
                      {row.data[c]}
                    </span>
                  </td>
                ))}
                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <EditButton onClick={() => onEdit(row.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CardsView({ columns, rows, onEdit }: { columns: string[]; rows: CollectionRowDto[]; onEdit: (rowId: string) => void }) {
  const title = titleColumn(columns);
  const rest = columns.filter((c) => c !== title);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <Card key={row.id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold">{(title && row.data[title]) || "Sin nombre"}</div>
              <EditButton onClick={() => onEdit(row.id)} />
            </div>
            <dl className="space-y-1 text-sm">
              {rest
                .filter((c) => row.data[c])
                .map((c) => (
                  <div key={c} className="grid grid-cols-[minmax(0,7rem)_1fr] gap-2">
                    <dt className="truncate text-xs text-muted-foreground" title={c}>
                      {c}
                    </dt>
                    <dd className="line-clamp-3 min-w-0 break-words" title={row.data[c]}>
                      {row.data[c]}
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

/** Una fila de una tabla que subió el negocio: un campo por columna, con la estructura actual de la tabla. */
function RowEditor({ collection, row, onClose }: { collection: CollectionDto; row?: CollectionRowDto; onClose: () => void }) {
  const save = useSaveCollectionRow();
  const remove = useDeleteCollectionRow();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(collection.columns.map((c) => [c, row?.data[c] ?? ""])),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const empty = !Object.values(values).some((v) => v.trim());

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? "Editar fila" : "Agregar fila"}</DialogTitle>
          <DialogDescription>Con las columnas de {collection.name}. Deja vacío lo que no aplique.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {collection.columns.map((c, i) => {
            const long = (values[c] ?? "").length > 60;
            return (
              <div key={c} className="space-y-1.5">
                <Label htmlFor={`col-${i}`}>{c}</Label>
                {long ? (
                  <textarea
                    id={`col-${i}`}
                    rows={3}
                    className={TEXTAREA}
                    value={values[c]}
                    onChange={(e) => setValues({ ...values, [c]: e.target.value })}
                  />
                ) : (
                  <Input id={`col-${i}`} value={values[c]} onChange={(e) => setValues({ ...values, [c]: e.target.value })} />
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {row ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">¿Borrar la fila?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  No
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: collection.id, rowId: row.id }, { onSuccess: onClose })}
                >
                  Sí, borrar
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Borrar fila
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={empty || save.isPending}
              onClick={() => save.mutate({ id: collection.id, rowId: row?.id, values }, { onSuccess: onClose })}
            >
              {row ? "Guardar" : "Agregar fila"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Un bien del inventario: el formulario completo (fotos, estado, datos privados del propietario). */
function ListingEditor({ rowId, onClose }: { rowId: string | null; onClose: () => void }) {
  const { data: listing, isLoading } = useListing(rowId);
  const create = useCreateListing();
  const update = useUpdateListing();
  const findBuyers = useRunListingMatches();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rowId ? (listing ? `${listing.code} · ${listing.title}` : "Editar bien") : "Agregar bien"}</DialogTitle>
          <DialogDescription>
            La IA solo usa la información pública: nombre, precio, ciudad, barrio, características, descripción y fotos.
          </DialogDescription>
        </DialogHeader>
        {listing?.status === "AVAILABLE" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-xs text-muted-foreground">
            <span>Busca de nuevo compradores que esperan algo así (los que ya recibieron propuesta no se repiten).</span>
            <Button size="sm" variant="outline" disabled={findBuyers.isPending} onClick={() => findBuyers.mutate(listing.id)}>
              <Target className="h-4 w-4" /> {findBuyers.isPending ? "Buscando…" : "Buscar interesados"}
            </Button>
          </div>
        )}
        {rowId && isLoading ? (
          <div className="h-48 animate-pulse rounded-md bg-muted/50" />
        ) : (
          <ListingForm
            key={listing?.id ?? "new"}
            initial={listing}
            submitting={create.isPending || update.isPending}
            onCancel={onClose}
            onSubmit={async (values) => {
              const saved = listing ? await update.mutateAsync({ id: listing.id, input: values }) : await create.mutateAsync(values);
              announceMatches(saved);
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProductEditor({ rowId, onClose }: { rowId: string | null; onClose: () => void }) {
  const { data: product, isLoading } = useProduct(rowId);
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const remove = useDeleteProduct();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rowId ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          <DialogDescription>Si no llevas inventario, desactiva el control de stock.</DialogDescription>
        </DialogHeader>
        {rowId && isLoading ? (
          <div className="h-48 animate-pulse rounded-md bg-muted/50" />
        ) : (
          <ProductForm
            initial={product}
            submitting={create.isPending || update.isPending}
            onCancel={onClose}
            onSubmit={async (values) => {
              if (product) await update.mutateAsync({ id: product.id, input: values });
              else await create.mutateAsync(values);
              onClose();
            }}
          />
        )}
        {product && (
          <div className="flex items-center gap-2 border-t border-border pt-3">
            {confirmDelete ? (
              <>
                <span className="text-sm">¿Eliminar el producto?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  No
                </Button>
                <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(product.id, { onSuccess: onClose })}>
                  Sí, eliminar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Eliminar producto
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Inventario o productos: se importan desde un archivo y el acceso lo da el permiso de catálogo. */
function SystemSettings({ collection }: { collection: CollectionDto }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-2 rounded-md border border-border p-3">
        <p>{collection.description}</p>
        <p className="text-xs text-muted-foreground">
          Para agregar o editar uno por uno, usa el botón de agregar o el lápiz de cada fila. Para cargar muchos de una vez,
          impórtalos desde Excel o Google Sheets.
        </p>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link href={collection.system!.importHref}>
            <Upload className="h-4 w-4" /> Importar desde un archivo
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

      <TableFields collection={collection} />

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

/** Agregar, renombrar, ordenar o quitar campos sin volver a subir la tabla. */
function TableFields({ collection }: { collection: CollectionDto }) {
  const save = useUpdateCollectionColumns();
  const initial = () => collection.columns.map((c) => newField(c, c));
  const [fields, setFields] = useState<FieldDraft[]>(initial);
  const [confirming, setConfirming] = useState(false);

  // Si la tabla cambia por fuera (otro archivo), se parte de sus campos nuevos
  const columnsKey = collection.columns.join("\u0000");
  useEffect(() => {
    setFields(collection.columns.map((c) => newField(c, c)));
    setConfirming(false);
  }, [columnsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed =
    fields.length !== collection.columns.length || fields.some((f, i) => f.from !== collection.columns[i] || f.name.trim() !== f.from);
  const kept = new Set(fields.map((f) => f.from).filter(Boolean));
  const removed = collection.columns.filter((c) => !kept.has(c));
  const problem = fieldsProblem(fields);

  const submit = () =>
    save.mutate(
      { id: collection.id, columns: fields.map((f) => ({ from: f.from, name: f.name.trim() })) },
      { onSuccess: () => setConfirming(false) },
    );

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="text-sm font-medium">Campos</div>
      <p className="text-xs text-muted-foreground">Las filas conservan sus datos al renombrar o mover un campo; los campos nuevos empiezan vacíos.</p>
      <FieldsEditor fields={fields} onChange={setFields} />
      {changed && problem && <p className="text-xs text-destructive">{problem}</p>}
      {confirming ? (
        <div className="space-y-2 rounded-md border border-destructive/40 p-2">
          <p className="text-sm">
            Se borran los datos de {removed.length === 1 ? "el campo" : "los campos"} {removed.map((c) => `"${c}"`).join(", ")} en todas
            las filas. No se puede deshacer.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" disabled={save.isPending} onClick={submit}>
              Sí, guardar
            </Button>
          </div>
        </div>
      ) : (
        changed && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setFields(initial())}>
              Deshacer
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={!!problem || save.isPending}
              onClick={() => (removed.length > 0 && collection.rowCount > 0 ? setConfirming(true) : submit())}
            >
              {save.isPending ? "Guardando…" : "Guardar campos"}
            </Button>
          </div>
        )
      )}
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
