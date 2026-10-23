import { prisma } from "@shared/infrastructure/prisma/client";
import {
  normalizePhone,
  parseAmount,
  parseBoolean,
  parseInteger,
  parseListingKind,
  parseListingStatus,
  parseMonthDay,
  parseOperation,
  splitUrls,
} from "../domain/normalize";
import { IMPORT_TARGETS, type ImportTargetValue } from "../domain/targets";
import type { TabularData } from "../domain/tabular";

/**
 * Lleva las filas de una fuente a productos, inventario o clientes. Crea lo nuevo y actualiza
 * lo que ya existe según la columna llave (SKU, código del bien, celular). No borra nada: lo
 * que desaparece de la fuente se queda como está, para no perder historia por un error en la hoja.
 */

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  /** Primeras filas con problema, para mostrarle al usuario qué corregir. */
  errors: { row: number; message: string }[];
  /** Bienes nuevos disponibles: se cruzan con los compradores. */
  newListingIds?: string[];
}

const MAX_ERRORS = 25;
/** Mapeo especial: columnas que se guardan como características del bien. */
export const EXTRA_COLUMNS_KEY = "_extra";

type Mapping = Record<string, string | string[]>;

class RowError extends Error {}

function getter(mapping: Mapping, row: Record<string, string>) {
  return (field: string): string => {
    const column = mapping[field];
    return typeof column === "string" ? (row[column] ?? "").trim() : "";
  };
}

export async function applyRows(tenantId: string, target: ImportTargetValue, mapping: Mapping, data: TabularData): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const fail = (row: number, message: string) => {
    result.skipped += 1;
    if (result.errors.length < MAX_ERRORS) result.errors.push({ row, message });
  };
  // Fila 2 en adelante: la 1 son los encabezados, como la ve el usuario en su hoja
  const handlers = { PRODUCTS: applyProduct, LISTINGS: applyListing, CLIENTS: applyClient } as const;
  const seenKeys = new Set<string>();
  const keyField = IMPORT_TARGETS[target].fields.find((f) => f.isKey)!.key;

  for (const [i, row] of data.rows.entries()) {
    const rowNumber = i + 2;
    const get = getter(mapping, row);
    const key = get(keyField);
    if (key && seenKeys.has(key.toLowerCase())) {
      fail(rowNumber, `"${key}" está repetido en la fuente; se tomó solo la primera fila`);
      continue;
    }
    if (key) seenKeys.add(key.toLowerCase());
    try {
      const outcome = await handlers[target](tenantId, get, row, mapping);
      if (outcome.kind === "created") result.created += 1;
      else result.updated += 1;
      if (outcome.newListingId) (result.newListingIds ??= []).push(outcome.newListingId);
    } catch (err) {
      if (err instanceof RowError) fail(rowNumber, err.message);
      else {
        console.error("[data-import] fila con error:", err);
        fail(rowNumber, "No se pudo guardar esta fila");
      }
    }
  }
  return result;
}

type Outcome = { kind: "created" | "updated"; newListingId?: string };
type Get = (field: string) => string;

function required(get: Get, field: string, label: string): string {
  const value = get(field);
  if (!value) throw new RowError(`Falta ${label}`);
  return value;
}

async function applyProduct(tenantId: string, get: Get): Promise<Outcome> {
  const sku = required(get, "sku", "el código / SKU").slice(0, 64);
  const name = required(get, "name", "el nombre").slice(0, 200);
  const price = parseAmount(required(get, "price", "el precio"));
  if (price === null) throw new RowError(`Precio inválido: "${get("price")}"`);
  const stockRaw = get("stock");
  const stock = stockRaw ? parseInteger(stockRaw) : null;
  if (stockRaw && stock === null) throw new RowError(`Existencias inválidas: "${stockRaw}"`);
  const active = parseBoolean(get("active"));
  const description = get("description");
  const imageUrl = splitUrls(get("imageUrl"))[0];

  const data = {
    name,
    priceCents: Math.round(price * 100),
    ...(description ? { description: description.slice(0, 2000) } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(stock !== null ? { stock, trackInventory: true } : {}),
    ...(active !== null ? { status: active ? ("ACTIVE" as const) : ("ARCHIVED" as const) } : {}),
  };
  const existing = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId, sku } }, select: { id: true } });
  if (existing) {
    await prisma.product.update({ where: { id: existing.id }, data });
    return { kind: "updated" };
  }
  await prisma.product.create({
    data: { tenantId, sku, currency: "COP", trackInventory: stock !== null, stock: stock ?? 0, ...data },
  });
  return { kind: "created" };
}

