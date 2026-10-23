import ExcelJS from "exceljs";
import { ValidationError } from "@shared/domain/errors";
import { tableFromMatrix, type TabularData } from "../domain/tabular";

/** Archivos que se pueden subir: Excel moderno y CSV. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface FileTable extends TabularData {
  sheets: string[];
  sheetName: string | null;
}

export async function readTabularFile(buffer: Buffer, fileName: string, sheetName?: string | null): Promise<FileTable> {
  if (buffer.length === 0) throw new ValidationError("El archivo está vacío");
  if (buffer.length > MAX_FILE_BYTES) throw new ValidationError("El archivo pasa de 5 MB. Divídelo o quita columnas que no uses.");
  const name = fileName.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return { ...tableFromMatrix(parseCsv(decodeText(buffer))), sheets: [], sheetName: null };
  if (name.endsWith(".xlsx")) return readXlsx(buffer, sheetName ?? null);
  if (name.endsWith(".xls")) {
    throw new ValidationError("Los archivos .xls (Excel 97-2003) no se pueden leer. Ábrelo en Excel y guárdalo como .xlsx o CSV.");
  }
  throw new ValidationError("Sube un archivo .xlsx o .csv");
}

async function readXlsx(buffer: Buffer, sheetName: string | null): Promise<FileTable> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ValidationError("No se pudo leer el Excel. Verifica que sea un .xlsx válido.");
  }
  const sheets = workbook.worksheets.map((w) => w.name);
  const sheet = (sheetName ? workbook.getWorksheet(sheetName) : undefined) ?? workbook.worksheets.find((w) => w.actualRowCount > 0);
  if (!sheet) return { columns: [], rows: [], sheets, sheetName: null };

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) cells.push(cellText(row.getCell(c)));
    matrix.push(cells);
  });
  return { ...tableFromMatrix(matrix), sheets, sheetName: sheet.name };
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  // Las fechas se pasan como AAAA-MM-DD para no depender del formato regional del archivo
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "result" in value) {
    const result = (value as { result?: unknown }).result;
    if (result instanceof Date) return result.toISOString().slice(0, 10);
    return result === undefined || result === null ? "" : String(result);
  }
  if (typeof value === "object" && "hyperlink" in value) return String((value as { hyperlink: string }).hyperlink);
  if (typeof value === "number") return String(value);
  return cell.text ?? String(value);
}

/** UTF-8 si es válido; si no, Windows-1252 (los CSV que guarda Excel en español). */
function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** CSV con comillas, saltos de línea dentro de comillas y separador , ; o tabulador (se detecta). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
