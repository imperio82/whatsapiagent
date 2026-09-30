import { z } from "zod";

export const TEMPLATE_CATEGORIES = [
  "WELCOME",
  "ORDER_CONFIRMATION",
  "PAYMENT_REMINDER",
  "DISPATCH",
  "RECOVERY",
  "CUSTOM",
] as const;
export type TemplateCategoryValue = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategoryValue, string> = {
  WELCOME: "Bienvenida",
  ORDER_CONFIRMATION: "Confirmación de pedido",
  PAYMENT_REMINDER: "Recordatorio de pago",
  DISPATCH: "Despacho",
  RECOVERY: "Recuperación",
  CUSTOM: "Personalizada",
};

const slugRe = /^[a-z][a-z0-9_-]{1,40}$/;

export const upsertTemplateSchema = z.object({
  key: z.string().regex(slugRe, "Solo minúsculas, números, guión y guión bajo"),
  name: z.string().min(2).max(80),
  body: z.string().min(1).max(4096),
  category: z.enum(TEMPLATE_CATEGORIES).default("CUSTOM"),
  isActive: z.boolean().default(true),
});
export type UpsertTemplateInput = z.infer<typeof upsertTemplateSchema>;

export interface TemplateDto {
  id: string;
  key: string;
  name: string;
  body: string;
  category: TemplateCategoryValue;
  variables: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Extrae las variables {{xxx}} del cuerpo. */
export function extractVariables(body: string): string[] {
  const re = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
  const set = new Set<string>();
  for (const m of body.matchAll(re)) set.add(m[1]!);
  return Array.from(set);
}
