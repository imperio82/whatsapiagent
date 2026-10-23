import type { SpreadsheetProvider } from "../../domain/ports/spreadsheet-provider";
import { googleError, googleFetch } from "./google-auth";

const API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Google Sheets como SpreadsheetProvider (solo lectura). */
export class GoogleSheetsProvider implements SpreadsheetProvider {
  readonly provider = "google";

  /** `integrationId`: la conexión de Google (del negocio o de un asesor) cuyo token se usa. */
  constructor(private readonly integrationId: string) {}

  async listSheets(spreadsheetId: string): Promise<string[]> {
    const res = await googleFetch(this.integrationId, `${API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`);
    if (!res.ok) throw await googleError(res, "abrir la hoja");
    const data = (await res.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
    return (data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
  }

  async readSheet(spreadsheetId: string, sheetName: string): Promise<string[][]> {
    // El nombre de la pestaña va entre comillas simples (con las comillas internas duplicadas)
    const range = `'${sheetName.replace(/'/g, "''")}'`;
    const res = await googleFetch(
      this.integrationId,
      `${API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    );
    if (!res.ok) throw await googleError(res, "leer la hoja");
    const data = (await res.json()) as { values?: unknown[][] };
    return (data.values ?? []).map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
  }
}

/** Acepta el enlace completo de la hoja o solo el id. */
export function spreadsheetIdFrom(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(trimmed);
  if (fromUrl) return fromUrl[1]!;
  return /^[a-zA-Z0-9_-]{20,}$/.test(trimmed) ? trimmed : null;
}
