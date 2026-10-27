import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { ConflictError, NotFoundError, ValidationError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { readTabularFile } from "@modules/data-import/infrastructure/file-reader";
import type { TabularData } from "@modules/data-import/domain/tabular";
import {
  COLLECTION_LIMITS,
  normalizeText,
  prepareTable,
  rankRows,
  rowValuesFor,
  searchTextOf,
  tableFromJson,
} from "../domain/collections";
import {
  SYSTEM_COLLECTIONS,
  SYSTEM_PREFIX,
  filterSystemRows,
  systemCollectionsOf,
  systemKindOf,
  systemTable,
  type SystemCollectionKind,
} from "./system-collections";

export interface CollectionDto {
  id: string;
  name: string;
  description: string | null;
  columns: string[];
  rowCount: number;
  aiEnabled: boolean;
  sourceName: string | null;
  updatedAt: string;
  /** Inventario o productos: se ven aquí como tabla, pero se editan en su propia sección */
  system: { kind: SystemCollectionKind; editHref: string } | null;
}

export interface CollectionRowsDto {
  collection: CollectionDto;
  rows: Record<string, string>[];
  /** Filas que coinciden con la búsqueda (o todas) */
  total: number;
  page: number;
  pageSize: number;
}

export interface UploadedFile {
  buffer: Buffer;
  name: string;
}

const PAGE_SIZE = 50;
const INSERT_BATCH = 500;

function toDto(c: {
  id: string;
  name: string;
  description: string | null;
  columns: unknown;
  rowCount: number;
  aiEnabled: boolean;
  sourceName: string | null;
  updatedAt: Date;
}): CollectionDto {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    columns: Array.isArray(c.columns) ? (c.columns as string[]) : [],
    rowCount: c.rowCount,
    aiEnabled: c.aiEnabled,
    sourceName: c.sourceName,
    updatedAt: c.updatedAt.toISOString(),
    system: null,
  };
}

/** Columnas fijas de cada colección del sistema, para la tarjeta de la lista (las características van aparte). */
const SYSTEM_BASE_COLUMNS: Record<SystemCollectionKind, string[]> = {
  inventario: ["Código", "Tipo", "Operación", "Título", "Precio", "Ciudad", "Zona", "Estado", "Descripción"],
  productos: ["Código", "Nombre", "Precio", "Existencias", "Estado", "Descripción"],
};

function systemDto(
  kind: SystemCollectionKind,
  data: { rowCount: number; aiEnabled: boolean; columns?: string[]; updatedAt?: Date | null },
): CollectionDto {
  const def = SYSTEM_COLLECTIONS[kind];
  return {
    id: `${SYSTEM_PREFIX}${kind}`,
    name: def.name,
    description: def.description,
    columns: data.columns ?? SYSTEM_BASE_COLUMNS[kind],
    rowCount: data.rowCount,
    aiEnabled: data.aiEnabled,
    sourceName: null,
    updatedAt: (data.updatedAt ?? new Date()).toISOString(),
    system: { kind, editHref: def.editHref },
  };
}

function rejectSystem(id: string): void {
  const kind = systemKindOf(id);
  if (kind) throw new ValidationError(`Esta tabla se arma con tu ${SYSTEM_COLLECTIONS[kind].name.toLowerCase()}: edítala allá`);
}

/** Excel, CSV o JSON a tabla. */
async function readCollectionFile(file: UploadedFile, sheetName?: string | null): Promise<TabularData & { sheetName: string | null }> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json")) {
    if (file.buffer.length > 5 * 1024 * 1024) throw new ValidationError("El archivo pasa de 5 MB");
    return { ...tableFromJson(file.buffer.toString("utf-8").replace(/^﻿/, "")), sheetName: null };
  }
  try {
    return await readTabularFile(file.buffer, file.name, sheetName);
  } catch (err) {
    if (err instanceof ValidationError && /\.xlsx o \.csv/.test(err.message)) {
      throw new ValidationError("Sube un archivo .xlsx, .csv o .json");
    }
    throw err;
  }
}

