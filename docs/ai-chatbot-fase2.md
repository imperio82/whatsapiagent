# Chatbot con IA — FASE 2 (robustez)

Mejoras de robustez del agente de IA según la **FASE 2** de `PLAN-EJECUCION.md`. Quedan pendientes los evals (2.4) y los tests (FASE 3), que se hacen al final.

Resumen de los ítems entregados:

| Ítem | Qué | Estado |
|------|-----|--------|
| 2.1 | `create_pending_order` resuelve/crea el cliente si falta `clientId` | ✅ |
| 2.2 | Guardrails anti-alucinación (prompt + stock + temperatura) | ✅ |
| 2.3 | Tracking de tokens/costo por conversación | ✅ |
| 2.4 | Evals (LLM-as-judge) | ⏳ pendiente |
| 2.5 | Fallback cuando la IA falla | ✅ |
| — | Fix: `UpdateTenant` devuelve `aiAutoReply`/`aiAgentName` | ✅ |

---

## 2.1 — Pedidos sin `clientId`

**Archivo:** `src/modules/ai/infrastructure/tools.ts`

`buildTools` pasó de recibir `clientId: string | null` a recibir un **contexto de conversación**:

```ts
export interface ToolContext {
  conversationId: string;
  clientId: string | null;
  waChatId: string;
}
buildTools(tenantId: string, ctx: ToolContext): AITool[]
```

Nuevo helper `ensureClientId()`: si la conversación quedó sin cliente (caso borde), deriva el teléfono del JID (reusa `wa-jid.ts`), hace `upsert` del `Client` por `(tenantId, phone)` y re-vincula la conversación. Así `create_pending_order` ya no falla con `"no hay cliente asociado"`.

```ts
// @lid → "lid:<local>" (no es teléfono real) | estándar → solo dígitos
function phoneFromJid(waChatId: string): string { ... }
```

**Llamador actualizado:** `respond-to-message.use-case.ts`:

```ts
const tools = buildTools(tenantId, {
  conversationId: conversation.id,
  clientId: conversation.clientId,
  waChatId: conversation.waChatId,
});
```

## 2.2 — Guardrails anti-alucinación

**Validación en la tool** (`tools.ts`, `create_pending_order`): se valida **antes de crear** el pedido y se devuelven errores estructurados (la IA los relata, no inventa):

- `producto_inexistente` — algún `productId` no está en el catálogo del tenant.
- `stock_insuficiente` — productos con `trackInventory` y `stock < cantidad`; incluye `{ name, pedido, disponible }`.

**System prompt** (`src/modules/ai/infrastructure/system-prompt.ts`): reglas reforzadas:

- Nunca inventar productos/precios/stock; `search_products` siempre antes de cotizar.
- Solo precios EXACTOS del catálogo (sin redondear ni descuentos).
- Si la tool devuelve error, NO fabricar un código `ORD-XXXX`; explicar al cliente y ofrecer alternativa.

**Temperatura** bajada `0.4 → 0.2` en ambos providers (`openai-provider.ts`, `gemini-provider.ts`) para respuestas más deterministas.

## 2.3 — Tracking de tokens y costo

**Modelo nuevo** (`prisma/schema.prisma`, migración `20260612010000_ai_usage_log`):

```prisma
model AiUsageLog {
  id             String   @id @default(cuid())
  tenantId       String
  conversationId String
  provider       String   // "openai" | "gemini"
  model          String   // ej: gpt-4o-mini
  tokensIn       Int
  tokensOut      Int
  toolCalls      Int      @default(0)
  costMicroUsd   Int      @default(0) // costo estimado en millonésimas de USD
  createdAt      DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([conversationId])
  @@map("ai_usage_logs")
}
```

**Estimación de costo** (`src/modules/ai/infrastructure/pricing.ts`): tabla de precios por modelo (USD/1M tokens) → `estimateCostMicroUsd(model, tokensIn, tokensOut)`.

**Puerto:** `ChatTurnOutput` ahora incluye `model: string` (ambos providers lo devuelven), para costear con el modelo real.

**Persistencia:** `logUsage()` en `respond-to-message.use-case.ts` inserta un `AiUsageLog` por turno. **Está envuelto en try/catch**: si la tabla aún no existe (migración no aplicada), la IA sigue respondiendo y solo se omite el registro.

## 2.5 — Fallback cuando la IA falla

**Archivo:** `src/modules/ai/application/respond-to-message.use-case.ts`

Antes: si `ai.chat()` lanzaba, el error se propagaba y el cliente quedaba **en silencio**. Ahora:

```ts
try {
  result = await this.ai.chat({ ... });
} catch (err) {
  console.error("[ai respond] ⚠️ error de IA, enviando fallback:", err);
  await this.sendFallback(tenantId, conversation); // mensaje de respaldo + log
  return;
}
```

`sendFallback()` es tolerante a fallos (si el envío también falla, lo loguea sin romper el pipeline de inbound). Mensaje: _"Disculpá, tuve un problema procesando tu mensaje 🙏 Un agente humano te va a responder en un momento."_

## Fix menor — `UpdateTenant`

`src/modules/tenants/application/update-tenant.use-case.ts` ahora devuelve `aiAutoReply` y `aiAgentName` (antes los omitía, aunque `GetCurrentTenant` sí los devolvía).

---

## Flujo end-to-end (inbound → respuesta)

```
Webhook → IngestInboundMessage → RespondToMessageUseCase
  ├─ valida tenant.aiAutoReply
  ├─ (flujo LID: pide teléfono si el JID es @lid sin número real)
  ├─ buildSystemPrompt(tenant) + buildTools(tenant, ctx-conversación)
  ├─ ai.chat()  ── falla? → sendFallback() y return
  ├─ logUsage()  (tokens + costo estimado)   ← 2.3
  ├─ sendText() por WhatsApp
  └─ persiste Message (authoredBy="AI")
```

Tools disponibles para el modelo:
- `search_products` — catálogo del tenant (precio, stock, descripción).
- `get_business_info` — datos del negocio.
- `create_pending_order` — crea pedido `PENDING_PAYMENT`; valida cliente (2.1), productos y stock (2.2).

## Pendientes

- **2.4 Evals:** dataset de conversaciones + LLM-as-judge + script de % de acierto.
- **Aplicar migración** `20260612010000_ai_usage_log` con `prisma migrate deploy` (ver [migrations.md](./migrations.md)).
- Posibles siguientes: inyectar catálogo resumido en el prompt, manejo de imágenes/comprobantes, decremento de stock al crear pedido.
