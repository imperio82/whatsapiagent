"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Mail, Phone, StickyNote, ShoppingBag, UserPlus } from "lucide-react";
import { Button } from "@components/ui/button";
import { Separator } from "@components/ui/separator";
import { useConversation } from "@hooks/use-conversations";

interface Props {
  conversationId: string | null;
}

export function ClientPanel({ conversationId }: Props): React.ReactElement {
  const { data } = useConversation(conversationId);

  if (!conversationId || !data) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        Datos del cliente
      </div>
    );
  }

  const c = data.client;
  const initials = c.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col items-center gap-3 border-b border-border px-4 py-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-base font-semibold">
          {initials}
        </div>
        <div>
          <div className="font-semibold">{c.name}</div>
          <div className="text-xs text-muted-foreground">
            Cliente desde{" "}
            {c.createdAt ? format(new Date(c.createdAt), "MMM yyyy", { locale: es }) : "—"}
          </div>
        </div>
        <Button size="sm" variant="outline">
          <UserPlus className="h-3.5 w-3.5" /> Convertir en lead
        </Button>
      </div>

      <div className="space-y-4 p-4 text-sm">
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Contacto
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{c.label}</span>
          </div>
          {c.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{c.email}</span>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Notas
          </div>
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            {c.notes || (
              <span className="inline-flex items-center gap-1">
                <StickyNote className="h-3 w-3" /> Sin notas. Haz clic para agregar una.
              </span>
            )}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Historial
          </div>
          <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Sin pedidos todavía</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
