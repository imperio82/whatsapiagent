import { ValidationError } from "@shared/domain/errors";
import type { TabularData } from "@modules/data-import/domain/tabular";

/**
 * Colecciones: tablas de información con la estructura que el negocio quiera (horarios por sede, tarifas,
 * preguntas frecuentes, zonas de cobertura, requisitos de crédito…). Se guardan tal cual y el agente las
 * consulta por nombre cuando las necesita.
 */

export const COLLECTION_LIMITS = {
  /** Colecciones por negocio */
  perTenant: 30,
  rows: 5_000,
  columns: 60,
  /** Caracteres por celda que se guardan */
  cellChars: 2_000,
  /** Filas que devuelve una consulta del agente */
  resultRows: 10,
  /** Una tabla con hasta estas filas se le entrega completa al agente si no busca nada */
  wholeTableRows: 15,
} as const;

/** Minúsculas, sin tildes y con espacios simples: así se compara lo que se busca con lo que hay. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchTextOf(row: Record<string, string>): string {
  return normalizeText(Object.values(row).join(" "));
}

/**
 * JSON con cualquier forma a tabla: una lista de objetos (o un objeto con una lista adentro). Los objetos
 * anidados se aplanan con punto ("contacto.telefono") y las listas de valores se unen con comas.
 */
export function tableFromJson(text: string): TabularData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError("El JSON no es válido");
  }
  const records = findRecords(parsed);
  if (!records) throw new ValidationError("El JSON debe ser una lista de objetos, por ejemplo [{\"sede\": \"Centro\", \"horario\": \"8 a 6\"}]");

  const columns: string[] = [];
  const rows = records.slice(0, COLLECTION_LIMITS.rows).map((record) => {
    const flat: Record<string, string> = {};
    flatten(record, "", flat);
    for (const key of Object.keys(flat)) if (!columns.includes(key)) columns.push(key);
    return flat;
  });
  return { columns, rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? ""]))) };
}

function findRecords(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    return value.every((v) => v && typeof v === "object" && !Array.isArray(v)) ? value : value.map((v) => ({ valor: v }));
  }
  if (value && typeof value === "object") {
    // { "datos": [...] }: la primera lista de objetos que encuentre
    for (const v of Object.values(value)) {
      if (Array.isArray(v) && v.some((x) => x && typeof x === "object")) return findRecords(v);
    }
    return [value];
  }
  return null;
}

function flatten(value: unknown, prefix: string, into: Record<string, string>): void {
  if (value === null || value === undefined) {
    if (prefix) into[prefix] = "";
  } else if (Array.isArray(value)) {
    into[prefix || "valor"] = value.every((v) => v === null || typeof v !== "object")
      ? value.filter((v) => v !== null && v !== undefined).join(", ")
      : JSON.stringify(value);
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, into);
  } else {
    into[prefix || "valor"] = String(value);
  }
}

/** Revisa y limpia una tabla antes de guardarla: sin columnas vacías, con límites de tamaño. */
export function prepareTable(data: TabularData): TabularData {
  const columns = data.columns.filter((c) => data.rows.some((r) => (r[c] ?? "").trim()));
  if (columns.length === 0 || data.rows.length === 0) throw new ValidationError("El archivo no tiene datos");
  if (columns.length > COLLECTION_LIMITS.columns) {
    throw new ValidationError(`La tabla tiene ${columns.length} columnas; el máximo es ${COLLECTION_LIMITS.columns}`);
  }
  const rows = data.rows.slice(0, COLLECTION_LIMITS.rows).map((r) =>
    Object.fromEntries(columns.map((c) => [c, (r[c] ?? "").trim().slice(0, COLLECTION_LIMITS.cellChars)])),
  );
  return { columns, rows: rows.filter((r) => Object.values(r).some(Boolean)) };
}

/**
 * Ordena las filas por cuántas palabras de la búsqueda contienen (todas primero). Sin búsqueda, en su orden.
 * Las palabras de 1 o 2 letras ("de", "la") no cuentan.
 */
export function rankRows<T extends { searchText: string }>(rows: T[], query: string | undefined, limit: number): T[] {
  const words = normalizeText(query ?? "")
    .split(" ")
    .filter((w) => w.length > 2);
  if (words.length === 0) return rows.slice(0, limit);
  return rows
    .map((row, index) => ({ row, index, score: words.filter((w) => row.searchText.includes(w)).length }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.row);
}

export interface CollectionSummary {
  name: string;
  description: string | null;
  columns: string[];
  rowCount: number;
}

/** Lo que el agente sabe de las colecciones: el nombre, para qué sirve y qué columnas tiene. Va en el prompt. */
export function collectionsCatalog(collections: CollectionSummary[]): string | null {
  if (collections.length === 0) return null;
  const lines = collections.map(
    (c) =>
      `- "${c.name}"${c.description ? `: ${c.description}` : ""} (${c.rowCount} filas; columnas: ${c.columns.slice(0, 20).join(", ")}${
        c.columns.length > 20 ? "…" : ""
      })`,
  );
  return `TABLAS DE INFORMACIÓN DEL NEGOCIO (consúltalas con search_table cuando la pregunta tenga que ver con ellas; responde solo con lo que devuelva la herramienta, sin inventar filas ni valores):\n${lines.join("\n")}`;
}
