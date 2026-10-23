import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError, ValidationError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { encryptSecret } from "@shared/infrastructure/crypto/secret-box";
import { resolveSpreadsheets } from "@modules/integrations/infrastructure/registry";
import { spreadsheetIdFrom } from "@modules/integrations/infrastructure/google/google-sheets";
import { guessMapping, IMPORT_TARGETS, missingRequired, type ImportTargetValue } from "../domain/targets";
import type { TabularData } from "../domain/tabular";
import { readTabularFile } from "../infrastructure/file-reader";
import { listTables, parseConnectionUrl } from "../infrastructure/sql-reader";
import { EXTRA_COLUMNS_KEY, type ImportResult } from "./apply-rows";
import { readSource, type DataSourcesService } from "./data-sources.service";

export const TARGETS = ["PRODUCTS", "LISTINGS", "CLIENTS"] as const;
/** Cada cuánto se sincroniza una fuente: manual, cada hora, cada 6 horas o una vez al día. */
export const SYNC_INTERVALS = [60, 360, 1440] as const;

const mappingSchema = z.record(z.union([z.string().max(200), z.array(z.string().max(200)).max(50)]));

export interface PreviewDto {
  columns: string[];
  sample: Record<string, string>[];
  total: number;
  suggestedMapping: Record<string, string>;
  /** Pestañas del Excel o de la hoja de Google, para elegir otra. */
  sheets?: string[];
  sheetName?: string | null;
  /** Tablas de la base externa, cuando aún no se eligió una. */
  tables?: string[];
}

export interface DataSourceDto {
  id: string;
  name: string;
  type: "FILE" | "GOOGLE_SHEET" | "POSTGRES" | "MYSQL";
  target: ImportTargetValue;
  /** Lo que se puede mostrar de la fuente: archivo, hoja o servidor (sin contraseña). */
  detail: string;
  mapping: Record<string, string | string[]>;
  syncEveryMinutes: number | null;
  isActive: boolean;
  lastSyncAt: string | null;
  lastStatus: "OK" | "PARTIAL" | "ERROR" | null;
  lastResult: (Omit<ImportResult, "newListingIds"> & { total?: number }) | null;
  lastError: string | null;
  createdAt: string;
}

function preview(data: TabularData, target: ImportTargetValue, extra: Partial<PreviewDto> = {}): PreviewDto {
  return {
    columns: data.columns,
    sample: data.rows.slice(0, 5),
    total: data.rows.length,
    suggestedMapping: guessMapping(data.columns, target),
    ...extra,
  };
}

function validateMapping(mapping: Record<string, string | string[]>, target: ImportTargetValue, columns?: string[]) {
  const missing = missingRequired(mapping as Record<string, string>, target);
  if (missing.length > 0) throw new ValidationError(`Asigna una columna para: ${missing.map((f) => f.label).join(", ")}`);
  const allowed = new Set([...IMPORT_TARGETS[target].fields.map((f) => f.key), ...(IMPORT_TARGETS[target].allowsExtraColumns ? [EXTRA_COLUMNS_KEY] : [])]);
  for (const key of Object.keys(mapping)) if (!allowed.has(key)) throw new ValidationError(`Campo desconocido: ${key}`);
  if (columns) {
    const used = Object.values(mapping).flat();
    const unknown = used.filter((c) => c && !columns.includes(c));
    if (unknown.length > 0) throw new ValidationError(`Estas columnas no están en la fuente: ${unknown.join(", ")}`);
  }
}

function maskConnection(url: string): string {
  try {
    const p = parseConnectionUrl(url);
    return `${p.kind === "POSTGRES" ? "PostgreSQL" : "MySQL"} · ${p.host}/${p.database}`;
  } catch {
    return "Base de datos";
  }
}

