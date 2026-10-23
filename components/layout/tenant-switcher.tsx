"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Check, ChevronsUpDown, MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu";

interface TenantOption {
  id: string;
  name: string;
}

/**
 * Cambia el negocio activo de la sesión. Recarga la página completa para que todas las
 * consultas (React Query) y el menú se vuelvan a pedir con el negocio nuevo.
 */
export function TenantSwitcher({
  tenants,
  activeTenantId,
  tenantName,
}: {
  tenants: TenantOption[];
  activeTenantId?: string;
  tenantName: string;
}) {
  const { update } = useSession();
  const [switching, setSwitching] = useState(false);

  async function select(id: string) {
    if (id === activeTenantId) return;
    setSwitching(true);
    await update({ activeTenantId: id });
    window.location.href = "/";
  }

  const header = (
    <>
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-wa text-wa-foreground">
        <MessageSquare className="h-4 w-4" strokeWidth={2.5} />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-semibold">{switching ? "Cambiando…" : tenantName}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">whatsAppia</div>
      </div>
    </>
  );

  if (tenants.length <= 1) {
    return <div className="flex h-14 items-center gap-2 border-b border-border px-4">{header}</div>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-14 w-full items-center gap-2 border-b border-border px-4 transition-colors hover:bg-accent/50"
          aria-label="Cambiar de negocio"
        >
          {header}
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Tus negocios</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => select(t.id)} disabled={switching}>
            <span className="flex-1 truncate">{t.name}</span>
            {t.id === activeTenantId && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
