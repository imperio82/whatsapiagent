# Lo implementado — octubre de 2026

Resumen de lo que se agregó a whatsAppia sobre la rama `feat/perfil-intermediacion` (después del merge a `main` en `03e0b1e`).
Para entrar a probarlo, ver [CREDENCIALES-PRUEBA.md](./CREDENCIALES-PRUEBA.md).

| # | Funcionalidad | Dónde se ve |
|---|---|---|
| 1 | Habilidades del agente (antes «Reglas de la IA») | Administración → Habilidades del agente |
| 2 | Guía de inicio rápido | Se abre sola la primera vez; botón «Guía» del encabezado |
| 3 | Simulador del agente | Administración → Simulador del agente |
| 4 | Planes, presupuesto de IA y contador de gasto | Encabezado (billetera) |
| 5 | Plataforma: clientes, cobros y costos | `/plataforma` (solo el dueño) |
| 6 | Landing con planes y precios | `/` sin sesión |
| 7 | Voz del agente | Administración → Voz del agente |

---

## 1. Habilidades del agente

- Lo que antes se llamaba «Reglas para la IA» ahora es **Habilidades del agente**: textos, botones y avisos.
- Ruta nueva: `/configuracion/ia/habilidades`; la vieja `/configuracion/ia/reglas` redirige.
- No cambió nada en la base de datos ni en el prompt (siguen siendo `ai_rules`).

## 2. Guía de inicio rápido

`components/layout/quick-start.tsx`. Una tarjeta abajo a la derecha que recorre:

1. Dónde llegan los mensajes (Conversaciones).
2. Dónde se agrega el inventario o los productos (según el tipo de negocio).
3. Dónde se ven los clientes (y Leads / Compradores).
4. Dónde se agregan las habilidades del agente y para qué sirve cada tipo.
5. Cierre: probar en el simulador.

Cada paso lleva a su página y resalta la opción en el menú. Se abre sola la primera vez (`localStorage`), recuerda el paso si
la página se recarga (`sessionStorage`) y se vuelve a abrir con el botón **Guía** o con «¿Primera vez aquí?» del menú.

## 3. Simulador del agente

`/configuracion/simulador`. Es un chat de WhatsApp de prueba que **usa todo lo real**: el mismo pipeline de entrada,
el grafo, las herramientas, la base de datos, el calendario y los avisos. Solo cambia la salida.

- Los chats de prueba usan el JID `<teléfono>@sim`. Un Proxy sobre el provider (`provider-factory.ts`) desvía `sendText`,
  `sendVoice` y `showTyping` de esos chats: no salen por WhatsApp.
- El mensaje entra por `simulateInbound()` (`provider-bootstrap.ts`) igual que uno de Meta o Baileys.
- Panel lateral «Qué hizo el agente»: router, herramientas con argumentos y resultado, verificación, voz, tokens y costo.
- Botón de **micrófono**: graba una nota de voz, la convierte a WAV en el navegador y entra como un audio de WhatsApp.
- La conversación aparece en Conversaciones marcada «simulador».

> ⚠️ Los pedidos, leads, citas y avisos que haga el agente se crean de verdad. En intermediación, `notifyOwner` sí manda
> WhatsApp real al número de avisos del negocio.

## 4. Planes, presupuesto de IA y contador de gasto

**Planes** (`src/modules/billing/domain/plans.ts`, la única fuente de precios: la usan la landing, el contador, la
plataforma y el freno del agente):

| Plan | Precio/mes | Clientes al mes | Usuarios | Presupuesto IA |
|---|---|---|---|---|
| Emprende | 129.000 COP | 500 | 1 | US$ 5 |
| Pro | 299.000 COP | 1.500 | 3 | US$ 15 |
| Negocio | 590.000 COP | 4.000 | 10 | US$ 40 |

- Anual: 12 meses por el precio de 10. Cliente adicional: 150 COP. Prueba gratis: 14 días (al registrarse).
- **Presupuesto del mes** = el del plan + los créditos que el administrador sume ese mes. Se reinicia cada mes.
- **Cuando se gasta, el agente deja de responder** (`aiBudgetExhausted` en `respond-to-message.use-case.ts`); los mensajes
  siguen llegando y los atiende el equipo. También deja de responder si el negocio está suspendido o cancelado.
