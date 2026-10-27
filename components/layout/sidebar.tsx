"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  BarChart3,
  ChevronDown,
  Boxes,
  CalendarClock,
  BellRing,
  Database,
  Table2,
  FlaskConical,
  Plug,
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
  Rocket,
} from "lucide-react";
import { cn } from "@lib/utils";
import { useCurrentTenant } from "@hooks/use-tenant";
import { TenantSwitcher } from "./tenant-switcher";
import { useSidebarHidden } from "./sidebar-state";
import { openQuickStart, useQuickStartHref } from "./quick-start";

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
      { href: "/recordatorios", label: "Recordatorios", icon: BellRing },
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
      { href: "/colecciones", label: "Colecciones", icon: Table2, badge: "IA" },
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
      { href: "/configuracion/ia", label: "Mi agente", icon: Sparkles, badge: "Beta" },
      { href: "/configuracion/ia/habilidades", label: "Habilidades del agente", icon: ListChecks },
      { href: "/configuracion/ia/voz", label: "Voz del agente", icon: AudioLines },
      { href: "/configuracion/simulador", label: "Simulador del agente", icon: FlaskConical },
      { href: "/configuracion/integraciones", label: "Integraciones", icon: Plug },
      { href: "/configuracion/datos", label: "Fuentes de datos", icon: Database },
      { href: "/configuracion/equipo", label: "Equipo", icon: Users },
      { href: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

/** Secciones que el usuario dejó abiertas; se recuerdan entre visitas en este navegador. */
const OPEN_SECTIONS_KEY = "sidebar-open-sections";
/** Abiertas hasta que el usuario elija otras: las de conversaciones y productos/inventario. */
const DEFAULT_OPEN_SECTIONS = ["Operación", "Catálogo"];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function loadOpenSections(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_SECTIONS_KEY);
    if (raw === null) return DEFAULT_OPEN_SECTIONS;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : DEFAULT_OPEN_SECTIONS;
  } catch {
    return DEFAULT_OPEN_SECTIONS;
  }
}

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
  const hidden = useSidebarHidden();
  // La sección de la página actual siempre se abre
  const [open, setOpen] = useState<string[]>(DEFAULT_OPEN_SECTIONS);
  useEffect(() => setOpen(loadOpenSections()), []);
  const currentSection = nav.find((g) => g.items.some((i) => isActive(pathname, i.href)))?.section;
  // La guía de inicio rápido resalta la opción de la que está hablando y abre su sección
  const tourHref = useQuickStartHref();
  const tourSection = nav.find((g) => g.items.some((i) => i.href === tourHref))?.section;

  function toggle(section: string, isOpen: boolean) {
    const next = isOpen ? open.filter((s) => s !== section) : [...open, section];
    setOpen(next);
    try {
      localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify(next));
    } catch {
      // Sin almacenamiento (modo privado): igual funciona, solo no se recuerda
    }
  }

  return (
    <aside
      aria-hidden={hidden}
      inert={hidden}
      className={cn(
        "hidden shrink-0 overflow-hidden border-border bg-card transition-[width] duration-300 ease-in-out md:block",
        hidden ? "w-0" : "w-60 border-r",
      )}
    >
      <div className="flex h-full w-60 flex-col">
        <TenantSwitcher tenants={tenants} activeTenantId={activeTenantId} tenantName={tenantName} />

        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {nav.map((group) => {
            const isOpen =
              group.section === currentSection || group.section === tourSection || open.includes(group.section);
            const listId = `nav-${group.section}`;
            return (
              <div key={group.section} className="mb-2">
                <button
                  type="button"
                  onClick={() => toggle(group.section, isOpen)}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  {group.section}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen ? "" : "-rotate-90")} />
                </button>
                {isOpen && (
                  <ul id={listId} className="mb-2 space-y-px">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(pathname, item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={cn(
                              "group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                              active
                                ? "bg-accent text-accent-foreground font-medium"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                              item.href === tourHref && "animate-pulse ring-2 ring-wa",
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
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={openQuickStart}
            className="w-full rounded-md bg-accent/40 p-3 text-left text-xs transition-colors hover:bg-accent"
          >
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <Rocket className="h-3.5 w-3.5 text-wa" /> ¿Primera vez aquí?
            </div>
            <div className="text-muted-foreground">Abre la guía de inicio rápido y te mostramos dónde está todo.</div>
          </button>
        </div>
      </div>
    </aside>
  );
}
