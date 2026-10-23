"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
  LISTING_KIND_LABELS,
  LISTING_KINDS,
  LISTING_OPERATION_LABELS,
  LISTING_OPERATIONS,
  LISTING_STATUS_LABELS,
  LISTING_STATUSES,
  type CreateListingInput,
  type ListingDto,
  type ListingKindValue,
  type ListingOperationValue,
  type ListingStatusValue,
} from "@modules/listings/application/dtos";

const TEXTAREA =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const ATTRIBUTE_HINTS: Record<ListingKindValue, string> = {
  VEHICLE: "Año: 2021\nKilometraje: 48.000 km\nTransmisión: automática\nCombustible: gasolina",
  PROPERTY: "Área: 72 m²\nHabitaciones: 3\nBaños: 2\nParqueadero: sí\nEstrato: 4",
  OTHER: "Característica: valor",
};

/** "Año: 2021" por línea ⇄ { Año: "2021" } */
function parseAttributes(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.split(/:(.*)/s).map((part) => part.trim()))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key!.slice(0, 60), value!.slice(0, 200)]),
  );
}

function attributesToText(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export function ListingForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: ListingDto;
  submitting: boolean;
  onSubmit: (values: CreateListingInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ListingKindValue>(initial?.kind ?? "VEHICLE");
  const [operation, setOperation] = useState<ListingOperationValue>(initial?.operation ?? "SALE");
  const [status, setStatus] = useState<ListingStatusValue>(initial?.status ?? "AVAILABLE");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [price, setPrice] = useState(initial ? String(initial.priceCop) : "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [zone, setZone] = useState(initial?.zone ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [attributes, setAttributes] = useState(initial ? attributesToText(initial.attributes) : "");
  const [photos, setPhotos] = useState(initial?.photos.join("\n") ?? "");
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? "");
  const [ownerPhone, setOwnerPhone] = useState(initial?.ownerPhone ?? "");
  const [exactAddress, setExactAddress] = useState(initial?.exactAddress ?? "");
  const [privateNotes, setPrivateNotes] = useState(initial?.privateNotes ?? "");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const priceCop = Number(price.replace(/\D/g, ""));
    const photoList = photos.split("\n").map((p) => p.trim()).filter(Boolean);
    if (title.trim().length < 3) return setError("Escribe un nombre de al menos 3 letras.");
    if (city.trim().length < 2) return setError("Escribe la ciudad.");
    if (photoList.some((p) => !/^https?:\/\//.test(p))) return setError("Cada foto debe ser un enlace que empiece por https://");
    setError(null);
    await onSubmit({
      kind,
      operation,
      status,
      title: title.trim(),
      priceCop,
      city: city.trim(),
      zone: zone.trim() || null,
      description: description.trim() || null,
      attributes: parseAttributes(attributes),
      photos: photoList,
      ownerName: ownerName.trim() || null,
      ownerPhone: ownerPhone.trim() || null,
      exactAddress: exactAddress.trim() || null,
      privateNotes: privateNotes.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Tipo</Label>
          <select id="kind" className={SELECT} value={kind} onChange={(e) => setKind(e.target.value as ListingKindValue)}>
            {LISTING_KINDS.map((k) => (
              <option key={k} value={k}>
                {LISTING_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="operation">Operación</Label>
          <select id="operation" className={SELECT} value={operation} onChange={(e) => setOperation(e.target.value as ListingOperationValue)}>
            {LISTING_OPERATIONS.map((o) => (
              <option key={o} value={o}>
                {LISTING_OPERATION_LABELS[o]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Estado</Label>
          <select id="status" className={SELECT} value={status} onChange={(e) => setStatus(e.target.value as ListingStatusValue)}>
            {LISTING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LISTING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="title">Nombre</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Mazda CX-5 Grand Touring 2021" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price">Precio (COP){operation === "RENT" ? " al mes" : ""}</Label>
          <Input
            id="price"
            inputMode="numeric"
            value={price ? Number(price.replace(/\D/g, "")).toLocaleString("es-CO") : ""}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
            placeholder="98.000.000"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="city">Ciudad</Label>
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Manizales" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="zone">Barrio o sector</Label>
          <Input id="zone" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Palermo" />
          <p className="text-xs text-muted-foreground">Es lo único de la ubicación que ve el cliente.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Descripción</Label>
        <textarea id="description" rows={3} className={TEXTAREA} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="attributes">Características (una por línea)</Label>
          <textarea
            id="attributes"
            rows={5}
            className={`${TEXTAREA} font-mono text-xs`}
            value={attributes}
            onChange={(e) => setAttributes(e.target.value)}
            placeholder={ATTRIBUTE_HINTS[kind]}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="photos">Fotos (un enlace por línea)</Label>
          <textarea
            id="photos"
            rows={5}
            className={`${TEXTAREA} font-mono text-xs`}
            value={photos}
            onChange={(e) => setPhotos(e.target.value)}
            placeholder="https://…/foto1.jpg"
          />
          <p className="text-xs text-muted-foreground">La IA comparte hasta 3 cuando el cliente pide fotos.</p>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
        <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <Lock className="h-3.5 w-3.5" /> Datos privados: solo los ve tu equipo, la IA nunca los recibe
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ownerName">Propietario</Label>
            <Input id="ownerName" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ownerPhone">Teléfono del propietario</Label>
            <Input id="ownerPhone" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} inputMode="tel" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exactAddress">Dirección exacta o placa</Label>
          <Input id="exactAddress" value={exactAddress} onChange={(e) => setExactAddress(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="privateNotes">Notas internas (comisión, papeles, precio mínimo…)</Label>
          <textarea id="privateNotes" rows={2} className={TEXTAREA} value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)} />
        </div>
      </fieldset>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {initial ? "Guardar cambios" : "Agregar al inventario"}
        </Button>
      </div>
    </form>
  );
}
