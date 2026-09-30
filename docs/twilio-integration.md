# Integración de WhatsApp vía Twilio

Twilio se añadió como **tercer proveedor** de WhatsApp, junto a Baileys (dev) y Meta Cloud API. Sigue el mismo patrón adapter, por lo que el resto del sistema (casos de uso, IA, conversaciones, UI de chat) funciona sin cambios.

Se activa con la env var:

```env
WHATSAPP_PROVIDER="twilio"
```

## Decisiones de diseño

- **Credenciales por tenant** (no globales): cada negocio guarda su `Account SID`, `Auth Token` y número `From` en la tabla `WhatsappAccount` (`provider="twilio"`). Esto mantiene el multi-tenant real.
- **Sandbox o producción:** el código es idéntico; solo cambia el número `From` (en sandbox es `+14155238886`).
- **Resolución de tenant** en el webhook: por el número destino (`To`) contra `WhatsappAccount.displayPhoneNumber` (guardado normalizado a solo dígitos).

## Archivos

### Dominio / Infraestructura

| Archivo | Rol |
|---------|-----|
| `src/modules/whatsapp/domain/ports/whatsapp-provider.ts` | Se añadió `"twilio"` al tipo `kind`. |
| `src/modules/whatsapp/infrastructure/twilio/twilio-provider.ts` | **Adapter `TwilioProvider`**: envía vía REST (`Messages.json`, Basic Auth) y despacha inbound con `pushInbound`. |
| `src/modules/whatsapp/infrastructure/provider-factory.ts` | `WHATSAPP_PROVIDER=twilio` → `TwilioProvider`. |

### Rutas API

| Ruta | Método | Descripción |
|------|--------|-------------|
| `app/api/v1/whatsapp/twilio/webhook/route.ts` | `POST` | Webhook entrante de Twilio (form-encoded). Resuelve tenant por `To`, valida firma (opcional), entra al pipeline común (ingest + IA). |
| `app/api/v1/whatsapp/account/route.ts` | `GET` / `PATCH` | Lee / guarda credenciales de Twilio por tenant (sin exponer el token). |

### Frontend

| Archivo | Rol |
|---------|-----|
| `components/features/whatsapp/twilio-config-card.tsx` | Formulario (Account SID, Auth Token, número From) + URL del webhook para copiar. |
| `app/(dashboard)/configuracion/whatsapp/page.tsx` | Renderiza la tarjeta de Twilio cuando `provider === "twilio"`. |
| `services/whatsapp.service.ts` | `getAccount()`, `saveTwilioAccount()`. |
| `hooks/use-whatsapp.ts` | `useMessagingAccount()`, `useSaveTwilioAccount()`. |

### Base de datos

`WhatsappAccount` se extendió (migración `prisma/migrations/20260612000000_twilio_support`):

```prisma
model WhatsappAccount {
  // ...
  provider           String   @default("meta")  // "meta" | "twilio"
  displayPhoneNumber String                      // número del negocio (solo dígitos)

  // Meta (ahora opcionales)
  phoneNumberId      String?
  businessAccountId  String?
  accessTokenEnc     String?
  webhookVerifyToken String?

  // Twilio
  twilioAccountSid   String?
  twilioAuthTokenEnc String?
  verified           Boolean  @default(false)
}
```

## Variables de entorno

```env
# Proveedor activo
WHATSAPP_PROVIDER="twilio"

# Las credenciales NO van en .env: se guardan por tenant desde la UI.
# Estas vars solo controlan la validación de firma del webhook:
TWILIO_VALIDATE_SIGNATURE="false"   # true en producción
TWILIO_WEBHOOK_URL=""               # opcional: fuerza la URL exacta que firmó Twilio (si hay proxy/CDN)
```

## Flujos

### Envío (outbound)

```
SendMessageUseCase → getWhatsAppProvider() → TwilioProvider.sendText()
  → POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
     From=whatsapp:+<displayPhoneNumber>  To=whatsapp:+<to>  Body=<texto>
  → devuelve { providerMessageId: <MessageSid>, sentAt }
```

### Recepción (inbound)

```
Twilio → POST /api/v1/whatsapp/twilio/webhook  (x-www-form-urlencoded)
  → resuelve tenant por To (displayPhoneNumber)
  → (opcional) valida X-Twilio-Signature (HMAC-SHA1 con el Auth Token del tenant)
  → TwilioProvider.pushInbound(InboundMessage)
  → pipeline común: IngestInboundMessage → RespondToMessage (IA)
  → responde 200 con TwiML vacío
```

> El número del cliente se normaliza quitando `whatsapp:+`, dejándolo en E.164 sin `+` (consistente con Meta), para que `Conversation.waChatId` y el resto del dominio no cambien.

## Validación de firma

- `X-Twilio-Signature` = `base64( HMAC-SHA1( authToken, URL + params_ordenados ) )`.
- Se valida **solo si** `TWILIO_VALIDATE_SIGNATURE="true"`. En el sandbox se suele dejar en `false` mientras se prueba con ngrok.
- La URL pública se reconstruye desde los headers `x-forwarded-proto` / `x-forwarded-host`, o se fuerza con `TWILIO_WEBHOOK_URL`.

## Cómo probar con el Sandbox

1. `.env`: `WHATSAPP_PROVIDER="twilio"` y `TWILIO_VALIDATE_SIGNATURE="false"`.
2. Exponé tu local (ngrok). En **Twilio Console → WhatsApp Sandbox Settings → "When a message comes in"** pegá `https://TU-URL/api/v1/whatsapp/twilio/webhook` (POST). La UI muestra y copia esa URL.
3. En **Configuración → WhatsApp** guardá Account SID, Auth Token y número From (`+14155238886`).
4. Desde tu teléfono enviá el `join <palabra>` del sandbox y luego un mensaje: debería aparecer la conversación y responder la IA si está activa.

## Pendientes / hardening

- Cifrar `twilioAuthTokenEnc` y `accessTokenEnc` en reposo (hoy texto plano).
- Aplicar la migración `20260612000000_twilio_support` con `prisma migrate deploy` (ver [migrations.md](./migrations.md)).