function toDto(s: Awaited<ReturnType<typeof prisma.dataSource.findFirstOrThrow>>): DataSourceDto {
  const config = (s.config ?? {}) as Record<string, string>;
  const detail =
    s.type === "FILE"
      ? config.fileName ?? "Archivo"
      : s.type === "GOOGLE_SHEET"
        ? `Google Sheets · ${config.sheetName ?? ""}`
        : `${config.server ?? (s.type === "POSTGRES" ? "PostgreSQL" : "MySQL")} · tabla ${config.table ?? ""}`;
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    target: s.target,
    detail,
    mapping: s.mapping as Record<string, string | string[]>,
    syncEveryMinutes: s.syncEveryMinutes,
    isActive: s.isActive,
    lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
    lastStatus: s.lastStatus,
    lastResult: (s.lastResult as DataSourceDto["lastResult"]) ?? null,
    lastError: s.lastError,
    createdAt: s.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Archivos (Excel / CSV): se leen, se revisan y se importan una vez
// ---------------------------------------------------------------------------

export const fileImportSchema = z.object({
  target: z.enum(TARGETS),
  sheetName: z.string().max(200).nullish(),
  mapping: mappingSchema.optional(),
});

export class PreviewFileUseCase {
  async execute(file: { buffer: Buffer; name: string }, input: { target: ImportTargetValue; sheetName?: string | null }): Promise<PreviewDto> {
    authorize("tenant.settings");
    const data = await readTabularFile(file.buffer, file.name, input.sheetName);
    return preview(data, input.target, { sheets: data.sheets, sheetName: data.sheetName });
  }
}

export class ImportFileUseCase {
  constructor(private readonly service: DataSourcesService) {}

  async execute(
    file: { buffer: Buffer; name: string },
    input: { target: ImportTargetValue; sheetName?: string | null; mapping: Record<string, string | string[]> },
  ): Promise<DataSourceDto> {
    authorize("tenant.settings");
    const { tenantId, userId } = TenantContext.require();
    const data = await readTabularFile(file.buffer, file.name, input.sheetName);
    validateMapping(input.mapping, input.target, data.columns);
    const result = await this.service.importRows(tenantId, input.target, input.mapping, data);
    const { newListingIds: _ids, ...stored } = result;
    const source = await prisma.dataSource.create({
      data: {
        tenantId,
        name: file.name.slice(0, 120),
        type: "FILE",
        target: input.target,
        config: { fileName: file.name.slice(0, 200), sheetName: data.sheetName },
        mapping: input.mapping,
        lastSyncAt: new Date(),
        lastStatus: result.skipped > 0 ? "PARTIAL" : "OK",
        lastResult: { ...stored, total: data.rows.length },
        createdBy: userId,
      },
    });
    return toDto(source);
  }
}

// ---------------------------------------------------------------------------
// Fuentes conectadas (Google Sheets, PostgreSQL, MySQL): se sincronizan
// ---------------------------------------------------------------------------

const connectedSpec = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GOOGLE_SHEET"), spreadsheet: z.string().min(10).max(500), sheetName: z.string().max(200).nullish() }),
  z.object({ type: z.literal("POSTGRES"), connectionUrl: z.string().min(10).max(1000), table: z.string().max(200).nullish() }),
  z.object({ type: z.literal("MYSQL"), connectionUrl: z.string().min(10).max(1000), table: z.string().max(200).nullish() }),
]);

export const previewSourceSchema = z.object({ target: z.enum(TARGETS) }).and(connectedSpec);

export const createSourceSchema = z
  .object({
    name: z.string().min(2).max(120),
    target: z.enum(TARGETS),
    mapping: mappingSchema,
    syncEveryMinutes: z.union([z.literal(60), z.literal(360), z.literal(1440)]).nullable(),
  })
  .and(connectedSpec);

type ConnectedSpec = z.infer<typeof connectedSpec>;

/** Configuración guardada de la fuente y su URL de conexión (si es una base). */
function specFor(input: ConnectedSpec): { config: Record<string, string>; connectionUrl: string | null } {
  if (input.type === "GOOGLE_SHEET") {
    const spreadsheetId = spreadsheetIdFrom(input.spreadsheet);
    if (!spreadsheetId) throw new ValidationError("Pega el enlace de la hoja de Google (https://docs.google.com/spreadsheets/d/…)");
    return { config: { spreadsheetId, sheetName: input.sheetName ?? "" }, connectionUrl: null };
  }
  const parsed = parseConnectionUrl(input.connectionUrl);
  if ((parsed.kind === "POSTGRES") !== (input.type === "POSTGRES")) throw new ValidationError("La URL no corresponde al tipo de base elegido");
  return { config: { table: input.table ?? "", server: maskConnection(input.connectionUrl) }, connectionUrl: input.connectionUrl.trim() };
}

