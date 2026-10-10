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