async function applyListing(tenantId: string, get: Get, row: Record<string, string>, mapping: Mapping): Promise<Outcome> {
  const externalId = required(get, "externalId", "el código del bien").slice(0, 120);
  const title = required(get, "title", "el nombre del bien").slice(0, 200);
  const kind = parseListingKind(required(get, "kind", "el tipo (vehículo o inmueble)"));
  if (!kind) throw new RowError("Falta el tipo (vehículo o inmueble)");
  const price = parseAmount(required(get, "price", "el precio"));
  if (price === null) throw new RowError(`Precio inválido: "${get("price")}"`);
  const city = required(get, "city", "la ciudad").slice(0, 100);
  const status = parseListingStatus(get("status"));
  const photos = splitUrls(get("photos")).slice(0, 20);
  const ownerPhone = get("ownerPhone") ? normalizePhone(get("ownerPhone")) : null;

  // Columnas sin mapear elegidas por el usuario: características del bien ("Año", "Kilometraje"…)
  const extra = Array.isArray(mapping[EXTRA_COLUMNS_KEY]) ? (mapping[EXTRA_COLUMNS_KEY] as string[]) : [];
  const attributes = Object.fromEntries(extra.map((c) => [c, (row[c] ?? "").trim()]).filter(([, v]) => v));

  const optional = (field: string, max: number) => (get(field) ? get(field).slice(0, max) : undefined);
  const data = {
    title,
    kind,
    operation: parseOperation(get("operation")),
    priceCop: BigInt(Math.round(price)),
    city,
    zone: optional("zone", 120),
    description: optional("description", 4000),
    ...(photos.length > 0 ? { photos } : {}),
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(status ? { status } : {}),
    ownerName: optional("ownerName", 120),
    ownerPhone: ownerPhone ?? optional("ownerPhone", 40),
    exactAddress: optional("exactAddress", 300),
  };

  const existing = await prisma.listing.findUnique({ where: { tenantId_externalId: { tenantId, externalId } }, select: { id: true } });
  if (existing) {
    await prisma.listing.update({ where: { id: existing.id }, data });
    return { kind: "updated" };
  }
  const created = await prisma.$transaction(async (tx) => {
    const { listingSeq } = await tx.tenant.update({
      where: { id: tenantId },
      data: { listingSeq: { increment: 1 } },
      select: { listingSeq: true },
    });
    return tx.listing.create({
      data: {
        tenantId,
        externalId,
        code: `INV-${String(listingSeq).padStart(4, "0")}`,
        photos: [],
        status: "AVAILABLE",
        ...data,
      },
      select: { id: true, status: true },
    });
  });
  return { kind: "created", newListingId: created.status === "AVAILABLE" ? created.id : undefined };
}

async function applyClient(tenantId: string, get: Get): Promise<Outcome> {
  const rawPhone = required(get, "phone", "el celular");
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new RowError(`Celular inválido: "${rawPhone}"`);
  const name = required(get, "name", "el nombre").slice(0, 120);
  const email = get("email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RowError(`Correo inválido: "${email}"`);
  const birthdayRaw = get("birthday");
  const birthday = birthdayRaw ? parseMonthDay(birthdayRaw) : null;
  if (birthdayRaw && !birthday) throw new RowError(`Cumpleaños inválido: "${birthdayRaw}" (usa 15/03/1990 o 15 de marzo)`);

  const optional = (field: string, max: number) => (get(field) ? get(field).slice(0, max) : undefined);
  const data = {
    name,
    email: email || undefined,
    city: optional("city", 100),
    address: optional("address", 300),
    notes: optional("notes", 2000),
  };
  const existing = await prisma.client.findUnique({ where: { tenantId_phone: { tenantId, phone } }, select: { id: true } });
  const client = existing
    ? await prisma.client.update({ where: { id: existing.id }, data, select: { id: true } })
    : await prisma.client.create({ data: { tenantId, phone, source: "IMPORT", ...data }, select: { id: true } });

  if (birthday) {
    const current = await prisma.clientDate.findFirst({ where: { tenantId, clientId: client.id, kind: "BIRTHDAY", personName: null } });
    const dateData = { month: birthday.month, day: birthday.day, year: birthday.year ?? current?.year ?? null, isActive: true };
    if (current) await prisma.clientDate.update({ where: { id: current.id }, data: dateData });
    else await prisma.clientDate.create({ data: { tenantId, clientId: client.id, kind: "BIRTHDAY", ...dateData } });
  }
  return { kind: existing ? "updated" : "created" };
}