export class PreviewSourceUseCase {
  async execute(raw: unknown): Promise<PreviewDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const input = previewSourceSchema.parse(raw);
    const { config, connectionUrl } = specFor(input);

    if (input.type === "GOOGLE_SHEET") {
      const sheets = await resolveSpreadsheets(tenantId);
      if (!sheets) throw new ValidationError("Conecta tu cuenta de Google en Integraciones para leer hojas de cálculo");
      const tabs = await sheets.listSheets(config.spreadsheetId!);
      const sheetName = config.sheetName && tabs.includes(config.sheetName) ? config.sheetName : tabs[0];
      if (!sheetName) return { columns: [], sample: [], total: 0, suggestedMapping: {}, sheets: tabs, sheetName: null };
      const data = await readSource(tenantId, { type: "GOOGLE_SHEET", config: { ...config, sheetName } });
      return preview(data, input.target, { sheets: tabs, sheetName });
    }

    // Base de datos: sin tabla elegida se devuelven las tablas disponibles
    if (!config.table) {
      return { columns: [], sample: [], total: 0, suggestedMapping: {}, tables: await listTables(connectionUrl!) };
    }
    const data = await readSource(tenantId, { type: input.type, config, connectionUrl });
    return preview(data, input.target);
  }
}

export class CreateSourceUseCase {
  constructor(private readonly service: DataSourcesService) {}

  async execute(raw: unknown): Promise<DataSourceDto> {
    authorize("tenant.settings");
    const { tenantId, userId } = TenantContext.require();
    const input = createSourceSchema.parse(raw);
    const { config, connectionUrl } = specFor(input);
    if (input.type === "GOOGLE_SHEET" && !config.sheetName) throw new ValidationError("Elige la pestaña de la hoja");
    if (input.type !== "GOOGLE_SHEET" && !config.table) throw new ValidationError("Elige la tabla");
    validateMapping(input.mapping, input.target);

    const source = await prisma.dataSource.create({
      data: {
        tenantId,
        name: input.name,
        type: input.type,
        target: input.target,
        config,
        secretEnc: connectionUrl ? encryptSecret(connectionUrl) : null,
        mapping: input.mapping,
        syncEveryMinutes: input.syncEveryMinutes,
        createdBy: userId,
      },
    });
    // Primera sincronización enseguida; si falla, la fuente queda guardada con el error para corregirla
    await this.service.sync(tenantId, source.id).catch(() => {});
    return toDto(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
  }
}

export class ListSourcesUseCase {
  async execute(): Promise<DataSourceDto[]> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const rows = await prisma.dataSource.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map(toDto);
  }
}

export const updateSourceSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  mapping: mappingSchema.optional(),
  syncEveryMinutes: z.union([z.literal(60), z.literal(360), z.literal(1440)]).nullable().optional(),
  isActive: z.boolean().optional(),
});

export class UpdateSourceUseCase {
  async execute(id: string, raw: unknown): Promise<DataSourceDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const input = updateSourceSchema.parse(raw);
    const source = await prisma.dataSource.findFirst({ where: { id, tenantId } });
    if (!source) throw new NotFoundError("Fuente no encontrada");
    if (input.mapping) validateMapping(input.mapping, source.target);
    const updated = await prisma.dataSource.update({ where: { id }, data: input });
    return toDto(updated);
  }
}

export class DeleteSourceUseCase {
  async execute(id: string): Promise<void> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    // Se borra la fuente; lo que ya se importó se queda
    const { count } = await prisma.dataSource.deleteMany({ where: { id, tenantId } });
    if (count === 0) throw new NotFoundError("Fuente no encontrada");
  }
}

export class SyncSourceUseCase {
  constructor(private readonly service: DataSourcesService) {}

  async execute(id: string): Promise<DataSourceDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const source = await prisma.dataSource.findFirst({ where: { id, tenantId } });
    if (!source) throw new NotFoundError("Fuente no encontrada");
    if (source.type === "FILE") throw new ValidationError("Para actualizar un archivo, súbelo de nuevo");
    await this.service.sync(tenantId, id).catch(() => {});
    return toDto(await prisma.dataSource.findUniqueOrThrow({ where: { id } }));
  }
}
