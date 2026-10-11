# Integración de WhatsApp vía Meta Cloud API

Meta es el proveedor de producción, junto a Baileys (dev) y Twilio. Usa el mismo patrón adapter, así que los casos de uso, la IA y el chat funcionan sin cambios.

```env
WHATSAPP_PROVIDER="meta"
WHATSAPP_WEBHOOK_VERIFY_TOKEN="un-texto-que-inventes"
WHATSAPP_APP_SECRET="App Secret de tu app"
SECRETS_ENCRYPTION_KEY="32 bytes en base64"
```

## Decisiones de diseño

- **Credenciales por tenant:** el Phone Number ID y el token se guardan en `WhatsappAccount` (`provider="meta"`) desde Configuración → WhatsApp, no en `.env`.
- **Se prueban antes de guardar:** el backend consulta el número en el Graph API (`GET /{phone_number_id}`). Si Meta rechaza el token, no se guarda y se muestra el error de Meta. El número visible se toma de esa respuesta.
- **Tokens cifrados en reposo** con AES-256-GCM (`src/shared/infrastructure/crypto/secret-box.ts`). Aplica también al Auth Token de Twilio. Los tokens viejos en texto plano siguen funcionando y se cifran al volver a guardarlos.
- **Estado real:** el provider cachea el estado por tenant y lo recalcula desde la base al consultar `/api/v1/whatsapp/state`, así no se pierde al reiniciar el servidor.
- **Webhook firmado:** cada POST de Meta se valida con HMAC-SHA256 (`x-hub-signature-256`) usando `WHATSAPP_APP_SECRET`. Sin esa variable, el webhook rechaza todo.

## Archivos

| Archivo | Rol |
|---|---|
| `src/modules/whatsapp/infrastructure/meta/meta-cloud-provider.ts` | Adapter `MetaCloudProvider` y `verifyMetaCredentials()` |
| `app/api/v1/whatsapp/webhook/route.ts` | Handshake (GET) y mensajes entrantes (POST) |
| `app/api/v1/whatsapp/account/route.ts` | Guarda credenciales de Meta (`provider: "meta"`) o de Twilio |
| `components/features/whatsapp/meta-config-card.tsx` | Formulario y URL del webhook para copiar |
| `src/shared/infrastructure/crypto/secret-box.ts` | Cifrado de tokens |

## Configuración en Meta (modo prueba)

1. **Portafolio:** business.facebook.com → crear portafolio comercial.
2. **App:** developers.facebook.com → Mis apps → Crear app → tipo **Empresa** → vincular al portafolio.
3. **WhatsApp:** Agregar productos → WhatsApp → Configurar. Meta da un número de prueba, un token temporal (24 h), el **Phone Number ID** y el **WhatsApp Business Account ID**.
4. **Destinatarios:** en Configuración de la API, agregar hasta 5 números que pueden escribir al número de prueba. Cada uno recibe un código.
5. **App Secret:** Configuración de la app → Básica → App Secret → va en `WHATSAPP_APP_SECRET`.
6. **Exponer el servidor local:** `npx cloudflared tunnel --url http://localhost:3000` (o ngrok) y copiar la URL pública.
7. **Webhook:** WhatsApp → Configuración → Webhook → URL `https://<url-publica>/api/v1/whatsapp/webhook`, token de verificación = `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Luego suscribirse al campo **messages**.
8. **Credenciales en whatsAppia:** Configuración → WhatsApp → pegar Phone Number ID y token → **Probar y guardar**.
9. **Token permanente:** Meta Business → Usuarios del sistema → crear (administrador) → Generar token con `whatsapp_business_messaging` y `whatsapp_business_management`. Guardarlo igual que en el paso 8.

## Límites del modo prueba

- Solo los números agregados como destinatarios pueden escribir y recibir.
- El agente responde libre durante 24 horas desde el último mensaje del cliente. Para escribir primero hace falta una plantilla aprobada (en prueba solo existe `hello_world`).
- Para atender clientes reales hay que verificar el negocio y registrar un número propio (no puede estar en uso en la app de WhatsApp).
