import type { Prisma } from "@prisma/client";
import { prisma } from "@shared/infrastructure/prisma/client";
import { decryptSecret } from "@shared/infrastructure/crypto/secret-box";
import { BusinessRuleError } from "@shared/domain/errors";
import { resolveSpreadsheets } from "@modules/integrations/infrastructure/registry";
import type { MatchingService } from "@modules/matching/application/matching.service";
import { tableFromMatrix, type TabularData } from "../domain/tabular";
import type { ImportTargetValue } from "../domain/targets";
import { readTable } from "../infrastructure/sql-reader";
import { applyRows, type ImportResult } from "./apply-rows";

/**
 * Lectura y sincronización de las fuentes guardadas (Google Sheets y bases externas).
 * Los archivos no se guardan: se importan una vez y queda el registro con el resultado.
 */

export type SourceType = "FILE" | "GOOGLE_SHEET" | "POSTGRES" | "MYSQL";

export interface SourceSpec {
  type: SourceType;
  config: Prisma.JsonValue;
  /** URL de conexión ya descifrada (bases externas). */
  connectionUrl?: string | null;
}

const asObject = (v: Prisma.JsonValue) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Si la sincronización se cae a la mitad, no se reintenta antes de esto. */
const RETRY_AFTER_ERROR_MS = 30 * 60 * 1000;

export async function readSource(tenantId: string, spec: SourceSpec): Promise<TabularData> {
  const config = asObject(spec.config);
  if (spec.type === "GOOGLE_SHEET") {
    const sheets = await resolveSpreadsheets(tenantId);
    if (!sheets) throw new BusinessRuleError("Conecta tu cuenta de Google en Integraciones para leer hojas de cálculo");
    const spreadsheetId = String(config.spreadsheetId ?? "");
    const sheetName = String(config.sheetName ?? "");
    if (!spreadsheetId || !sheetName) throw new BusinessRuleError("Falta la hoja o la pestaña");
    return tableFromMatrix(await sheets.readSheet(spreadsheetId, sheetName));
  }
  if (spec.type === "POSTGRES" || spec.type === "MYSQL") {
    if (!spec.connectionUrl) throw new BusinessRuleError("Falta la conexión a la base de datos");
    return readTable(spec.connectionUrl, String(config.table ?? ""));
  }
  throw new BusinessRuleError("Los archivos se importan subiéndolos de nuevo");
}

export class DataSourcesService {
  constructor(private readonly matching?: MatchingService) {}

  /** Importa filas ya leídas y, si son bienes nuevos, busca compradores. */
  async importRows(tenantId: string, target: ImportTargetValue, mapping: Record<string, string | string[]>, data: TabularData): Promise<ImportResult> {
    const result = await applyRows(tenantId, target, mapping, data);
    if (this.matching && result.newListingIds?.length) {
      for (const id of result.newListingIds) {
        await this.matching.findMatchesForListing(tenantId, id).catch((err) => console.warn("[data-import] coincidencias:", err));
      }
    }
    return result;
  }

  /** Lee la fuente guardada, aplica las filas y deja el resultado en la fuente. */
  async sync(tenantId: string, sourceId: string): Promise<ImportResult> {
    const source = await prisma.dataSource.findFirst({ where: { id: sourceId, tenantId } });
    if (!source) throw new BusinessRuleError("Fuente no encontrada");
    try {
      const data = await readSource(tenantId, {
        type: source.type,
        config: source.config,
        connectionUrl: source.secretEnc ? decryptSecret(source.secretEnc) : null,
      });
      const result = await this.importRows(tenantId, source.target, source.mapping as Record<string, string | string[]>, data);
      const { newListingIds: _ids, ...stored } = result;
      await prisma.dataSource.update({
        where: { id: source.id },
        data: {
          lastSyncAt: new Date(),
          lastStatus: result.skipped > 0 ? "PARTIAL" : "OK",
          lastResult: { ...stored, total: data.rows.length },
          lastError: null,
        },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al sincronizar";
      await prisma.dataSource.update({
        where: { id: source.id },
        data: { lastSyncAt: new Date(), lastStatus: "ERROR", lastError: message },
      });
      throw err;
    }
  }

  /** Para el programador de tareas: sincroniza las fuentes a las que ya les toca. */
  async syncDue(now = new Date()): Promise<number> {
    const sources = await prisma.dataSource.findMany({
      where: { isActive: true, syncEveryMinutes: { not: null }, type: { not: "FILE" } },
      select: { id: true, tenantId: true, syncEveryMinutes: true, lastSyncAt: true, lastStatus: true },
    });
    let ran = 0;
    for (const s of sources) {
      const wait = s.lastStatus === "ERROR" ? Math.max(RETRY_AFTER_ERROR_MS, s.syncEveryMinutes! * 60_000) : s.syncEveryMinutes! * 60_000;
      if (s.lastSyncAt && now.getTime() - s.lastSyncAt.getTime() < wait) continue;
      await this.sync(s.tenantId, s.id).catch((err) => console.warn(`[data-import] la fuente ${s.id} falló:`, (err as Error).message));
      ran += 1;
    }
    return ran;
  }
}
