# Agente de IA de whatsAppia: LangGraph, contexto y memoria

> Fecha: 2026-10-09/10 · Commits: `b22f219` → `124fc34` → `d14de29` → `660e16b` → `75b7216`
> Resume el trabajo hecho para que el agente responda bien por WhatsApp, con varios agentes especialistas,
> verificación de datos y memoria del cliente. Sirve también como guion técnico para la demo de Meteor.

---

## 1. Diagnóstico inicial

La IA respondía, pero mal. Las causas encontradas:

| Problema | Efecto |
|---|---|
| Prompt en español de Argentina/Guatemala ("Sos", "Atendés"), moneda GTQ y teléfonos +502 | Sonaba extraño para clientes de Colombia |
| Solo conocía nombre, rubro, dirección y descripción del negocio | No sabía fecha, horario, envíos, medios de pago ni preguntas frecuentes |
| Búsqueda literal (`contains`) | "arroz de 500g" no encontraba "Arroz Diana 500 g": decía que no lo tenían |
| `create_pending_order` no descontaba stock y el código era `ORD-${count + 1}` | Dos pedidos podían llevarse las mismas unidades y repetir código |
| 20 errores de tipos | Ruido; no impedían `npm run dev` |
| 2 migraciones sin aplicar (una era `ai_usage_logs`) | El costo por conversación no se estaba guardando (fallaba en silencio) |
| El negocio conectado a WhatsApp ("mis cositas") no tenía productos | Sin catálogo, la IA no podía contestar |

## 2. Fase A — que conteste bien (`b22f219`)

- **Prompt en español de Colombia**, con fecha y hora de Colombia, nombre del cliente y la información del negocio.
- **Contexto del negocio configurable** en `/configuracion/ia`: horario, envíos, medios de pago y preguntas frecuentes
  (campos nuevos en `Tenant`: `businessHours`, `deliveryInfo`, `paymentInfo`, `faq`).
- **Búsqueda tolerante** (`src/modules/ai/domain/product-search.ts`): sin tildes, singular/plural, "500g" = "500 g";
  las palabras cortas (tallas M, XL) solo cuentan si coinciden exactas.
- **Pedido seguro**: reserva de stock en transacción con descuento condicional (`stock >= cantidad`) y consecutivo
  `PED-0001` por tenant (`Tenant.orderSeq`). Las cantidades inválidas se rechazan, no se corrigen en silencio.
- Moneda por defecto **COP**.
- **0 errores de tipos** (se corrigieron `withRequestContext`, la augmentación de JWT de Auth.js y un import sin uso).

## 3. Fase B — grafo multiagente con LangGraph (`124fc34`)

Sigue el patrón de los proyectos Asesor de Compras IA y Content Ops (`StateGraph`, herramientas, proveedor
intercambiable), pero con varios especialistas y un verificador.

```
Mensaje del cliente
  → router (salida estructurada)
       ├─ ventas  : search_products, get_business_info, save_client_info
       ├─ pedido  : search_products, create_pending_order, save_client_info
       ├─ info    : get_business_info, save_client_info
       └─ humano  : pasa a una persona
  → verificador (código fijo, sin IA)
       ├─ OK            → se envía por WhatsApp
       ├─ falla 1 vez   → vuelve al mismo especialista con la corrección
       └─ falla 2 veces → humano
```

Principio (el mismo de Meteor): **el agente razona y el flujo hace lo que no puede fallar**. La reserva de stock y
el consecutivo van en una transacción; el verificador revisa que cada precio y código de pedido de la respuesta venga
de una herramienta, de la información del negocio o de un pedido anterior del cliente. Acepta subtotales
(precio × cantidad).

**Pase a humano:** la conversación queda `PENDING_REVIEW` y la IA se pausa 2 horas (`Conversation.aiPausedUntil`),
porque la interfaz todavía no tiene un botón para devolverla a la IA.

**Trazabilidad:** cada turno guarda en `ai_usage_logs` la intención (`intent`), la traza (`trace`: nodo, herramienta,
argumentos, resultado, tiempos), los tokens y el costo estimado. En consola se ven líneas `[ai graph]`.

**Modelo:** `gemini-flash-lite-latest` por defecto. En pruebas, `gemini-flash-latest` tardó 20–44 s por llamada
(incluso para "hola") y flash-lite menos de 1 s; cada turno del grafo tarda 1–3 s.

## 4. Memoria del cliente (`75b7216`)

| Qué se recuerda | Dónde | Para qué |
|---|---|---|
| Mensajes de la conversación | `messages` (últimos 20) | Contexto inmediato |
| Nombre, ciudad, dirección, correo | Ficha `Client` (campo nuevo `city`) | No volver a preguntarlos |
| Preferencias (talla, color, para quién compra) | `Client.aiMemory`, con fecha por nota | Recomendar sin preguntar |
| Últimos 3 pedidos con estado | `orders` | Responder "¿ya despacharon mi pedido?" |
| Cuándo retoma la conversación | Aviso si pasan ≥ 6 h | No tratar mensajes viejos como recientes |

Regla tipo CRM: `save_client_info` **llena los campos vacíos y no sobrescribe lo que escribió una persona**; si el
cliente da un dato distinto, queda anotado en la memoria. Lógica pura en `src/modules/ai/domain/client-memory.ts`.

