import { z } from "zod";

export const LISTING_KINDS = ["VEHICLE", "PROPERTY", "OTHER"] as const;
export const LISTING_OPERATIONS = ["SALE", "RENT"] as const;
export const LISTING_STATUSES = ["PENDING_REVIEW", "AVAILABLE", "RESERVED", "SOLD", "ARCHIVED"] as const;

export type ListingKindValue = (typeof LISTING_KINDS)[number];
export type ListingOperationValue = (typeof LISTING_OPERATIONS)[number];
export type ListingStatusValue = (typeof LISTING_STATUSES)[number];

export const LISTING_KIND_LABELS: Record<ListingKindValue, string> = {
  VEHICLE: "Vehículo",
  PROPERTY: "Inmueble",
  OTHER: "Otro",
};

export const LISTING_OPERATION_LABELS: Record<ListingOperationValue, string> = {
  SALE: "Venta",
  RENT: "Arriendo",
};

export const LISTING_STATUS_LABELS: Record<ListingStatusValue, string> = {
  PENDING_REVIEW: "Por aprobar",
  AVAILABLE: "Disponible",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  ARCHIVED: "Archivado",
};

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const createListingSchema = z.object({
  kind: z.enum(LISTING_KINDS),
  operation: z.enum(LISTING_OPERATIONS).default("SALE"),
  title: z.string().trim().min(3).max(120),
  description: optionalText(3000),
  priceCop: z.number().int().min(0).max(100_000_000_000),
  city: z.string().trim().min(2).max(80),
  zone: optionalText(120),
  attributes: z.record(z.string().max(60), z.string().max(200)).optional(),
  photos: z.array(z.string().url().max(1000)).max(20).optional(),
  status: z.enum(LISTING_STATUSES).optional(),
  ownerName: optionalText(120),
  ownerPhone: optionalText(30),
  exactAddress: optionalText(200),
  privateNotes: optionalText(2000),
});
export type CreateListingInput = z.input<typeof createListingSchema>;

export const updateListingSchema = createListingSchema.partial();
export type UpdateListingInput = z.input<typeof updateListingSchema>;

export const listListingsSchema = z.object({
  search: z.string().trim().max(80).optional(),
  kind: z.enum(LISTING_KINDS).optional(),
  status: z.enum(LISTING_STATUSES).optional(),
});
export type ListListingsInput = z.infer<typeof listListingsSchema>;

export interface ListingDto {
  id: string;
  code: string;
  kind: ListingKindValue;
  operation: ListingOperationValue;
  title: string;
  description: string | null;
  priceCop: number;
  city: string;
  zone: string | null;
  attributes: Record<string, string>;
  photos: string[];
  status: ListingStatusValue;
  ownerName: string | null;
  ownerPhone: string | null;
  exactAddress: string | null;
  privateNotes: string | null;
  interestedCount: number;
  /** Coincidencias con compradores esperando aprobación del asesor. */
  pendingMatches: number;
  /** Solo al crear o actualizar: compradores nuevos que coinciden con el bien. */
  newMatches?: number;
  /** Solo al crear o actualizar: compradores a los que les falló una condición (otra ciudad, presupuesto…). */
  nearMatches?: { leadId: string; name: string; missed: string }[];
  createdAt: string;
  updatedAt: string;
}
