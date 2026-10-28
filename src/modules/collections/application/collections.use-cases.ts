import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { ConflictError, NotFoundError, ValidationError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { readTabularFile } from "@modules/data-import/infrastructure/file-reader";
import type { TabularData } from "@modules/data-import/domain/tabular";
import {
  COLLECTION_LIMITS,
  cleanColumns,
  manualRows,
  normalizeText,
  planColumnChanges,
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
  /** Inventario o productos: se ven aquí como tabla y cada fila se edita con su propio formulario */
  system: { kind: SystemCollectionKind; importHref: string } | null;
}

export interface CollectionRowDto {
  /** Id de la fila; en el inventario o los productos, el id del bien o del producto */
  id: string;
  data: Record<string, string>;
}

export interface CollectionRowsDto {
  collection: CollectionDto;
  rows: CollectionRowDto[];
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
    system: { kind, importHref: def.importHref },
  };
}

function rejectSystem(id: string): void {
  const kind = systemKindOf(id);
  if (kind) throw new ValidationError(`Esta tabla se arma con tu ${SYSTEM_COLLECTIONS[kind].name.toLowerCase()}: edita cada fila con su formulario`);
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
        select: { id: true, data: true },
      }),
    ]);
    return {
      collection: toDto(collection),
      rows: rows.map((r) => ({ id: r.id, data: r.data as Record<string, string> })),
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

/** Valores de una fila desde el panel: { columna: valor }, solo con las columnas de la tabla. */
export const rowValuesSchema = z.object({ values: z.record(z.string(), z.string().max(COLLECTION_LIMITS.cellChars)) });
export type RowValuesInput = z.infer<typeof rowValuesSchema>;

async function ownTable(id: string) {
  rejectSystem(id);
  const { tenantId } = TenantContext.require();
  const collection = await prisma.collection.findFirst({ where: { id, tenantId } });
  if (!collection) throw new NotFoundError("Colección no encontrada");
  return collection;
}

function valuesForTable(columns: string[], values: Record<string, unknown>): Record<string, string> {
  const parsed = rowValuesFor(columns, values);
  if (parsed.unknown.length > 0) throw new ValidationError(`La tabla no tiene las columnas: ${parsed.unknown.join(", ")}`);
  return parsed.values;
}

/** Agrega una fila al final y suma una al conteo de la tabla. */
async function appendRow(collectionId: string, row: Record<string, string>): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const last = await tx.collectionRow.findFirst({
      where: { collectionId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const created = await tx.collectionRow.create({
      data: { collectionId, position: (last?.position ?? -1) + 1, data: row, searchText: searchTextOf(row) },
      select: { id: true },
    });
    await tx.collection.update({ where: { id: collectionId }, data: { rowCount: { increment: 1 } } });
    return created.id;
  });
}

/** Una fila nueva desde el panel, con las columnas que ya tiene la tabla. */
export class AddCollectionRowUseCase {
  async execute(id: string, input: RowValuesInput): Promise<CollectionRowDto> {
    authorize("tenant.settings");
    const collection = await ownTable(id);
    const columns = collection.columns as string[];
    const values = valuesForTable(columns, input.values);
    if (!Object.values(values).some((v) => v.trim())) throw new ValidationError("Llena al menos un dato");
    if (collection.rowCount >= COLLECTION_LIMITS.rows) {
      throw new ValidationError(`La tabla llegó al máximo de ${int(COLLECTION_LIMITS.rows)} filas`);
    }
    const row = Object.fromEntries(columns.map((c) => [c, values[c] ?? ""]));
    return { id: await appendRow(collection.id, row), data: row };
  }
}

export class UpdateCollectionRowUseCase {
  async execute(id: string, rowId: string, input: RowValuesInput): Promise<CollectionRowDto> {
    authorize("tenant.settings");
    const collection = await ownTable(id);
    const existing = await prisma.collectionRow.findFirst({ where: { id: rowId, collectionId: collection.id } });
    if (!existing) throw new NotFoundError("Fila no encontrada");
    const row = { ...(existing.data as Record<string, string>), ...valuesForTable(collection.columns as string[], input.values) };
    await prisma.$transaction([
      prisma.collectionRow.update({ where: { id: rowId }, data: { data: row, searchText: searchTextOf(row) } }),
      // Para que la tabla muestre que cambió
      prisma.collection.update({ where: { id: collection.id }, data: { updatedAt: new Date() } }),
    ]);
    return { id: rowId, data: row };
  }
}

export class DeleteCollectionRowUseCase {
  async execute(id: string, rowId: string): Promise<void> {
    authorize("tenant.settings");
    const collection = await ownTable(id);
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.collectionRow.deleteMany({ where: { id: rowId, collectionId: collection.id } });
      if (count === 0) throw new NotFoundError("Fila no encontrada");
      await tx.collection.update({ where: { id: collection.id }, data: { rowCount: { decrement: 1 } } });
    });
  }
}

