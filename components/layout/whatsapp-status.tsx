"use client";

import Link from "next/link";
import { CheckCircle2, Loader2, QrCode, XCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@components/ui/popover";
import { useWhatsappStatus } from "@hooks/use-whatsapp";
import { cn } from "@lib/utils";

export function WhatsAppStatus(): React.ReactElement {
  const { data } = useWhatsappStatus(5000);
  const state = data?.state;

  const dotColor =
    state?.kind === "connected"
      ? "bg-emerald-500"
      : state?.kind === "qr" || state?.kind === "connecting"
        ? "bg-amber-500 animate-pulse"
        : "bg-zinc-400";

  const label =
    state?.kind === "connected"
      ? "Conectado"
      : state?.kind === "qr"
        ? "Esperando QR"
        : state?.kind === "connecting"
          ? "Conectando…"
          : state?.kind === "error"
            ? "Error"
            : "Desconectado";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
          aria-label="Estado de WhatsApp"
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
          <span className="font-medium">WhatsApp</span>
          <span className="text-muted-foreground">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end">
        {!state ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando…
          </div>
        ) : state.kind === "connected" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Conectado
            </div>
            <div className="text-xs text-muted-foreground">Número: +{state.phoneNumber}</div>
            <div className="text-xs text-muted-foreground">
              Desde {format(new Date(state.connectedAt), "PPp", { locale: es })}
            </div>
            <div className="text-xs text-muted-foreground">
              Proveedor: {data?.provider === "meta" ? "Meta Cloud API" : "Baileys (dev)"}
            </div>
            <Button asChild size="sm" variant="outline" className="mt-1 w-full">
              <Link href="/configuracion/whatsapp">Administrar</Link>
            </Button>
          </div>
        ) : state.kind === "qr" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <QrCode className="h-4 w-4 text-amber-500" /> Esperando QR
            </div>
            <p className="text-xs text-muted-foreground">
              Escanea el código desde la página de configuración para vincular tu número.
            </p>
            <Button asChild size="sm" className="mt-1 w-full" variant="wa">
              <Link href="/configuracion/whatsapp">Ver QR</Link>
            </Button>
          </div>
        ) : state.kind === "connecting" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Estableciendo conexión…
          </div>
        ) : state.kind === "error" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <XCircle className="h-4 w-4 text-destructive" /> Sesión cerrada
            </div>
            <p className="text-xs text-muted-foreground">{state.reason}</p>
            <Button asChild size="sm" variant="outline" className="mt-1 w-full">
              <Link href="/configuracion/whatsapp">Reintentar</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <XCircle className="h-4 w-4 text-zinc-400" /> Desconectado
            </div>
            <p className="text-xs text-muted-foreground">
              Vincula tu número de WhatsApp para recibir y enviar mensajes desde aquí.
            </p>
            <Button asChild size="sm" className="mt-1 w-full">
              <Link href="/configuracion/whatsapp">Vincular ahora</Link>
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
