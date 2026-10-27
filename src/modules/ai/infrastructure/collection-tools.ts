import type { AITool } from "../domain/ports/ai-provider";
import {
  addCollectionRow,
  searchCollection,
  updateCollectionRow,
} from "@modules/collections/application/collections.use-cases";
import { COLLECTION_LIMITS, tableAccessAtLeast, type TableAccess } from "@modules/collections/domain/collections";

/**
 * Herramientas de las tablas de información del negocio (colecciones), en los dos perfiles.
 * `readable`: las que puede consultar. `skillAccess`: lo que las habilidades activas le dejan hacer en
 * cada tabla; modificar y crear filas solo se ofrecen si alguna habilidad lo permite.
 */
/**
 * Los valores van como lista de { column, value }: Gemini no acepta objetos con claves libres en las
 * herramientas. Si el modelo igual manda un objeto { columna: valor }, también se acepta.
 */
function cellsParam(description: string) {
  return {
    type: "array",
    description,
    items: {
      type: "object",
      properties: {
        column: { type: "string", description: "Nombre de la columna, tal como está en la tabla" },
        value: { type: "string" },
      },
      required: ["column", "value"],
    },
  };
}

function cellsFrom(raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw
        .filter((c): c is { column: unknown; value: unknown } => !!c && typeof c === "object" && "column" in c)
        .map((c) => [String(c.column), c.value]),
    );
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export function buildCollectionTools(tenantId: string, readable: string[], skillAccess: Map<string, TableAccess> = new Map()): AITool[] {
  const updatable = [...skillAccess].filter(([, a]) => tableAccessAtLeast(a, "update")).map(([t]) => t);
  const writable = [...skillAccess].filter(([, a]) => tableAccessAtLeast(a, "write")).map(([t]) => t);
  const tools: AITool[] = [];

  if (readable.length > 0) {
    tools.push({
      name: "search_table",
      description:
        "Consulta una de las TABLAS DE INFORMACIÓN DEL NEGOCIO (horarios, tarifas, sedes, requisitos, zonas, etc.). " +
        "Usa el nombre exacto de la tabla y, si buscas algo puntual, 1 a 4 palabras clave. Sin palabras devuelve las primeras filas.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: readable, description: "Nombre de la tabla" },
          query: { type: "string", description: "Palabras a buscar en la tabla: 'Palermo', 'requisitos crédito'. Vacío trae las primeras filas." },
          limit: { type: "number", description: `Máximo de filas (hasta ${COLLECTION_LIMITS.resultRows})` },
        },
        required: ["table"],
      },
      async execute(args) {
        const result = await searchCollection(
          tenantId,
          readable,
          String(args.table ?? ""),
          typeof args.query === "string" ? args.query : undefined,
          typeof args.limit === "number" ? args.limit : undefined,
        );
        if (result.ok && result.rows.length === 0) {
          return JSON.stringify({ ...result, nota: "No hay filas con esas palabras. Prueba con otra palabra o sin palabras." });
        }
        return JSON.stringify(result);
      },
    });
  }

  if (writable.length > 0) {
    tools.push({
      name: "add_table_row",
      description:
        "Agrega una fila nueva a una tabla del negocio, solo cuando una REGLA DEL NEGOCIO lo indica (por ejemplo, registrar una reserva o una solicitud). " +
        "Usa los nombres de las columnas de la tabla (consúltala antes con search_table si no los conoces) y solo datos que el cliente dio. No inventes valores.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: writable, description: "Nombre de la tabla" },
          values: cellsParam("Una entrada por columna que llenas, por ejemplo Nombre = Ana, Fecha = 12 de mayo"),
        },
        required: ["table", "values"],
      },
      async execute(args) {
        const values = cellsFrom(args.values);
        return JSON.stringify(await addCollectionRow(tenantId, writable, String(args.table ?? ""), values));
      },
    });
  }

  if (updatable.length > 0) {
    tools.push({
      name: "update_table_row",
      description:
        "Cambia valores de UNA fila que ya existe en una tabla del negocio, solo cuando una REGLA DEL NEGOCIO lo indica. " +
        "Identifica la fila con palabras que solo ella tenga (un código, un nombre completo, un teléfono). Si coinciden varias, no cambia nada y te devuelve las opciones.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: updatable, description: "Nombre de la tabla" },
          find: { type: "string", description: "Palabras que identifican la fila: 'RES-014', 'Ana Gómez 3001234567'" },
          values: cellsParam("Solo las columnas que cambian, por ejemplo Estado = Cancelada"),
        },
        required: ["table", "find", "values"],
      },
      async execute(args) {
        const values = cellsFrom(args.values);
        return JSON.stringify(await updateCollectionRow(tenantId, updatable, String(args.table ?? ""), String(args.find ?? ""), values));
      },
    });
  }

  return tools;
}
