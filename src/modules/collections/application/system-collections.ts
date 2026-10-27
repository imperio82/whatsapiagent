import { prisma } from "@shared/infrastructure/prisma/client";
import { agentPermissionsFrom, hasPermission } from "@modules/ai/domain/agent-permissions";
import {
  LISTING_KIND_LABELS,
  LISTING_OPERATION_LABELS,
  LISTING_STATUS_LABELS,
} from "@modules/listings/application/dtos";
import { COLLECTION_LIMITS, normalizeText } from "../domain/collections";

/**
 * Colecciones del sistema: el inventario de bienes y los productos se muestran en Colecciones como una
 * tabla más, para ver en un solo lugar todo lo que el agente consulta. Se leen de sus propias tablas
 * (cada fila se edita con el formulario del bien o del producto) y el agente las busca con sus herramientas de catálogo, así
 * que el acceso lo da el permiso "catálogo" y no el interruptor de cada colección.
 */

export type SystemCollectionKind = "inventario" | "productos";
export const SYSTEM_PREFIX = "sistema-";

export const SYSTEM_COLLECTIONS: Record<SystemCollectionKind, { name: string; description: string; importHref: string }> = {
  inventario: {
    name: "Inventario",
    description: "Tus vehículos e inmuebles. El agente los ofrece y da precios solo de lo que esté aquí.",
    importHref: "/configuracion/datos?destino=inventario",
  },
  productos: {
    name: "Productos",
    description: "Tu catálogo de productos. El agente busca precios y existencias aquí.",
    importHref: "/configuracion/datos?destino=productos",
  },
};

export function systemKindOf(id: string): SystemCollectionKind | null {
  const kind = id.startsWith(SYSTEM_PREFIX) ? id.slice(SYSTEM_PREFIX.length) : null;
  return kind === "inventario" || kind === "productos" ? kind : null;
}

export interface SystemTable {
  kind: SystemCollectionKind;
  columns: string[];
  /** id = el del bien o el producto, para editarlo desde la colección */
  rows: { id: string; data: Record<string, string> }[];
  updatedAt: Date | null;
}

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** El inventario como tabla: los datos que ve el comprador (los privados del dueño no van). */
async function inventoryTable(tenantId: string): Promise<SystemTable> {
  const listings = await prisma.listing.findMany({
    where: { tenantId },
    orderBy: { code: "asc" },
    take: COLLECTION_LIMITS.rows,
    select: {
      id: true,
      code: true,
      kind: true,
      operation: true,
      title: true,
      priceCop: true,
      city: true,
      zone: true,
      status: true,
      attributes: true,
      description: true,
      updatedAt: true,
    },
  });
  // Las características (año, kilometraje, área, habitaciones…) son columnas propias
  const extra: string[] = [];
  for (const l of listings) {
    for (const key of Object.keys((l.attributes as Record<string, unknown> | null) ?? {})) if (!extra.includes(key)) extra.push(key);
  }
  const columns = ["Código", "Tipo", "Operación", "Título", "Precio", "Ciudad", "Zona", "Estado", ...extra, "Descripción"];
  const rows = listings.map((l) => {
    const attrs = (l.attributes as Record<string, unknown> | null) ?? {};
    const data: Record<string, string> = {
      Código: l.code,
      Tipo: LISTING_KIND_LABELS[l.kind],
      Operación: LISTING_OPERATION_LABELS[l.operation],
      Título: l.title,
      Precio: cop.format(Number(l.priceCop)),
      Ciudad: l.city,
      Zona: l.zone ?? "",
      Estado: LISTING_STATUS_LABELS[l.status],
      ...Object.fromEntries(extra.map((k) => [k, attrs[k] == null ? "" : String(attrs[k])])),
      Descripción: l.description ?? "",
    };
    return { id: l.id, data };
  });
  return { kind: "inventario", columns, rows, updatedAt: latest(listings.map((l) => l.updatedAt)) };
}

async function productsTable(tenantId: string): Promise<SystemTable> {
  const products = await prisma.product.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    take: COLLECTION_LIMITS.rows,
    select: { id: true, sku: true, name: true, priceCents: true, currency: true, trackInventory: true, stock: true, status: true, description: true, updatedAt: true },
  });
  const columns = ["Código", "Nombre", "Precio", "Existencias", "Estado", "Descripción"];
  const rows = products.map((p) => ({
    id: p.id,
    data: {
      Código: p.sku ?? "",
      Nombre: p.name,
      Precio: new Intl.NumberFormat("es-CO", { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(p.priceCents / 100),
      Existencias: p.trackInventory ? String(p.stock) : "Sin control",
      Estado: p.status === "ACTIVE" ? "Activo" : "Archivado",
      Descripción: p.description ?? "",
    },
  }));
  return { kind: "productos", columns, rows, updatedAt: latest(products.map((p) => p.updatedAt)) };
}

function latest(dates: Date[]): Date | null {
  return dates.reduce<Date | null>((max, d) => (!max || d > max ? d : max), null);
}

export function systemTable(tenantId: string, kind: SystemCollectionKind): Promise<SystemTable> {
  return kind === "inventario" ? inventoryTable(tenantId) : productsTable(tenantId);
}

/** Filas que tienen todas las palabras de la búsqueda, como en las demás colecciones. */
export function filterSystemRows<T extends { data: Record<string, string> }>(rows: T[], q: string | undefined): T[] {
  const words = normalizeText(q ?? "").split(" ").filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((r) => {
    const text = normalizeText(Object.values(r.data).join(" "));
    return words.every((w) => text.includes(w));
  });
}

/**
 * Qué colecciones del sistema tiene el negocio: la de su perfil siempre, y la del otro perfil solo si
 * tiene datos (por ejemplo, si cambió de tipo de negocio). Con el número de filas y si el agente las ve.
 */
export async function systemCollectionsOf(tenantId: string): Promise<{ kind: SystemCollectionKind; rowCount: number; aiEnabled: boolean }[]> {
  const [tenant, listings, products] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { agentProfile: true, aiPermissions: true } }),
    prisma.listing.count({ where: { tenantId } }),
    prisma.product.count({ where: { tenantId } }),
  ]);
  const profile = tenant?.agentProfile ?? "RETAIL";
  const canRead = hasPermission(agentPermissionsFrom(tenant?.aiPermissions, profile), "catalog", "read");
  const result: { kind: SystemCollectionKind; rowCount: number; aiEnabled: boolean }[] = [];
  if (profile === "BROKERAGE" || listings > 0) result.push({ kind: "inventario", rowCount: listings, aiEnabled: canRead && profile === "BROKERAGE" });
  if (profile === "RETAIL" || products > 0) result.push({ kind: "productos", rowCount: products, aiEnabled: canRead && profile === "RETAIL" });
  return result;
}