Errores encontrados y corregidos en esta fase:
- Si el verificador pedía reintentar, el pedido se creaba dos veces → ahora un pedido ya creado en el turno no se repite.
- El verificador rechazaba códigos de pedidos anteriores → ahora los acepta.
- Al agregar productos, el agente repetía los del pedido anterior → ahora crea un pedido adicional solo con lo nuevo.

## 5. Archivos

| Archivo | Qué hace |
|---|---|
| `src/modules/ai/infrastructure/graph/sales-graph.ts` | El grafo (router, especialistas, verificador, humano) |
| `src/modules/ai/infrastructure/graph/chat-model.ts` | Elige el modelo (Gemini u OpenAI) |
| `src/modules/ai/infrastructure/graph/lc-tools.ts` | Adapta las herramientas al formato de LangChain |
| `src/modules/ai/infrastructure/tools.ts` | Herramientas: `search_products`, `get_business_info`, `create_pending_order`, `save_client_info` |
| `src/modules/ai/infrastructure/system-prompt.ts` | Contexto del negocio, reglas comunes y prompt del motor simple |
| `src/modules/ai/domain/reply-verifier.ts` | Verificador de precios y códigos |
| `src/modules/ai/domain/product-search.ts` | Búsqueda tolerante |
| `src/modules/ai/domain/client-memory.ts` | Perfil del cliente, memoria y aviso de "retoma la conversación" |
| `src/modules/ai/application/respond-to-message.use-case.ts` | Orquesta la respuesta a cada mensaje de WhatsApp |
| `app/(dashboard)/configuracion/ia/page.tsx` | Pantalla para el contexto del negocio |
| `prisma/seed-demo-co.ts` | Datos de prueba de tienda de ropa |
| `scripts/probar-agente.ts` | Prueba del grafo en terminal, sin WhatsApp ni base |

Migraciones nuevas: `20261010000000_ai_business_context`, `20261010010000_agent_graph_trace`,
`20261010020000_client_memory`.

## 6. Configuración (`.env`)

```
AI_PROVIDER="gemini"                       # o "openai"
GEMINI_API_KEY="..."
GEMINI_GRAPH_MODEL="gemini-flash-lite-latest"
AI_ENGINE="graph"                          # "simple" = un solo agente con todas las herramientas
```

## 7. Datos de prueba y pruebas

```bash
npm run db:seed:demo                    # tienda de ropa en "mis-cositas" (stock vuelve al inicial)
npm run db:seed:demo -- --tenant=demo   # en otro negocio
npm run db:seed:demo -- --force         # sobrescribe también la información del negocio
npx tsx --env-file=.env scripts/probar-agente.ts            # conversación de ejemplo con traza
npx tsx --env-file=.env scripts/probar-agente.ts "hola" ... # tus propios mensajes
```

El seed crea 34 productos (camisetas S–XL, jeans de hombre 30–36 y de mujer 6–12, blusa, buzo, vestido, tenis 37–42,
medias y gorra; cada talla con su stock, algunas con 1 unidad a propósito), la información de la tienda (horario,
domicilio en Quinchía, envíos por Interrapidísimo, Nequi/Daviplata/Bancolombia, cambios en 8 días, apartados) y 3
clientes. Es idempotente y no borra nada.

Resultado de las pruebas (Gemini flash-lite, base local, herramientas reales):

| Cliente | Agente | Resultado |
|---|---|---|
| "¿Tienen jean de hombre talla 32?" | ventas | $89.900 ✅ |
| "¿Cuánto vale el envío a Pereira?" | info | $12.000–$18.000 por Interrapidísimo ✅ |
| "Mándame el jean y 2 camisetas negras M" | pedido | PED-0001 por $139.900 ✅ |
| "Agrégame 3 camisetas negras XL" | pedido | "Solo queda 1" ✅ |
| "Quiero hablar con una persona…" | humano | Pasa a una persona y pausa la IA ✅ |
| Vuelve 4 días después: "¿ya despacharon? quiero otra igual pero blanca" | pedido | Sabe nombre, dirección y talla M; PED-0001 pendiente de pago; crea PED-0002 ✅ |

## 8. Cuidados

- La base local `crm` **la comparte otro proyecto** (tablas `productos`, `usuarios`). **Nunca** `prisma migrate reset`.
  Aplicar cambios con `npx prisma migrate deploy` (las migraciones se generan con `prisma migrate diff`).
- No mostrar en demos `.env`, API keys ni datos reales de clientes.
- El repositorio no tiene remoto configurado: los commits solo están en este equipo.

## 9. Pendientes

- [ ] Probar por WhatsApp real (`npm run dev` + Baileys) y revisar las líneas `[ai graph]`.
- [ ] Mostrar `city` y `aiMemory` en la ficha del cliente en el panel.
- [ ] Botón "Devolver a la IA" en el chat (hoy la pausa vence sola a las 2 horas).
- [ ] Ver la traza de cada respuesta en la interfaz del chat.
- [ ] Llevar este agente a distrib-mvp (Fases 4 y 5 de su plan).
- [ ] Subir el repositorio a GitHub.
