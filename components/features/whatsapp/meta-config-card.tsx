"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, Save } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useMessagingAccount, useSaveMetaAccount } from "@hooks/use-whatsapp";

/**
 * Configuración de WhatsApp Cloud API (Meta).
 * Al guardar, el backend prueba las credenciales contra el Graph API y
 * guarda el token cifrado por tenant en la tabla WhatsappAccount.
 */
export function MetaConfigCard(): React.ReactElement {
  const { data: account, isLoading } = useMessagingAccount();
  const save = useSaveMetaAccount();

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  // Prellenamos con lo que ya esté guardado (el token nunca vuelve del backend).
  useEffect(() => {
    if (!account || account.provider !== "meta") return;
    setPhoneNumberId(account.phoneNumberId ?? "");
    setBusinessAccountId(account.businessAccountId ?? "");
  }, [account]);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/whatsapp/webhook`
      : "/api/v1/whatsapp/webhook";

  const connected = account?.verified && account.provider === "meta";
  const canSave =
    /^\d{5,}$/.test(phoneNumberId.trim()) && accessToken.trim().length >= 20 && !save.isPending;

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    save.mutate({
      phoneNumberId: phoneNumberId.trim(),
      businessAccountId: businessAccountId.trim() || undefined,
      accessToken: accessToken.trim(),
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
                Conectado a WhatsApp Cloud API · número +{account?.displayPhoneNumber}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="meta-phone-id">Phone Number ID</Label>
                <Input
                  id="meta-phone-id"
                  placeholder="123456789012345"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  En developers.facebook.com → tu app → WhatsApp → Configuración de la API.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="meta-waba-id">WhatsApp Business Account ID (opcional)</Label>
                <Input
                  id="meta-waba-id"
                  placeholder="123456789012345"
                  value={businessAccountId}
                  onChange={(e) => setBusinessAccountId(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="meta-token">Token de acceso</Label>
                <Input
                  id="meta-token"
                  type="password"
                  placeholder={
                    account?.hasAccessToken ? "•••••••• (guardado)" : "Token del usuario del sistema"
                  }
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  El token temporal dura 24 horas. Para que no venza, genera uno permanente con un
                  usuario del sistema en Meta Business. Se guarda cifrado.
                </p>
              </div>

              {save.isError && (
                <p className="text-sm text-destructive">
                  {save.error instanceof Error
                    ? save.error.message
                    : "No se pudo guardar. Revisa las credenciales e intenta de nuevo."}
                </p>
              )}
              {save.isSuccess && (
                <p className="text-sm text-emerald-600">
                  Meta aceptó las credenciales. Configuración guardada.
                </p>
              )}

              <Button type="submit" disabled={!canSave}>
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Probar y guardar
              </Button>
            </form>

            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">URL del webhook</span>
                <Badge variant="secondary">Meta for Developers</Badge>
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
                Pega esta URL en tu app → WhatsApp → Configuración → Webhook. Como token de
                verificación usa el valor de <code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> y suscríbete
                al campo <strong>messages</strong>.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
