"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Building2, Car, Check, ChevronDown, ImageOff, Lock, MapPin, Package, Plus, Search, Target, Users } from "lucide-react";
import { Badge, type BadgeProps } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu";
import { Input } from "@components/ui/input";
import { ListingForm } from "@components/features/listings/listing-form";
import { useArchiveListing, useCreateListing, useListings, useUpdateListing } from "@hooks/use-listings";
import { useRunListingMatches } from "@hooks/use-matches";
import {
  LISTING_KIND_LABELS,
  LISTING_OPERATION_LABELS,
  LISTING_STATUS_LABELS,
  type ListingDto,
  type ListingKindValue,
  type ListingStatusValue,
} from "@modules/listings/application/dtos";
import { cn } from "@lib/utils";

const STATUS_VARIANT: Record<ListingStatusValue, BadgeProps["variant"]> = {
  PENDING_REVIEW: "warning",
  AVAILABLE: "success",
  RESERVED: "secondary",
  SOLD: "outline",
  ARCHIVED: "outline",
};

const KIND_ICON: Record<ListingKindValue, React.ComponentType<{ className?: string }>> = {
  VEHICLE: Car,
  PROPERTY: Building2,
  OTHER: Package,
};

const FILTERS: { label: string; kind?: ListingKindValue; status?: ListingStatusValue }[] = [
  { label: "Todo" },
  { label: "Vehículos", kind: "VEHICLE" },
  { label: "Inmuebles", kind: "PROPERTY" },
  { label: "Por aprobar", status: "PENDING_REVIEW" },
];

const cop = (value: number) => `$${value.toLocaleString("es-CO")}`;

export default function InventoryPage(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(0);
  const [editing, setEditing] = useState<ListingDto | "new" | null>(null);
  const { kind, status } = FILTERS[filter]!;
  const { data, isLoading } = useListings({ search: search || undefined, kind, status });
  const { data: pending } = useListings({ status: "PENDING_REVIEW" });
  const create = useCreateListing();
  const update = useUpdateListing();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground">
            Vehículos e inmuebles que la IA ofrece por WhatsApp. Los datos del propietario nunca salen de aquí.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Agregar bien
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, código o barrio…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f, i) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setFilter(i)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === i ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {f.label}
              {f.status === "PENDING_REVIEW" && pending && pending.length > 0 && (
                <span className="ml-1.5 rounded bg-amber-500/20 px-1 text-amber-700 dark:text-amber-400">{pending.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No hay bienes con estos filtros. Agrega uno o pídele a un vendedor que escriba al WhatsApp: la IA lo registra para que lo apruebes.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onEdit={() => setEditing(listing)}
              onStatus={(s) => update.mutateAsync({ id: listing.id, input: { status: s } }).then(announceMatches).catch(() => {})}
            />
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Agregar bien" : editing ? `${editing.code} · ${editing.title}` : ""}</DialogTitle>
            <DialogDescription>
              La IA solo usa la información pública: nombre, precio, ciudad, barrio, características, descripción y fotos.
            </DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <ListingForm
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? undefined : editing}
              submitting={create.isPending || update.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                const saved =
                  editing === "new" ? await create.mutateAsync(values) : await update.mutateAsync({ id: editing.id, input: values });
                announceMatches(saved);
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Al publicar un bien se buscan compradores: se le avisa al asesor cuántos encontró. */
function announceMatches(listing: ListingDto): void {
  const n = listing.newMatches ?? 0;
  if (n > 0) {
    toast.success(`${n} comprador${n === 1 ? "" : "es"} busca${n === 1 ? "" : "n"} algo así`, {
      description: "Revisa y aprueba los mensajes en Coincidencias.",
      action: { label: "Ver", onClick: () => (window.location.href = "/coincidencias") },
    });
  }
}

function ListingCard({
  listing,
  onEdit,
  onStatus,
}: {
  listing: ListingDto;
  onEdit: () => void;
  onStatus: (status: ListingStatusValue) => void;
}) {
  const archive = useArchiveListing();
  const runMatches = useRunListingMatches();
  const Icon = KIND_ICON[listing.kind];
  const keyFacts = Object.entries(listing.attributes).slice(0, 3);
  const hasPrivate = Boolean(listing.ownerName || listing.ownerPhone || listing.exactAddress || listing.privateNotes);

  return (
    <Card className="flex flex-col overflow-hidden">
      <button type="button" onClick={onEdit} className="relative block aspect-[16/9] w-full bg-muted text-left">
        {listing.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.photos[0]} alt={listing.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          <Badge variant={STATUS_VARIANT[listing.status]} className="bg-background/90 backdrop-blur">
            {LISTING_STATUS_LABELS[listing.status]}
          </Badge>
        </div>
        {listing.photos.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
            {listing.photos.length} fotos
          </span>
        )}
      </button>
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Icon className="h-3.5 w-3.5" /> {LISTING_KIND_LABELS[listing.kind]} · {LISTING_OPERATION_LABELS[listing.operation]} · {listing.code}
            </div>
            <button type="button" onClick={onEdit} className="block truncate text-left font-semibold hover:underline">
              {listing.title}
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded p-1 hover:bg-accent" aria-label="Cambiar estado">
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Editar</DropdownMenuItem>
              {listing.status === "AVAILABLE" && (
                <DropdownMenuItem onClick={() => runMatches.mutate(listing.id)}>Buscar compradores</DropdownMenuItem>
              )}
              {(["AVAILABLE", "RESERVED", "SOLD"] as const).map((s) => (
                <DropdownMenuItem key={s} disabled={s === listing.status} onClick={() => onStatus(s)}>
                  Marcar como {LISTING_STATUS_LABELS[s].toLowerCase()}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => archive.mutate(listing.id)}>Archivar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="text-lg font-semibold">
          {listing.priceCop > 0 ? cop(listing.priceCop) : "Precio por definir"}
          {listing.operation === "RENT" && listing.priceCop > 0 && <span className="text-xs font-normal text-muted-foreground"> /mes</span>}
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> {[listing.zone, listing.city].filter(Boolean).join(", ")}
        </div>

        {keyFacts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {keyFacts.map(([k, v]) => (
              <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[11px]" title={k}>
                {v}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {listing.interestedCount} interesado{listing.interestedCount === 1 ? "" : "s"}
          </span>
          {listing.pendingMatches > 0 && (
            <Link href="/coincidencias" className="flex items-center gap-1 font-medium text-wa hover:underline">
              <Target className="h-3.5 w-3.5" /> {listing.pendingMatches} por avisar
            </Link>
          )}
          {hasPrivate && (
            <span className="flex items-center gap-1" title="Tiene datos privados del propietario">
              <Lock className="h-3.5 w-3.5" /> Propietario
            </span>
          )}
        </div>

        {listing.status === "PENDING_REVIEW" && (
          <Button size="sm" variant="wa" onClick={() => onStatus("AVAILABLE")}>
            <Check className="h-4 w-4" /> Aprobar y publicar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