- **Contador del encabezado** (`components/layout/usage-meter.tsx`): «US$ gastado / presupuesto» con barra (ámbar al 80 %,
  roja al 100 %). Al abrirlo: plan, clientes atendidos contra el cupo, chats activos, créditos y fecha de pago.
- Todo el uso de IA (respuestas, notas de voz y transcripciones) se registra en `ai_usage_logs`.

**Todavía no se limita en la app:** usuarios por plan, el tope de 100 productos de Emprende ni las funciones por plan
(solo se muestran en la landing). Pasarse del cupo de clientes solo se marca en rojo.

**Base de datos** — migración `20261024000000_billing`: `tenants.plan`, `tenants.paidUntil` y la tabla `billing_entries`
(pagos en COP con meses cubiertos, y créditos de IA en micro-USD).

## 5. Plataforma (solo el dueño)

`/plataforma` — módulo aparte (`src/modules/platform`), con su propio diseño y **sin enlace en el menú**.

- **Acceso:** hace falta `isPlatformAdmin = true` en la base de datos **y** que el correo esté en `PLATFORM_ADMIN_EMAILS`.
  Sin esa variable no entra nadie. A cualquier otro usuario la página y el API (`/api/v1/platform/*`) le responden **404**.
- Dar el acceso: `npm run admin:grant -- correo@dominio.com` (cerrar sesión y volver a entrar).
- **Totales del mes** (con selector de mes): negocios activos, ingreso mensual (activos y al día), pagos del mes, costo de IA
  en USD y COP, tokens de entrada y salida, margen estimado, chats activos y vencidos.
- **Por negocio:** plan y estado editables, pagado hasta, clientes contra el cupo, respuestas de IA y costo de cada una,
  tokens, costo IA contra presupuesto, voz, costo por cliente atendido, lo que paga a Meta (estimado) y margen.
- **Acciones:** registrar pago (1, 3, 6 o 12 meses; alarga la fecha pagada), agregar crédito de IA en USD, historial de cobros
  y **costos**: últimos 6 meses, por modelo y los 10 chats que más costaron.
- Meta estimado: 2,95 COP por mensaje después de los 1.000 gratis del mes por número (cobro de Meta desde el 1 de octubre de 2026).
- Margen: precio del plan (si está activo y al día) menos el costo de IA; Meta lo paga cada negocio.

## 6. Landing

`app/bienvenida/page.tsx`. Quien entra a `/` sin sesión la ve (rewrite en `middleware.ts`); con sesión sigue viendo su panel.
Tiene beneficios, cómo funciona, los 3 planes (precios tomados de `plans.ts`), prueba gratis, sin costo de implementación,
preguntas frecuentes y explicación del cobro de Meta.

## 7. Voz del agente

Módulo `src/modules/voice`. Página `/configuracion/ia/voz`.

### Qué puede configurar cada negocio
- **Entender las notas de voz** (encendido por defecto): se transcriben con Gemini y el agente las lee como «[Nota de voz] …».
  En el chat se ve el audio y lo que dijo el cliente.
- **Responder con voz:**
  - **Voz:** 30 voces de Gemini (con botón para escucharlas), o voces de ElevenLabs.
  - **Tono y acento** (Gemini): por ejemplo «cálido, cercano, con acento colombiano».
  - **Clonar voz** (ElevenLabs): de 1 a 5 audios de la persona y su autorización; hasta 3 por negocio. La cuenta de
    ElevenLabs es de la plataforma y cada negocio solo ve sus propias voces clonadas.
- **Cuándo responder con voz:** cuando el cliente manda un audio (recomendado), según reglas escritas por el negocio, o siempre.
- **Ajustes:** duración máxima, precios/enlaces/códigos también por texto, texto siempre debajo del audio, y qué
  especialistas pueden hablar.

### En el grafo

```
router ─┬─ especialista ─ verificador ─┬─ voz ─ END
        │                              ├─ (falla 1 vez) ─ especialista
        │                              └─ (falla 2 veces) ─ humano ─ END
        └─ humano ─ END
```

- El nodo **voz** decide con código fijo (`decideVoiceReply` en `voice-policy.ts`, con pruebas) si la respuesta ya verificada
  va por texto, como nota de voz o ambas.
- En el modo por reglas, el router evalúa las reglas de voz en la misma llamada en que clasifica el mensaje (campo `voz`).
- Si la voz falla, la respuesta sale por texto.

