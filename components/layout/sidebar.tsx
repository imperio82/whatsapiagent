"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
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

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Operación",
    items: [
      { href: "/", label: "Resumen", icon: LayoutDashboard },
      { href: "/chats", label: "Conversaciones", icon: MessageSquare },
      { href: "/pedidos", label: "Pedidos", icon: Receipt },
    ],
  },
  {
    section: "CRM",
    items: [
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/leads", label: "Leads", icon: Sparkles, badge: "IA" },
    ],
  },
  {
    section: "Catálogo",
    items: [
      { href: "/productos", label: "Productos", icon: Boxes },
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
      { href: "/configuracion/equipo", label: "Equipo", icon: Users },
      { href: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

export function Sidebar({ tenantName }: { tenantName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-wa text-wa-foreground">
          <MessageSquare className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{tenantName}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            whatsAppia
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {NAV.map((group) => (
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
