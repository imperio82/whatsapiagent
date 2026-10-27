# Variables de entorno pendientes

Variables que usa el código y que todavía **no están en tu `.env`** (revisado el 25 de octubre de 2026). Cópialas al `.env`
local y a las variables de Railway para producción. Nunca escribas claves reales en este archivo ni en `.env.example`.

Tu configuración actual: `WHATSAPP_PROVIDER="meta"` y `AI_PROVIDER="gemini"`. Ya tienen valor `DATABASE_URL`,
`AUTH_SECRET`, `GEMINI_API_KEY`, `SECRETS_ENCRYPTION_KEY`, `WHATSAPP_APP_SECRET` y `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

## Resumen

| Variable | ¿Obligatoria? | Para qué sirve |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Para Google Calendar y Sheets | Conectar el calendario para agendar visitas y sincronizar hojas |
| `ELEVENLABS_API_KEY` | Opcional | Voces premium y clonación de voz |
| `ELEVENLABS_MODEL` | Opcional | Modelo de voz de ElevenLabs |
| `ELEVENLABS_USD_PER_1K_CHARS` | Opcional | Precio para calcular el consumo de voz |
| `GEMINI_TTS_MODEL` | Recomendada | Modelo de Gemini que genera las respuestas con voz |
| `GEMINI_TTS_FALLBACK_MODEL` | Recomendada | Modelo de voz de respaldo si el principal falla o se queda sin cupo |
| `GEMINI_TRANSCRIBE_MODEL` | Recomendada | Modelo que transcribe las notas de voz de los clientes |
| `GEMINI_GRAPH_MODEL` | Opcional | Modelo del agente multiagente que responde por WhatsApp |
| `AI_ENGINE` | Opcional | Motor de respuesta: `graph` o `simple` |
| `AI_REPLY_DELAY_MS` | Opcional | Espera por defecto antes de responder |
| `SCHEDULER_DISABLED` | Opcional | Apagar las tareas programadas |
| `ALLOW_PRIVATE_DATA_SOURCES` | Opcional | Permitir bases de datos externas en redes privadas |
| `TWILIO_VALIDATE_SIGNATURE` / `TWILIO_WEBHOOK_URL` | Solo con Twilio | Validar la firma del webhook de Twilio |
| `BAILEYS_LOG_LEVEL` | Solo con Baileys | Cantidad de logs de Baileys |

Las variables "opcionales" tienen un valor por defecto en el código: si no las pones, la app funciona igual.

## Para copiar al `.env`

```env
# Google (Calendar para agendar visitas y Sheets para sincronizar datos). Guía: docs/INTEGRACION-GOOGLE.md
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Voz del agente
GEMINI_TTS_MODEL="gemini-3.8-flash-lite-tts"
GEMINI_TTS_FALLBACK_MODEL="gemini-3.8-flash-tts"
GEMINI_TRANSCRIBE_MODEL="gemini-flash-lite-latest"
ELEVENLABS_API_KEY=
ELEVENLABS_MODEL="eleven_flash_v2_5"
ELEVENLABS_USD_PER_1K_CHARS=0.04

# Agente de IA
GEMINI_GRAPH_MODEL="gemini-flash-lite-latest"
AI_ENGINE="graph"
AI_REPLY_DELAY_MS="6000"

# Tareas programadas y fuentes de datos
SCHEDULER_DISABLED=false
ALLOW_PRIVATE_DATA_SOURCES=false
```

## Detalle de cada variable

### Google: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`
- **Para qué:** son las credenciales OAuth de la plataforma. Con ellas los negocios conectan su cuenta de Google desde
  Configuración → Integraciones. Así el agente agenda visitas en **Google Calendar** y se sincronizan datos con **Google Sheets**.
- **Sin ellas:** la integración con Google sale desactivada, salvo que un negocio cargue sus propias credenciales.
- **Dónde se obtienen:** Google Cloud Console → APIs y servicios → Credenciales → *ID de cliente de OAuth* (tipo
  aplicación web). Activa las APIs de Calendar y Sheets. El paso a paso y las URL de redirección están en
  [INTEGRACION-GOOGLE.md](INTEGRACION-GOOGLE.md).

