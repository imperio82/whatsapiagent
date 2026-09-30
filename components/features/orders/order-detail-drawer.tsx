"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, CheckCircle2, Package, Truck, Wallet, XCircle } from "lucide-react";
import { Button } from "@components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import { Separator } from "@components/ui/separator";
import { OrderStatusBadge } from "./order-status-badge";
import { useOrder, useUpdateOrder } from "@hooks/use-orders";
import { formatCurrency } from "@lib/utils";
import type { OrderStatus } from "@modules/orders/domain/order-status";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";

interface Props {
  orderId: string | null;
  onClose: () => void;
}

const NEXT_ACTIONS: Record<OrderStatus, Array<{ to: OrderStatus; label: string; icon: typeof Wallet }>> = {
  PENDING_PAYMENT: [
    { to: "PAID", label: "Marcar como pagado", icon: Wallet },
    { to: "CANCELLED", label: "Cancelar", icon: XCircle },
  ],
  PAID: [
    { to: "AWAITING_DISPATCH", label: "Pasar a despacho", icon: Package },
    { to: "CANCELLED", label: "Cancelar", icon: XCircle },
  ],
  AWAITING_DISPATCH: [
    { to: "DISPATCHED", label: "Marcar despachado", icon: Truck },
    { to: "CANCELLED", label: "Cancelar", icon: XCircle },
  ],
  DISPATCHED: [{ to: "COMPLETED", label: "Marcar completado", icon: CheckCircle2 }],
  COMPLETED: [],
  CANCELLED: [],
};

export function OrderDetailDrawer({ orderId, onClose }: Props): React.ReactElement {
  const { data: order } = useOrder(orderId);
  const update = useUpdateOrder(orderId);

  const status = order?.status as OrderStatus | undefined;
  const actions = status ? NEXT_ACTIONS[status] : [];

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {order ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <DialogTitle>{order.code}</DialogTitle>
                <OrderStatusBadge status={order.status} />
              </div>
              <DialogDescription>
                Creado {format(new Date(order.createdAt), "PPp", { locale: es })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cliente
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-medium">{order.client.name}</span>
                  <span className="text-sm text-muted-foreground">{clientPhoneToDisplay(order.client.phone)}</span>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Productos
                </div>
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2 text-right">Cant.</th>
                        <th className="px-3 py-2 text-right">Unitario</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {order.items.map((i) => (
                        <tr key={i.id}>
                          <td className="px-3 py-2">{i.productNameSnap}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{i.quantity}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(i.unitPriceMajor, order.currency)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(i.unitPriceMajor * i.quantity, order.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-border bg-muted/20">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right text-sm font-semibold">
                          Total
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
                          {formatCurrency(order.totalMajor, order.currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {order.notes && (
                <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                  <div className="text-[10px] font-semibold uppercase tracking-wider">Notas</div>
                  <div className="mt-1">{order.notes}</div>
                </div>
              )}

              <Separator />

              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Acciones
                </div>
                {actions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Este pedido ya está cerrado.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {actions.map((a) => {
                      const Icon = a.icon;
                      const isCancel = a.to === "CANCELLED";
                      return (
                        <Button
                          key={a.to}
                          size="sm"
                          variant={isCancel ? "outline" : "default"}
                          onClick={() => update.mutate({ status: a.to })}
                          disabled={update.isPending}
                        >
                          <Icon className="h-3.5 w-3.5" /> {a.label}
                          {!isCancel && <ArrowRight className="h-3 w-3" />}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