### Flujo
- **Entrada:** Meta manda el id del audio (`downloadMedia`); Baileys lo trae descargado. Se guarda en `voice_clips`, se
  transcribe y después responde el agente. El webhook no espera la transcripción.
- **Salida:** texto → voz (Gemini o ElevenLabs, PCM) → **OGG/Opus** (codificado con `opusscript`, sin ffmpeg; el contenedor
  OGG se arma a mano en `ogg-opus.ts`) → se sube a Meta y se envía como nota de voz (`voice: true`), o `ptt` en Baileys.
  Twilio sigue por texto (necesita una URL pública para el audio).
- El tono se pasa como «notas de dirección» separadas del texto: escrito delante del texto, Gemini a veces lo leía en voz alta.
- Si el modelo de voz principal se queda sin cupo o falla, se intenta con el de respaldo (`GEMINI_TTS_FALLBACK_MODEL`).

### Costos (aproximados, en `voice-pricing.ts`)
| Qué | Costo |
|---|---|
| Nota de voz de 30 s, Gemini `gemini-3.8-flash-lite-tts` | ~US$ 0,0045 (el precio sube al doble en 2027) |
| Nota de voz de 30 s, respaldo `gemini-3.8-flash-tts` | ~US$ 0,013 |
| Nota de voz de 30 s, ElevenLabs Flash v2.5 | ~US$ 0,018 |
| Transcribir un audio de un cliente | ~US$ 0,0001 |
| Respuesta de texto del agente (referencia) | ~US$ 0,0007 |

Todo entra al presupuesto del negocio (filas de `ai_usage_logs` con `intent = "voz"` o `"transcripcion"`).

**Base de datos** — migración `20261025000000_agent_voice`: `agent_voices`, `cloned_voices` y `voice_clips`.

### Pendiente de probar
- Envío real por WhatsApp (Meta y Baileys): solo se probó en el simulador.
- ElevenLabs y la clonación: no hay `ELEVENLABS_API_KEY` todavía.
- La clave de Gemini actual está en el **plan gratuito: 10 audios al día por modelo**. Para producción hay que activar la
  facturación en Google AI Studio.

---

## Variables de entorno nuevas

Explicadas en `.env.example`.

| Variable | Para qué |
|---|---|
| `PLATFORM_ADMIN_EMAILS` | Correos que pueden entrar a `/plataforma`, separados por coma |
| `USD_COP_RATE` | Pesos por dólar para mostrar costos en COP (por defecto 3185) |
| `GEMINI_TTS_MODEL` | Modelo de voz de Gemini (por defecto `gemini-3.8-flash-lite-tts`) |
| `GEMINI_TTS_FALLBACK_MODEL` | Modelo de voz de respaldo (por defecto `gemini-3.8-flash-tts`) |
| `GEMINI_TRANSCRIBE_MODEL` | Modelo que transcribe los audios (por defecto `gemini-flash-lite-latest`) |
| `ELEVENLABS_API_KEY` | Voces premium y clonación (opcional) |
| `ELEVENLABS_MODEL` | Modelo de ElevenLabs (por defecto `eleven_flash_v2_5`) |
| `ELEVENLABS_USD_PER_1K_CHARS` | Precio para el presupuesto (por defecto 0,04) |

## Migraciones y dependencias

- `20261024000000_billing` y `20261025000000_agent_voice`: se aplican con `npx prisma migrate deploy` (o al arrancar con
  `npm run start:prod`).
- Dependencia nueva: `opusscript` (codificador Opus en WASM), marcada como externa del servidor en `next.config.ts`.

## Pruebas

`npm test` — 56 pruebas. Nuevas: `voice-policy.test.ts` (cuándo usar voz, detección de precios y enlaces, texto para leer) y
`ogg-opus.test.ts` (OGG válido con CRC correcto y decodificable). `npx tsc --noEmit` sin errores.

## Pendientes conocidos

- Revisar `src/modules/ai/infrastructure/pricing.ts`: cobra `gemini-flash-lite-latest` a precios de Gemini 2.5 Flash-Lite;
  si «latest» ya apunta a 3.1 Flash-Lite, el costo real es 2,5 a 3 veces mayor que el mostrado.
- Limitar usuarios y productos por plan, y cobrar automáticamente los clientes por encima del cupo.
- En intermediación, desviar también `notifyOwner` en los chats del simulador.
