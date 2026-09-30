import { z } from "zod";

export const createProductSchema = z.object({
  sku: z.string().min(1).max(40).optional().nullable(),
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().nullable(),
  priceMajor: z.number().nonnegative().max(1_000_000),
  currency: z.string().length(3).default("GTQ"),
  trackInventory: z.boolean().default(true),
  stock: z.number().int().min(0).default(0),
  imageUrl: z.string().url().optional().nullable(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().extend({
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListProductsInput = z.infer<typeof listProductsSchema>;

export interface ProductDto {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  priceMajor: number;
  currency: string;
  trackInventory: boolean;
  stock: number;
  imageUrl: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}
