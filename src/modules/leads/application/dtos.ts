import { z } from "zod";

export const LEAD_STAGES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "READY_TO_BUY",
  "CUSTOMER",
  "LOST",
] as const;
export type LeadStageValue = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStageValue, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  INTERESTED: "Interesado",
  READY_TO_BUY: "Listo para comprar",
  CUSTOMER: "Cliente",
  LOST: "Perdido",
};

export const createLeadSchema = z.object({
  contactName: z.string().min(2).max(80),
  businessName: z.string().max(80).nullable().optional(),
  phone: z.string().min(7).max(20),
  address: z.string().max(200).nullable().optional(),
  industry: z.string().max(80).nullable().optional(),
  productInterest: z.string().max(200).nullable().optional(),
  reasonNotBought: z.string().max(500).nullable().optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema.partial().extend({
  stage: z.enum(LEAD_STAGES).optional(),
  // Qué busca (intermediación): con esto se cruza con el inventario nuevo
  searchKind: z.enum(["VEHICLE", "PROPERTY"]).nullable().optional(),
  searchOperation: z.enum(["SALE", "RENT"]).nullable().optional(),
  budgetMaxCop: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
  searchCity: z.string().trim().max(80).nullable().optional(),
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export interface LeadDto {
  id: string;
  contactName: string;
  businessName: string | null;
  phone: string;
  address: string | null;
  industry: string | null;
  productInterest: string | null;
  reasonNotBought: string | null;
  stage: LeadStageValue;
  source: string;
  lastContactAt: string | null;
  createdAt: string;
  openersCount: number;
  // Intermediación
  leadType: "BUYER" | "SELLER";
  temperature: "HOT" | "WARM" | "COLD" | null;
  qualification: Record<string, string>;
  aiSummary: string | null;
  offerCop: number | null;
  listing: { id: string; code: string; title: string; priceCop: number } | null;
  searchKind: "VEHICLE" | "PROPERTY" | "OTHER" | null;
  searchOperation: "SALE" | "RENT" | null;
  budgetMaxCop: number | null;
  searchCity: string | null;
}

export const LEAD_TEMPERATURE_LABELS = { HOT: "Caliente", WARM: "Tibio", COLD: "Frío" } as const;

export const QUALIFICATION_LABELS: Record<string, string> = {
  busca: "Busca",
  presupuesto: "Presupuesto",
  formaPago: "Forma de pago",
  partePago: "Parte de pago",
  zona: "Zona",
  plazo: "Para cuándo",
};
