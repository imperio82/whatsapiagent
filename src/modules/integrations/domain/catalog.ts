/**
 * Catálogo de integraciones. Cada proveedor declara qué capacidades ofrece; los agentes piden
 * una capacidad ("calendar") y el registro resuelve qué proveedor conectado la cumple.
 * Para sumar otro proveedor: agregarlo aquí, al enum IntegrationProvider y al registro.
 */

export type IntegrationCapability = "calendar" | "spreadsheet";
export type IntegrationProviderKey = "GOOGLE";

export interface IntegrationDefinition {
  key: IntegrationProviderKey;
  name: string;
  description: string;
  capabilities: IntegrationCapability[];
}

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    key: "GOOGLE",
    name: "Google",
    description: "Calendar para que la IA agende visitas y citas; Sheets para sincronizar productos, inventario o clientes.",
    capabilities: ["calendar", "spreadsheet"],
  },
];

export const CAPABILITY_LABELS: Record<IntegrationCapability, string> = {
  calendar: "Calendario",
  spreadsheet: "Hojas de cálculo",
};
