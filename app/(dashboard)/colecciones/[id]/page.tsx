"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import { useCollectionRows, useDeleteCollection, useReplaceCollectionData, useUpdateCollection } from "@hooks/use-collections";

const int = new Intl.NumberFormat("es-CO");
const TEXTAREA =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function CollectionPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useCollectionRows(id, search, page);
  const update = useUpdateCollection();
  const replace = useReplaceCollectionData();
  const remove = useDeleteCollection();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const collection = data?.collection;
  useEffect(() => {
    if (collection) {
      setName(collection.name);
      setDescription(collection.description ?? "");
    }
  }, [collection?.id, collection?.name, collection?.description]); // eslint-disable-line react-hooks/exhaustive-deps

  // Buscar al dejar de escribir
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

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
  const metaChanged = name.trim() !== collection.name || description.trim() !== (collection.description ?? "");

  return (
    <div className="space-y-5">
      <BackLink />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{collection.name}</h1>
              <p className="text-sm text-muted-foreground">
                {int.format(collection.rowCount)} filas · {collection.columns.length} columnas
                {collection.sourceName ? ` · ${collection.sourceName}` : ""}
              </p>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en la tabla" className="pl-8" />
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2 text-right font-medium">#</th>
                    {collection.columns.map((c) => (
                      <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={collection.columns.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                        {search ? "Ninguna fila tiene esas palabras." : "La tabla está vacía."}
                      </td>
                    </tr>
                  )}
                  {data.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border align-top">
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{(data.page - 1) * data.pageSize + i + 1}</td>
                      {collection.columns.map((c) => (
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
        </div>

        {collection.system ? (
          <div className="space-y-3">
            <Card>
              <CardContent className="space-y-3 p-4 text-sm">
                <p>{collection.description}</p>
                <p className="text-xs text-muted-foreground">
                  Esta tabla se arma sola con lo que tienes en {collection.name}: para agregar, editar, importar o borrar, hazlo
                  allá y aquí se ve al instante.
                </p>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link href={collection.system.editHref}>
                    <ExternalLink className="h-4 w-4" /> Editar en {collection.name}
                  </Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 p-4 text-sm">
                <div className="font-medium">{collection.aiEnabled ? "El agente la consulta" : "El agente no la consulta"}</div>
                <p className="text-xs text-muted-foreground">
                  El acceso se da en Mi agente → Permisos del agente, en la sección {collection.name.toLowerCase()}.
                </p>
                <Button asChild size="sm" variant="ghost" className="w-full">
                  <Link href="/configuracion/ia">Ir a permisos del agente</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-3 p-4">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">El agente la puede consultar</span>
                  <span className="block text-xs text-muted-foreground">Ve el nombre, la descripción y las columnas.</span>
                </span>
                <Switch
                  checked={collection.aiEnabled}
                  onCheckedChange={(v) => update.mutate({ id, input: { aiEnabled: v } })}
                />
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="col-name">Nombre</Label>
                <Input id="col-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="col-desc">Para qué sirve</Label>
                <textarea
                  id="col-desc"
                  rows={4}
                  maxLength={500}
                  className={TEXTAREA}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Cuándo debe usarla el agente"
                />
                <p className="text-[11px] text-muted-foreground">
                  El agente decide qué tabla consultar con esto: di qué tiene y cuándo usarla.
                </p>
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={!metaChanged || name.trim().length < 2 || update.isPending}
                onClick={() => update.mutate({ id, input: { name: name.trim(), description: description.trim() || null } })}
              >
                Guardar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4">
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
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4">
              {confirmDelete ? (
                <>
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
                </>
              ) : (
                <Button size="sm" variant="ghost" className="w-full text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Borrar tabla
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
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