/** Borra las filas de la colección y guarda las nuevas, en lotes. */
async function replaceRows(collectionId: string, data: TabularData): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.collectionRow.deleteMany({ where: { collectionId } });
    for (let i = 0; i < data.rows.length; i += INSERT_BATCH) {
      await tx.collectionRow.createMany({
        data: data.rows.slice(i, i + INSERT_BATCH).map((row, j) => ({
          collectionId,
          position: i + j,
          data: row,
          searchText: searchTextOf(row),
        })),
      });
    }
  }, { timeout: 60_000 });
}

export class ListCollectionsUseCase {
  async execute(): Promise<CollectionDto[]> {
    const { tenantId } = TenantContext.require();
    const [system, rows] = await Promise.all([
      systemCollectionsOf(tenantId),
      prisma.collection.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    ]);
    return [...system.map((s) => systemDto(s.kind, s)), ...rows.map(toDto)];
  }
}

export const listRowsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export class GetCollectionRowsUseCase {
  async execute(id: string, input: z.infer<typeof listRowsSchema>): Promise<CollectionRowsDto> {
    const { tenantId } = TenantContext.require();
    const kind = systemKindOf(id);
    if (kind) return systemRows(tenantId, kind, input);
    const collection = await prisma.collection.findFirst({ where: { id, tenantId } });
    if (!collection) throw new NotFoundError("Colección no encontrada");

    const words = normalizeText(input.q ?? "").split(" ").filter((w) => w.length > 0);
    // Para el panel: filas que tengan TODAS las palabras, en su orden original
    const where = { collectionId: id, AND: words.map((w) => ({ searchText: { contains: w } })) };
    const [total, rows] = await Promise.all([
      prisma.collectionRow.count({ where }),
      prisma.collectionRow.findMany({
        where,
        orderBy: { position: "asc" },
        skip: (input.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: { data: true },
      }),
    ]);
    return {
      collection: toDto(collection),
      rows: rows.map((r) => r.data as Record<string, string>),
      total,
      page: input.page,
      pageSize: PAGE_SIZE,
    };
  }
}

async function systemRows(
  tenantId: string,
  kind: SystemCollectionKind,
  input: z.infer<typeof listRowsSchema>,
): Promise<CollectionRowsDto> {
  const [table, info] = await Promise.all([systemTable(tenantId, kind), systemCollectionsOf(tenantId)]);
  const rows = filterSystemRows(table.rows, input.q);
  return {
    collection: systemDto(kind, {
      rowCount: table.rows.length,
      aiEnabled: info.find((i) => i.kind === kind)?.aiEnabled ?? false,
      columns: table.columns,
      updatedAt: table.updatedAt,
    }),
    rows: rows.slice((input.page - 1) * PAGE_SIZE, input.page * PAGE_SIZE),
    total: rows.length,
    page: input.page,
    pageSize: PAGE_SIZE,
  };
}

export const collectionMetaSchema = z.object({
  name: z.string().trim().min(2, "Ponle un nombre a la tabla").max(80),
  description: z.string().trim().max(500).optional().nullable(),
  aiEnabled: z.boolean().optional(),
});
export type CollectionMetaInput = z.infer<typeof collectionMetaSchema>;

export class CreateCollectionUseCase {
  async execute(meta: CollectionMetaInput, file: UploadedFile, sheetName?: string | null): Promise<CollectionDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const count = await prisma.collection.count({ where: { tenantId } });
    if (count >= COLLECTION_LIMITS.perTenant) {
      throw new ValidationError(`Puedes tener hasta ${COLLECTION_LIMITS.perTenant} tablas. Borra alguna que ya no uses.`);
    }
    if (await prisma.collection.findFirst({ where: { tenantId, name: meta.name } })) {
      throw new ConflictError(`Ya tienes una tabla llamada "${meta.name}"`);
    }
    const read = await readCollectionFile(file, sheetName);
    const data = prepareTable(read);
    const collection = await prisma.collection.create({
      data: {
        tenantId,
        name: meta.name,
        description: meta.description || null,
        aiEnabled: meta.aiEnabled ?? true,
        columns: data.columns,
        rowCount: data.rows.length,
        sourceName: read.sheetName ? `${file.name} · ${read.sheetName}` : file.name,
      },
    });
    await replaceRows(collection.id, data);
    return toDto(collection);
  }
}