### Voz: `GEMINI_TTS_MODEL`, `GEMINI_TTS_FALLBACK_MODEL` y `GEMINI_TRANSCRIBE_MODEL`
- **Para qué:** usan tu `GEMINI_API_KEY`, que ya está configurada. `GEMINI_TRANSCRIBE_MODEL` convierte en texto las notas de
  voz de los clientes para que el agente las entienda. `GEMINI_TTS_MODEL` genera las respuestas en audio con las voces
  incluidas. `GEMINI_TTS_FALLBACK_MODEL` entra cuando el modelo principal falla o se acaba el cupo, que en el plan gratuito
  de Gemini es de pocos audios al día.
- **Sin ellas:** se usan los mismos valores por defecto del bloque de arriba.

### Voz premium: `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL` y `ELEVENLABS_USD_PER_1K_CHARS`
- **Para qué:** activan las voces de ElevenLabs y la **clonación de voz** en Administración → Voz del agente. La cuenta es
  de la plataforma y cada negocio solo ve sus voces clonadas. `ELEVENLABS_USD_PER_1K_CHARS` es el precio por cada 1.000
  caracteres; sirve para descontar el consumo del presupuesto de IA del negocio.
- **Sin ellas:** solo aparecen las voces de Gemini.
- **Dónde se obtiene:** en elevenlabs.io → Profile → API Keys.

### Agente: `GEMINI_GRAPH_MODEL`, `AI_ENGINE` y `AI_REPLY_DELAY_MS`
- `GEMINI_GRAPH_MODEL`: el modelo que usa el agente multiagente (router, especialistas y verificador). Por defecto es
  `gemini-flash-lite-latest`, que es rápido y barato. **Si se elige un modelo en `/plataforma` → *Modelo del agente*,
  manda ese** y esta variable (u `OPENAI_MODEL` con `AI_PROVIDER="openai"`) solo se usa si no hay ninguno elegido ahí.
- `AI_ENGINE`: con `graph` (por defecto) responden varios especialistas y un verificador. Con `simple` responde un solo
  agente, más barato pero menos preciso.
- `AI_REPLY_DELAY_MS`: los milisegundos que el agente espera sin mensajes nuevos antes de responder (por defecto `6000`).
  Cada negocio puede cambiarlo en Configuración → IA → *Tiempo de espera antes de responder*. Esta variable solo se usa si
  el negocio no eligió un valor.

### Tareas: `SCHEDULER_DISABLED` y `ALLOW_PRIVATE_DATA_SOURCES`
- `SCHEDULER_DISABLED=true` apaga las tareas automáticas: felicitaciones de cumpleaños y fechas especiales, y la
  sincronización de fuentes de datos. Úsalo, por ejemplo, para que una copia local no mande mensajes reales.
- `ALLOW_PRIVATE_DATA_SOURCES=true` permite conectar bases de datos externas que estén en una red privada (`10.x`,
  `192.168.x`, `localhost`). En producción déjalo en `false` por seguridad.

### Solo si cambias de proveedor de WhatsApp
- **Twilio** (`WHATSAPP_PROVIDER=twilio`): `TWILIO_VALIDATE_SIGNATURE="true"` valida que los mensajes del webhook vengan
  realmente de Twilio, y se recomienda en producción. `TWILIO_WEBHOOK_URL` solo hace falta si hay un proxy o CDN delante;
  en ese caso pon la URL pública exacta del webhook.
- **Baileys** (`WHATSAPP_PROVIDER=baileys`): `BAILEYS_LOG_LEVEL` (`warn` por defecto; `debug` para ver más detalle).

## Variables que no hace falta llenar

- `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` y `WHATSAPP_ACCESS_TOKEN` están vacías en tu `.env`, y está
  bien. Las credenciales de Meta se guardan **por negocio** en Configuración → WhatsApp, cifradas con
  `SECRETS_ENCRYPTION_KEY`.
- `OPENAI_API_KEY` está vacía. Como usas `AI_PROVIDER="gemini"`, no es necesaria. Solo hace falta si cambias a OpenAI.
- `NEXTAUTH_SECRET` es el nombre antiguo de `AUTH_SECRET`, que ya está configurada.

## En Railway (producción)

Además de lo anterior, revisa que en producción estén:
- `AUTH_URL` y `NEXT_PUBLIC_APP_URL` con el dominio real (no `localhost`).
- `NODE_ENV="production"`.
- `PLATFORM_ADMIN_EMAILS` con tu correo, para entrar a `/plataforma`.
- `TWILIO_VALIDATE_SIGNATURE="true"` si algún día usas Twilio.
