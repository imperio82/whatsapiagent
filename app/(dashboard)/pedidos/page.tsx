"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { OrderDetailDrawer } from "@components/features/orders/order-detail-drawer";
import { OrderStatusBadge } from "@components/features/orders/order-status-badge";
import { useOrders } from "@hooks/use-orders";
import { formatCurrency } from "@lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@lib/utils";

const STATUS_FILTERS = [
  { value: undefined, label: "Todos" },
  { value: "PENDING_PAYMENT" as const, label: "Pendientes de pago" },
  { value: "PAID" as const, label: "Pagados" },
  { value: "AWAITING_DISPATCH" as const, label: "Por despachar" },
  { value: "DISPATCHED" as const, label: "Despachados" },
  { value: "COMPLETED" as const, label: "Completados" },
];

export default function OrdersPage(): React.ReactElement {
  const [status, setStatus] = useState<typeof STATUS_FILTERS[number]["value"]>(undefined);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading } = useOrders({ status, search: search || undefined });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Generados desde WhatsApp por la IA o manualmente por el equipo.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.label}
            variant={status === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </Button>
        ))}
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, cliente o teléfono…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : (data?.items.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No hay pedidos en este filtro.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5 text-right">Items</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.items.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-accent/30",
                    selectedId === o.id && "bg-accent/50",
                  )}
                >
                  <td className="px-4 py-2.5 font-mono text-xs">{o.code}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="font-medium">{o.clientName}</span>
                      <span className="text-xs text-muted-foreground">+{o.clientPhone}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{o.itemsCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatCurrency(o.totalMajor, o.currency)}
                  </td>
                  <td className="px-4 py-2.5">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {format(new Date(o.createdAt), "dd MMM HH:mm", { locale: es })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <OrderDetailDrawer orderId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
