/** Datos en forma de tabla, vengan de un archivo, una hoja de Google o una base de datos. */
export interface TabularData {
  columns: string[];
  rows: Record<string, string>[];
}

/** Máximo de filas que se leen por importación o sincronización. */
export const MAX_IMPORT_ROWS = 5000;

/**
 * Convierte una matriz de celdas en tabla: la primera fila con datos son los encabezados, los
 * encabezados repetidos se numeran ("Precio", "Precio (2)") y se ignoran las filas vacías.
 */
export function tableFromMatrix(matrix: string[][], maxRows = MAX_IMPORT_ROWS): TabularData {
  const headerIndex = matrix.findIndex((row) => row.some((c) => c.trim()));
  if (headerIndex < 0) return { columns: [], rows: [] };

  const seen = new Map<string, number>();
  const raw = matrix[headerIndex]!;
  const columns = raw.map((h, i) => {
    const base = h.trim() || `Columna ${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });

  const rows: Record<string, string>[] = [];
  for (const line of matrix.slice(headerIndex + 1)) {
    if (!line.some((c) => c.trim())) continue;
    rows.push(Object.fromEntries(columns.map((c, i) => [c, (line[i] ?? "").trim()])));
    if (rows.length >= maxRows) break;
  }
  return { columns, rows };
}