/** Reemplaza todos los datos de la tabla con un archivo nuevo (la estructura puede cambiar). */
export class ReplaceCollectionDataUseCase {
  async execute(id: string, file: UploadedFile, sheetName?: string | null): Promise<CollectionDto> {
    authorize("tenant.settings");
    rejectSystem(id);
    const { tenantId } = TenantContext.require();
    const existing = await prisma.collection.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundError("Colección no encontrada");
    const read = await readCollectionFile(file, sheetName);
    const data = prepareTable(read);
    await replaceRows(id, data);
    const updated = await prisma.collection.update({
      where: { id },
      data: {
        columns: data.columns,
        rowCount: data.rows.length,
        sourceName: read.sheetName ? `${file.name} · ${read.sheetName}` : file.name,
      },
    });
    return toDto(updated);
  }
}

export class UpdateCollectionUseCase {
  async execute(id: string, input: Partial<CollectionMetaInput>): Promise<CollectionDto> {
    authorize("tenant.settings");
    rejectSystem(id);
    const { tenantId } = TenantContext.require();
    const existing = await prisma.collection.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundError("Colección no encontrada");
    if (input.name && input.name !== existing.name && (await prisma.collection.findFirst({ where: { tenantId, name: input.name } }))) {
      throw new ConflictError(`Ya tienes una tabla llamada "${input.name}"`);
    }
    const updated = await prisma.collection.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.aiEnabled !== undefined ? { aiEnabled: input.aiEnabled } : {}),
      },
    });
    return toDto(updated);
  }
}

export class DeleteCollectionUseCase {
  async execute(id: string): Promise<void> {
    authorize("tenant.settings");
    rejectSystem(id);
    const { tenantId } = TenantContext.require();
    const { count } = await prisma.collection.deleteMany({ where: { id, tenantId } });
    if (count === 0) throw new NotFoundError("Colección no encontrada");
  }
}

/** Busca la tabla por nombre entre las que el agente puede usar (igual, o que contenga lo que pidió). */
async function agentTable(tenantId: string, name: string, allowed: string[]) {
  const all = await prisma.collection.findMany({
    where: { tenantId, name: { in: allowed } },
    select: { id: true, name: true, columns: true, rowCount: true },
  });
  const wanted = normalizeText(name);
  const collection = all.find((c) => normalizeText(c.name) === wanted) ?? all.find((c) => normalizeText(c.name).includes(wanted));
  return { collection, available: all.map((c) => c.name) };
}

/** Para la herramienta del agente: busca en una tabla por nombre. Fuera de HTTP, sin TenantContext. */
export async function searchCollection(
  tenantId: string,
  allowed: string[],
  name: string,
  query: string | undefined,
  limit: number = COLLECTION_LIMITS.resultRows,
): Promise<
  | { ok: true; table: string; columns: string[]; totalRows: number; rows: Record<string, string>[] }
  | { ok: false; error: string; available: string[] }
> {
  const { collection, available } = await agentTable(tenantId, name, allowed);
  if (!collection) return { ok: false, error: "tabla_inexistente", available };

  const take = Math.min(Math.max(limit, 1), COLLECTION_LIMITS.resultRows);
  const words = normalizeText(query ?? "").split(" ").filter((w) => w.length > 2);
  const rows =
    words.length === 0
      ? await prisma.collectionRow.findMany({
          where: { collectionId: collection.id },
          orderBy: { position: "asc" },
          take: collection.rowCount <= COLLECTION_LIMITS.wholeTableRows ? COLLECTION_LIMITS.wholeTableRows : take,
          select: { data: true, searchText: true },
        })
      : rankRows(
          await prisma.collectionRow.findMany({
            where: { collectionId: collection.id, OR: words.map((w) => ({ searchText: { contains: w } })) },
            orderBy: { position: "asc" },
            take: 300,
            select: { data: true, searchText: true },
          }),
          query,
          take,
        );
  return {
    ok: true,
    table: collection.name,
    columns: collection.columns as string[],
    totalRows: collection.rowCount,
    rows: rows.map((r) => r.data as Record<string, string>),
  };
}

type RowWriteResult =
  | { ok: true; table: string; row: Record<string, string> }
  | { ok: false; error: string; detail?: string; columns?: string[]; candidates?: Record<string, string>[]; available?: string[] };

