"use client";

import Link from "next/link";
import { ArrowUpRight, MessageSquare, Package, ShoppingBag, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@components/ui/card";
import { OrderStatusBadge } from "@components/features/orders/order-status-badge";
import { useDashboardStats } from "@hooks/use-dashboard";
import { useCurrentTenant } from "@hooks/use-tenant";
import { formatCurrency } from "@lib/utils";

export default function DashboardHome(): React.ReactElement {
  const { data: tenant } = useCurrentTenant();
  const { data: stats, isLoading } = useDashboardStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hola {tenant?.name ? tenant.name.split(" ")[0] : ""} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Lo que pasa en tu negocio hoy.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ventas del día"
          value={
            stats
              ? formatCurrency(stats.salesTodayMajor, stats.currency)
              : "—"
          }
          icon={ShoppingBag}
          accent="text-emerald-500"
          loading={isLoading}
        />
        <StatCard
          label="Pedidos por gestionar"
          value={stats?.ordersUndispatched ?? "—"}
          icon={Package}
          accent="text-amber-500"
          href="/pedidos"
          loading={isLoading}
        />
        <StatCard
          label="Chats sin revisar"
          value={stats?.conversationsUnread ?? "—"}
          icon={MessageSquare}
          accent="text-blue-500"
          href="/chats"
          loading={isLoading}
        />
        <StatCard
          label="Leads activos"
          value={stats?.leadsActive ?? "—"}
          icon={Users}
          accent="text-violet-500"
          href="/leads"
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Pedidos recientes</div>
                <div className="text-xs text-muted-foreground">
                  Últimas órdenes generadas
                </div>
              </div>
              <Link
                href="/pedidos"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Ver todos <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            {isLoading ? (
              <SkeletonRows count={4} />
            ) : (stats?.recentOrders.length ?? 0) === 0 ? (
              <EmptyState text="Cuando se genere un pedido va a aparecer acá." />
            ) : (
              <div className="divide-y divide-border">
                {stats?.recentOrders.map((o) => (
                  <Link
                    key={o.id}
                    href="/pedidos"
                    className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-accent/30"
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-muted-foreground">{o.code}</span>
                      <span className="font-medium">{o.clientName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm tabular-nums">
                        {formatCurrency(o.totalMajor, o.currency)}
                      </span>
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Chats nuevos</div>
                <div className="text-xs text-muted-foreground">
                  Atendelos antes que se enfríen
                </div>
              </div>
              <Link
                href="/chats"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Abrir <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            {isLoading ? (
              <SkeletonRows count={4} />
            ) : (stats?.recentChats.length ?? 0) === 0 ? (
              <EmptyState text="Cuando llegue un mensaje vas a verlo acá." />
            ) : (
              <div className="divide-y divide-border">
                {stats?.recentChats.map((c) => (
                  <Link
                    key={c.id}
                    href="/chats"
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold">
                      {c.clientName
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.clientName}</span>
                        {c.unreadCount > 0 && (
                          <span className="shrink-0 rounded-full bg-wa px-1.5 text-[10px] font-semibold text-wa-foreground">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">
                          {c.preview || "Sin mensajes"}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {c.lastMessageAt
                            ? formatDistanceToNow(new Date(c.lastMessageAt), { locale: es })
                            : ""}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  href,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  href?: string;
  loading?: boolean;
}) {
  const inner = (
    <Card className="border-border/70 transition-colors hover:border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">
          {loading ? <span className="text-muted-foreground">—</span> : value}
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="px-4 py-3">
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted/60" />
          <div className="mt-2 h-2 w-1/3 animate-pulse rounded bg-muted/40" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-10 text-center text-xs text-muted-foreground">{text}</div>;
}
