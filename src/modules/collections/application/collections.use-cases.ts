import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { ConflictError, NotFoundError, ValidationError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { readTabularFile } from "@modules/data-import/infrastructure/file-reader";
import type { TabularData } from "@modules/data-import/domain/tabular";
import { COLLECTION_LIMITS, normalizeText, prepareTable, rankRows, searchTextOf, tableFromJson } from "../domain/collections";

export interface CollectionDto {
  id: string;
  name: string;
  description: string | null;
  columns: string[];
  rowCount: number;
  aiEnabled: boolean;
  sourceName: string | null;
  updatedAt: string;
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
  };
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
    const rows = await prisma.collection.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
    return rows.map(toDto);
  }
}

export const listRowsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export class GetCollectionRowsUseCase {
  async execute(id: string, input: z.infer<typeof listRowsSchema>): Promise<CollectionRowsDto> {
    const { tenantId } = TenantContext.require();
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
    const { tenantId } = TenantContext.require();
    const { count } = await prisma.collection.deleteMany({ where: { id, tenantId } });
    if (count === 0) throw new NotFoundError("Colección no encontrada");
  }
}

/** Para la herramienta del agente: busca en una tabla por nombre. Fuera de HTTP, sin TenantContext. */
export async function searchCollection(
  tenantId: string,
  name: string,
  query: string | undefined,
  limit: number = COLLECTION_LIMITS.resultRows,
): Promise<
  | { ok: true; table: string; columns: string[]; totalRows: number; rows: Record<string, string>[] }
  | { ok: false; error: string; available: string[] }
> {
  const all = await prisma.collection.findMany({
    where: { tenantId, aiEnabled: true },
    select: { id: true, name: true, columns: true, rowCount: true },
  });
  const wanted = normalizeText(name);
  const collection = all.find((c) => normalizeText(c.name) === wanted) ?? all.find((c) => normalizeText(c.name).includes(wanted));
  if (!collection) return { ok: false, error: "tabla_inexistente", available: all.map((c) => c.name) };

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

/** Las tablas que el agente puede consultar, para describírselas en el prompt. */
export async function aiCollections(tenantId: string) {
  const rows = await prisma.collection.findMany({
    where: { tenantId, aiEnabled: true, rowCount: { gt: 0 } },
    orderBy: { name: "asc" },
    select: { name: true, description: true, columns: true, rowCount: true },
  });
  return rows.map((c) => ({ ...c, columns: c.columns as string[] }));
}
