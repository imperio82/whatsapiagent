"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CalendarClock,
  Target,
  Car,
  ListChecks,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  ScrollText,
  Settings,
  Users,
  Receipt,
  PenSquare,
} from "lucide-react";
import { cn } from "@lib/utils";
import { useCurrentTenant } from "@hooks/use-tenant";
import { TenantSwitcher } from "./tenant-switcher";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

/** El menú cambia con el tipo de negocio: la tienda ve pedidos y productos; la intermediación, citas e inventario. */
const navFor = (brokerage: boolean): { section: string; items: NavItem[] }[] => [
  {
    section: "Operación",
    items: [
      { href: "/", label: "Resumen", icon: LayoutDashboard },
      { href: "/chats", label: "Conversaciones", icon: MessageSquare },
      ...(brokerage
        ? [
            { href: "/coincidencias", label: "Coincidencias", icon: Target },
            { href: "/citas", label: "Citas", icon: CalendarClock },
          ]
        : [{ href: "/pedidos", label: "Pedidos", icon: Receipt }]),
    ],
  },
  {
    section: "CRM",
    items: [
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/leads", label: brokerage ? "Compradores" : "Leads", icon: Sparkles, badge: "IA" },
    ],
  },
  {
    section: "Catálogo",
    items: [
      brokerage
        ? { href: "/inventario", label: "Inventario", icon: Car }
        : { href: "/productos", label: "Productos", icon: Boxes },
      { href: "/plantillas", label: "Plantillas", icon: PenSquare },
    ],
  },
  {
    section: "Análisis",
    items: [
      { href: "/reportes", label: "Reportes", icon: BarChart3 },
      { href: "/historial", label: "Historial", icon: ScrollText },
    ],
  },
  {
    section: "Administración",
    items: [
      { href: "/configuracion/whatsapp", label: "WhatsApp", icon: MessageSquare },
      { href: "/configuracion/ia", label: "IA", icon: Sparkles, badge: "Beta" },
      { href: "/configuracion/ia/reglas", label: "Reglas de la IA", icon: ListChecks },
      { href: "/configuracion/equipo", label: "Equipo", icon: Users },
      { href: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

export function Sidebar({
  tenantName,
  tenants,
  activeTenantId,
}: {
  tenantName: string;
  tenants: { id: string; name: string }[];
  activeTenantId?: string;
}) {
  const pathname = usePathname();
  const { data: tenant } = useCurrentTenant();
  const nav = navFor(tenant?.agentProfile === "BROKERAGE");

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <TenantSwitcher tenants={tenants} activeTenantId={activeTenantId} tenantName={tenantName} />

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {nav.map((group) => (
          <div key={group.section} className="mb-5">
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.section}
            </div>
            <ul className="space-y-px">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(`${item.href}/`));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 transition-colors",
                          active ? "text-foreground" : "text-muted-foreground",
                        )}
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className="rounded bg-wa/15 px-1.5 py-0.5 text-[10px] font-semibold text-wa">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="rounded-md bg-accent/40 p-3 text-xs">
          <div className="mb-1 font-medium">¿Necesitás ayuda?</div>
          <div className="text-muted-foreground">
            Configurá tu cuenta de WhatsApp Business en Ajustes.
          </div>
        </div>
      </div>
    </aside>
  );
}
