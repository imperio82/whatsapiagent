"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, Loader2, Power, QrCode, RefreshCcw, XCircle } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import {
  useConnectWhatsapp,
  useDisconnectWhatsapp,
  useWhatsappStatus,
} from "@hooks/use-whatsapp";
import { MetaConfigCard } from "@components/features/whatsapp/meta-config-card";
import { TwilioConfigCard } from "@components/features/whatsapp/twilio-config-card";

export default function WhatsAppConfigPage(): React.ReactElement {
  const { data, isLoading } = useWhatsappStatus(2500);
  const connect = useConnectWhatsapp();
  const disconnect = useDisconnectWhatsapp();

  const provider = data?.provider ?? "baileys";
  const state = data?.state;

  // Auto-conectar UNA SOLA VEZ al entrar. El backend ya reintenta solo —
  // no queremos bombardear el endpoint desde el front.
  const triedConnect = useRef(false);
  useEffect(() => {
    if (triedConnect.current) return;
    if (provider === "baileys" && state?.kind === "disconnected" && !connect.isPending) {
      triedConnect.current = true;
      connect.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, state?.kind]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Vinculá tu número para recibir y responder mensajes desde whatsAppia.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={provider === "baileys" ? "secondary" : "wa"}>
          Proveedor: {providerLabel(provider)}
        </Badge>
        {provider === "baileys" && (
          <span className="text-xs text-muted-foreground">
            Usá un número de prueba — no el de tu negocio real.
          </span>
        )}
      </div>

      {provider === "twilio" ? (
        <TwilioConfigCard />
      ) : provider === "meta" ? (
        <MetaConfigCard />
      ) : (
      <Card>
        <CardContent className="p-6">
          {isLoading || !state ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando estado…
            </div>
          ) : state.kind === "connected" ? (
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-500/15 p-2 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">Conectado</div>
                  <div className="text-sm text-muted-foreground">
                    Número: +{state.phoneNumber} · desde{" "}
                    {new Date(state.connectedAt).toLocaleString("es-GT")}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                Desvincular
              </Button>
            </div>
          ) : state.kind === "qr" ? (
            <div className="flex flex-col items-center gap-4 md:flex-row md:items-start md:gap-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.qrPng}
                alt="QR de vinculación"
                className="h-64 w-64 rounded-lg border border-border bg-white p-2"
              />
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-wa" />
                  <span className="text-sm font-semibold">Escaneá este QR</span>
                </div>
                <ol className="ml-4 list-decimal space-y-1 text-sm text-muted-foreground">
                  <li>Abrí WhatsApp en tu celular.</li>
                  <li>
                    Andá a <strong>Configuración → Dispositivos vinculados</strong>.
                  </li>
                  <li>
                    Tocá <strong>Vincular un dispositivo</strong> y apuntá la cámara al QR.
                  </li>
                </ol>
                <div className="text-xs text-muted-foreground">
                  El QR se renueva automáticamente. Si vence antes de escanear, esperá unos segundos.
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => connect.mutate()}
                  disabled={connect.isPending}
                >
                  <RefreshCcw className="h-3.5 w-3.5" /> Regenerar QR
                </Button>
              </div>
            </div>
          ) : state.kind === "connecting" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Iniciando conexión…
            </div>
          ) : state.kind === "error" ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-destructive/15 p-2 text-destructive">
                  <XCircle className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">Sesión cerrada</div>
                  <div className="text-sm text-muted-foreground">{state.reason}</div>
                </div>
              </div>
              <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Volver a vincular
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                No hay sesión activa. Vinculá tu número para empezar.
              </div>
              <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Vincular WhatsApp
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}

function providerLabel(provider: "baileys" | "meta" | "twilio"): string {
  if (provider === "meta") return "Meta Cloud API (producción)";
  if (provider === "twilio") return "Twilio (WhatsApp)";
  return "Baileys (desarrollo)";
}