/** El agente agrega una fila (por ejemplo, una reserva o un pedido especial) con las columnas de la tabla. */
export async function addCollectionRow(
  tenantId: string,
  allowed: string[],
  name: string,
  values: Record<string, unknown>,
): Promise<RowWriteResult> {
  const { collection, available } = await agentTable(tenantId, name, allowed);
  if (!collection) return { ok: false, error: "tabla_inexistente", available };
  const columns = collection.columns as string[];
  const parsed = rowValuesFor(columns, values);
  if (parsed.unknown.length > 0) return { ok: false, error: "columnas_inexistentes", detail: parsed.unknown.join(", "), columns };
  if (!Object.values(parsed.values).some(Boolean)) return { ok: false, error: "fila_vacia", columns };
  if (collection.rowCount >= COLLECTION_LIMITS.rows) return { ok: false, error: "tabla_llena" };

  const row = Object.fromEntries(columns.map((c) => [c, parsed.values[c] ?? ""]));
  await prisma.$transaction(async (tx) => {
    const last = await tx.collectionRow.findFirst({
      where: { collectionId: collection.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    await tx.collectionRow.create({
      data: { collectionId: collection.id, position: (last?.position ?? -1) + 1, data: row, searchText: searchTextOf(row) },
    });
    await tx.collection.update({ where: { id: collection.id }, data: { rowCount: { increment: 1 } } });
  });
  return { ok: true, table: collection.name, row };
}

/**
 * El agente cambia valores de una fila que ya existe. La fila se identifica con palabras que solo ella tenga
 * (un código, un nombre, un teléfono); si coinciden varias, no cambia nada y le devuelve las opciones.
 */
export async function updateCollectionRow(
  tenantId: string,
  allowed: string[],
  name: string,
  find: string,
  values: Record<string, unknown>,
): Promise<RowWriteResult> {
  const { collection, available } = await agentTable(tenantId, name, allowed);
  if (!collection) return { ok: false, error: "tabla_inexistente", available };
  const columns = collection.columns as string[];
  const parsed = rowValuesFor(columns, values);
  if (parsed.unknown.length > 0) return { ok: false, error: "columnas_inexistentes", detail: parsed.unknown.join(", "), columns };
  if (Object.keys(parsed.values).length === 0) return { ok: false, error: "sin_cambios", columns };

  const words = normalizeText(find).split(" ").filter(Boolean);
  if (words.length === 0) return { ok: false, error: "falta_buscar", detail: "Di qué fila cambiar con palabras que solo ella tenga" };
  const matches = await prisma.collectionRow.findMany({
    where: { collectionId: collection.id, AND: words.map((w) => ({ searchText: { contains: w } })) },
    orderBy: { position: "asc" },
    take: 4,
    select: { id: true, data: true },
  });
  if (matches.length === 0) return { ok: false, error: "fila_no_encontrada" };
  if (matches.length > 1) {
    return { ok: false, error: "varias_filas", detail: "Usa palabras más precisas", candidates: matches.slice(0, 3).map((m) => m.data as Record<string, string>) };
  }
  const row = { ...(matches[0]!.data as Record<string, string>), ...parsed.values };
  await prisma.$transaction([
    prisma.collectionRow.update({ where: { id: matches[0]!.id }, data: { data: row, searchText: searchTextOf(row) } }),
    // Para que la tabla muestre que cambió
    prisma.collection.update({ where: { id: collection.id }, data: { rowCount: collection.rowCount } }),
  ]);
  return { ok: true, table: collection.name, row };
}

/**
 * Las tablas que el agente puede consultar, para describírselas en el prompt: las que tienen el acceso del
 * agente prendido y las que usa alguna habilidad activa (aunque estén apagadas o vacías).
 */
export async function aiCollections(tenantId: string, skillTableIds: string[] = []) {
  const rows = await prisma.collection.findMany({
    where: { tenantId, OR: [{ aiEnabled: true, rowCount: { gt: 0 } }, { id: { in: skillTableIds } }] },
    orderBy: { name: "asc" },
    select: { name: true, description: true, columns: true, rowCount: true },
  });
  return rows.map((c) => ({ ...c, columns: c.columns as string[] }));
}
