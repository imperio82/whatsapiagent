import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string().min(7).max(20),
  email: z.string().email().nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.partial();
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const listClientsSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(30),
});
export type ListClientsInput = z.infer<typeof listClientsSchema>;

export interface ClientListItemDto {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  ordersCount: number;
  totalSpentCents: number;
  totalSpentMajor: number;
  lastInteractionAt: string | null;
  source: string | null;
  createdAt: string;
}

export interface ClientDetailDto extends ClientListItemDto {
  address: string | null;
  notes: string | null;
  updatedAt: string;
}
