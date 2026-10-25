import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import type { AITool } from "../../domain/ports/ai-provider";

/**
 * Adapta las herramientas del agente (las mismas del motor simple) al formato de LangChain.
 * Así la lógica de negocio (buscar, reservar stock, crear pedido) vive en un solo lugar.
 */
export function toLangChainTools(tools: AITool[]): Map<string, StructuredToolInterface> {
  return new Map(
    tools.map((t) => [
      t.name,
      tool(async (args: Record<string, unknown>) => t.execute(args), {
        name: t.name,
        description: t.description,
        schema: t.parameters,
      }) as StructuredToolInterface,
    ]),
  );
}

/** Nombres de campo que el modelo a veces traduce al inglés aunque el esquema los pida en español. */
const FIELD_ALIASES: Record<string, string> = {
  zone: "zona",
  budget: "presupuesto",
  maxBudget: "presupuestoMaximo",
  paymentMethod: "formaPago",
  tradeIn: "partePago",
  timeline: "plazo",
  summary: "resumen",
  city: "ciudad",
  searchCity: "ciudadBusqueda",
  propertyType: "tipoBien",
  operation: "operacion",
  looking: "busca",
  name: "nombre",
  phone: "telefono",
  address: "direccion",
  quantity: "cantidad",
};

/** Campos que acepta la herramienta, según su esquema JSON. */
export function toolFields(t: StructuredToolInterface): string[] {
  const properties = (t.schema as { properties?: Record<string, unknown> } | undefined)?.properties;
  return properties ? Object.keys(properties) : [];
}

/**
 * Corrige los campos que el esquema no tiene pero que tienen un equivalente conocido (zone → zona).
 * Solo renombra si el nombre correcto existe en el esquema y el modelo no lo mandó también.
 */
export function normalizeToolArgs(t: StructuredToolInterface, args: Record<string, unknown>): Record<string, unknown> {
  const fields = new Set(toolFields(t));
  if (fields.size === 0) return args;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    const alias = FIELD_ALIASES[key];
    const target = !fields.has(key) && alias && fields.has(alias) && !(alias in args) ? alias : key;
    out[target] = value;
  }
  return out;
}
