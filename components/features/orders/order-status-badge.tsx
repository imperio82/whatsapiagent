import { Badge } from "@components/ui/badge";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@modules/orders/domain/order-status";

const VARIANT: Record<OrderStatus, "warning" | "success" | "wa" | "secondary" | "destructive"> = {
  PENDING_PAYMENT: "warning",
  PAID: "success",
  AWAITING_DISPATCH: "wa",
  DISPATCHED: "wa",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

export function OrderStatusBadge({ status }: { status: string }): React.ReactElement {
  const s = status as OrderStatus;
  return <Badge variant={VARIANT[s] ?? "secondary"}>{ORDER_STATUS_LABELS[s] ?? status}</Badge>;
}
