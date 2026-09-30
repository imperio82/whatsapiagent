"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, Save } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useMessagingAccount, useSaveTwilioAccount } from "@hooks/use-whatsapp";

/**
 * Configuración de WhatsApp vía Twilio (sandbox o número de producción).
 * Las credenciales se guardan por tenant en la tabla WhatsappAccount.
 */
export function TwilioConfigCard(): React.ReactElement {
  const { data: account, isLoading } = useMessagingAccount();
  const save = useSaveTwilioAccount();

  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [fromNumber, setFromNumber] = useState("");

  // Prellenamos con lo que ya esté guardado (el token nunca vuelve del backend).
  useEffect(() => {
    if (!account) return;
    setAccountSid(account.twilioAccountSid ?? "");
    setFromNumber(account.displayPhoneNumber ?? "");
  }, [account]);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/whatsapp/twilio/webhook`
      : "/api/v1/whatsapp/twilio/webhook";

  const connected = account?.verified && account.provider === "twilio";
  const canSave =
    accountSid.trim().length >= 10 &&
    authToken.trim().length >= 10 &&
    fromNumber.trim().length >= 8 &&
    !save.isPending;

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    save.mutate({
      twilioAccountSid: accountSid.trim(),
      twilioAuthToken: authToken.trim(),
      displayPhoneNumber: fromNumber.trim(),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
          </div>
        ) : (
          <>
            {connected && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Conectado a Twilio · número +{account?.displayPhoneNumber}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="twilio-sid">Account SID</Label>
                <Input
                  id="twilio-sid"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={accountSid}
                  onChange={(e) => setAccountSid(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="twilio-token">Auth Token</Label>
                <Input
                  id="twilio-token"
                  type="password"
                  placeholder={account?.hasAuthToken ? "•••••••• (guardado)" : "Tu Auth Token de Twilio"}
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  autoComplete="off"
                />
                {account?.hasAuthToken && (
                  <p className="text-xs text-muted-foreground">
                    Ya hay un token guardado. Escribilo de nuevo solo si querés reemplazarlo.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="twilio-from">Número de WhatsApp (From)</Label>
                <Input
                  id="twilio-from"
                  placeholder="+14155238886 (sandbox)"
                  value={fromNumber}
                  onChange={(e) => setFromNumber(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  En el sandbox de Twilio es <strong>+1 415 523 8886</strong>. En producción, tu
                  número aprobado.
                </p>
              </div>

              {save.isError && (
                <p className="text-sm text-destructive">
                  No se pudo guardar. Revisá las credenciales e intentá de nuevo.
                </p>
              )}
              {save.isSuccess && (
                <p className="text-sm text-emerald-600">Configuración guardada.</p>
              )}

              <Button type="submit" disabled={!canSave}>
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar credenciales
              </Button>
            </form>

            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">URL del webhook entrante</span>
                <Badge variant="secondary">Twilio Console</Badge>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">
                  {webhookUrl}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void navigator.clipboard?.writeText(webhookUrl)}
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pegá esta URL en Twilio → WhatsApp Sandbox Settings → &quot;When a message comes
                in&quot; (método POST).
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
