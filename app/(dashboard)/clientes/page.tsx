"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@components/ui/dialog";
import { useClients, useCreateClient, useUpdateClient } from "@hooks/use-clients";
import { useClient } from "@hooks/use-clients";
import { formatCurrency } from "@lib/utils";
import { createClientSchema, type CreateClientInput } from "@modules/clients/application/dtos";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";

export default function ClientsPage(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data } = useClients({ search: search || undefined });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Personas que escribieron por WhatsApp o agregaste manualmente.
          </p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Nuevo cliente
            </Button>
          </DialogTrigger>
          <CreateClientDialog onClose={() => setCreating(false)} />
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, teléfono o email…"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {(data?.items.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No hay clientes todavía.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Contacto</th>
                <th className="px-4 py-2.5 text-right">Pedidos</th>
                <th className="px-4 py-2.5 text-right">Total gastado</th>
                <th className="px-4 py-2.5">Última interacción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.items.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="cursor-pointer transition-colors hover:bg-accent/30"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{c.name}</div>
                    {c.source && (
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {c.source}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-sm">{clientPhoneToDisplay(c.phone)}</div>
                    {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.ordersCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatCurrency(c.totalSpentMajor, "GTQ")}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {c.lastInteractionAt
                      ? formatDistanceToNow(new Date(c.lastInteractionAt), { locale: es, addSuffix: true })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClientDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function CreateClientDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateClientInput>({ resolver: zodResolver(createClientSchema) });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nuevo cliente</DialogTitle>
        <DialogDescription>
          Cargá manualmente datos de un cliente que conociste por otro canal.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={handleSubmit(async (v) => {
          await create.mutateAsync(v);
          onClose();
        })}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Teléfono (con código país)</Label>
          <Input id="phone" {...register("phone")} placeholder="502xxxxxxxx" />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email (opcional)</Label>
          <Input id="email" type="email" {...register("email")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Dirección (opcional)</Label>
          <Input id="address" {...register("address")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <textarea
            id="notes"
            rows={3}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
            {...register("notes")}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending}>
            Crear cliente
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ClientDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useClient(id);
  const update = useUpdateClient(id);
  const [notes, setNotes] = useState("");

  if (!id) return null;

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {data ? (
          <>
            <DialogHeader>
              <DialogTitle>{data.name}</DialogTitle>
              <DialogDescription>{clientPhoneToDisplay(data.phone)}</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pedidos
                </div>
                <div className="mt-0.5 text-lg font-semibold">{data.ordersCount}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total gastado
                </div>
                <div className="mt-0.5 text-lg font-semibold">
                  {formatCurrency(data.totalSpentMajor, "GTQ")}
                </div>
              </div>
              {data.email && (
                <div className="col-span-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Email
                  </div>
                  <div>{data.email}</div>
                </div>
              )}
              {data.address && (
                <div className="col-span-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Dirección
                  </div>
                  <div>{data.address}</div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <textarea
                rows={4}
                defaultValue={data.notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                placeholder="Anotaciones internas del cliente…"
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
              <Button
                onClick={() => update.mutate({ notes })}
                disabled={update.isPending}
              >
                Guardar notas
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
