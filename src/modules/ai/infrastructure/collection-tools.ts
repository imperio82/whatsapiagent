import type { AITool } from "../domain/ports/ai-provider";
import { searchCollection } from "@modules/collections/application/collections.use-cases";
import { COLLECTION_LIMITS } from "@modules/collections/domain/collections";

/** Herramienta para consultar las tablas de información del negocio (colecciones), en los dos perfiles. */
export function buildCollectionTools(tenantId: string, tableNames: string[]): AITool[] {
  if (tableNames.length === 0) return [];
  return [
    {
      name: "search_table",
      description:
        "Consulta una de las TABLAS DE INFORMACIÓN DEL NEGOCIO (horarios, tarifas, sedes, requisitos, zonas, etc.). " +
        "Usa el nombre exacto de la tabla y, si buscas algo puntual, 1 a 4 palabras clave. Sin palabras devuelve las primeras filas.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: tableNames, description: "Nombre de la tabla" },
          query: { type: "string", description: "Palabras a buscar en la tabla: 'Palermo', 'requisitos crédito'. Vacío trae las primeras filas." },
          limit: { type: "number", description: `Máximo de filas (hasta ${COLLECTION_LIMITS.resultRows})` },
        },
        required: ["table"],
      },
      async execute(args) {
        const result = await searchCollection(
          tenantId,
          String(args.table ?? ""),
          typeof args.query === "string" ? args.query : undefined,
          typeof args.limit === "number" ? args.limit : undefined,
        );
        if (result.ok && result.rows.length === 0) {
          return JSON.stringify({ ...result, nota: "No hay filas con esas palabras. Prueba con otra palabra o sin palabras." });
        }
        return JSON.stringify(result);
      },
    },
  ];
}