const int = (n: number) => n.toLocaleString("es-CO");

export const collectionMetaSchema = z.object({
  name: z.string().trim().min(2, "Ponle un nombre a la tabla").max(80),
  description: z.string().trim().max(500).optional().nullable(),
  aiEnabled: z.boolean().optional(),
});
export type CollectionMetaInput = z.infer<typeof collectionMetaSchema>;

/** Revisa que quepa otra tabla y que el nombre no esté usado. */
async function assertNewTable(tenantId: string, name: string): Promise<void> {
  const count = await prisma.collection.count({ where: { tenantId } });
  if (count >= COLLECTION_LIMITS.perTenant) {
    throw new ValidationError(`Puedes tener hasta ${COLLECTION_LIMITS.perTenant} tablas. Borra alguna que ya no uses.`);
  }
  if (await prisma.collection.findFirst({ where: { tenantId, name } })) {
    throw new ConflictError(`Ya tienes una tabla llamada "${name}"`);
  }
}

async function createTable(tenantId: string, meta: CollectionMetaInput, data: TabularData, sourceName: string | null) {
  const collection = await prisma.collection.create({
    data: {
      tenantId,
      name: meta.name,
      description: meta.description || null,
      aiEnabled: meta.aiEnabled ?? true,
      columns: data.columns,
      rowCount: data.rows.length,
      sourceName,
    },
  });
  if (data.rows.length > 0) await replaceRows(collection.id, data);
  return toDto(collection);
}

export class CreateCollectionUseCase {
  async execute(meta: CollectionMetaInput, file: UploadedFile, sheetName?: string | null): Promise<CollectionDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    await assertNewTable(tenantId, meta.name);
    const read = await readCollectionFile(file, sheetName);
    const data = prepareTable(read);
    return createTable(tenantId, meta, data, read.sheetName ? `${file.name} · ${read.sheetName}` : file.name);
  }
}

export const blankCollectionSchema = collectionMetaSchema.extend({
  columns: z.array(z.string().max(200)).min(1, "Agrega al menos un campo").max(COLLECTION_LIMITS.columns),
  rows: z.array(z.record(z.string(), z.string().max(COLLECTION_LIMITS.cellChars))).max(COLLECTION_LIMITS.rows).optional(),
});
export type BlankCollectionInput = z.infer<typeof blankCollectionSchema>;

/** Una tabla hecha en el panel: sus campos y, si quiere, las primeras filas. */
export class CreateBlankCollectionUseCase {
  async execute(input: BlankCollectionInput): Promise<CollectionDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    await assertNewTable(tenantId, input.name);
    const columns = cleanColumns(input.columns);
    const rows = manualRows(columns, input.rows ?? []);
    return createTable(tenantId, input, { columns, rows }, null);
  }
}

export const columnChangesSchema = z.object({
  columns: z
    .array(z.object({ from: z.string().nullable().optional(), name: z.string().max(200) }))
    .min(1, "La tabla necesita al menos un campo")
    .max(COLLECTION_LIMITS.columns),
});
export type ColumnChangesInput = z.infer<typeof columnChangesSchema>;

/** Agrega, renombra, ordena o quita campos; las filas conservan sus datos (los de un campo quitado se borran). */
export class UpdateCollectionColumnsUseCase {
  async execute(id: string, input: ColumnChangesInput): Promise<CollectionDto> {
    authorize("tenant.settings");
    const collection = await ownTable(id);
    const plan = planColumnChanges(collection.columns as string[], input.columns);
    const updated = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.collectionRow.findMany({ where: { collectionId: id }, select: { id: true, data: true } });
        for (const row of rows) {
          const data = plan.remap(row.data as Record<string, string>);
          await tx.collectionRow.update({ where: { id: row.id }, data: { data, searchText: searchTextOf(data) } });
        }
        return tx.collection.update({ where: { id }, data: { columns: plan.columns } });
      },
      { timeout: 60_000 },
    );
    return toDto(updated);
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
  await appendRow(collection.id, row);
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
    prisma.collection.update({ where: { id: collection.id }, data: { updatedAt: new Date() } }),
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
