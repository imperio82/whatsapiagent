import { z } from "zod";

export const listOrdersSchema = z.object({
  status: z
    .enum(["PENDING_PAYMENT", "PAID", "AWAITING_DISPATCH", "DISPATCHED", "COMPLETED", "CANCELLED"])
    .optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(30),
});
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;

export const updateStatusSchema = z.object({
  status: z.enum([
    "PENDING_PAYMENT",
    "PAID",
    "AWAITING_DISPATCH",
    "DISPATCHED",
    "COMPLETED",
    "CANCELLED",
  ]),
  scheduledDeliveryAt: z.string().datetime().optional().nullable(),
  paymentProofUrl: z.string().url().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export interface OrderListItemDto {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  status: string;
  totalCents: number;
  totalMajor: number;
  currency: string;
  itemsCount: number;
  createdAt: string;
}

export interface OrderDetailDto {
  id: string;
  code: string;
  client: { id: string; name: string; phone: string };
  status: string;
  totalCents: number;
  totalMajor: number;
  currency: string;
  paymentProofUrl: string | null;
  paidAt: string | null;
  scheduledDeliveryAt: string | null;
  dispatchedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    productNameSnap: string;
    quantity: number;
    unitPriceCents: number;
    unitPriceMajor: number;
  }>;
}
