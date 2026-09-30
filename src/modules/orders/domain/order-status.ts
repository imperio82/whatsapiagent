import { BusinessRuleError } from "@shared/domain/errors";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "AWAITING_DISPATCH"
  | "DISPATCHED"
  | "COMPLETED"
  | "CANCELLED";

/** Transiciones permitidas. Cualquier cambio fuera de esto lanza BusinessRuleError. */
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["AWAITING_DISPATCH", "CANCELLED"],
  AWAITING_DISPATCH: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) return;
  if (!ALLOWED[from].includes(to)) {
    throw new BusinessRuleError(`No se puede pasar de ${from} a ${to}`);
  }
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagado",
  AWAITING_DISPATCH: "Por despachar",
  DISPATCHED: "Despachado",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};
