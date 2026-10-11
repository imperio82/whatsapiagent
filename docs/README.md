# 📚 Documentación — whatsAppia

Documentación técnica de los cambios y módulos del proyecto.

## Índice

| Documento | Descripción |
|-----------|-------------|
| [twilio-integration.md](./twilio-integration.md) | Integración de WhatsApp vía **Twilio** (sandbox / producción) como tercer proveedor. |
| [meta-integration.md](./meta-integration.md) | Integración de WhatsApp vía **Meta Cloud API**: credenciales por tenant, tokens cifrados y pasos de configuración en Meta. |
| [ai-chatbot-fase2.md](./ai-chatbot-fase2.md) | Robustez del **chatbot con IA** (FASE 2): pedidos sin clientId, guardrails anti-alucinación, tracking de tokens/costo y fallback de errores. |
| [migrations.md](./migrations.md) | Estado de las migraciones de Prisma y el drift de la base de datos de desarrollo. |

## Contexto del proyecto

- **Stack:** Next.js (monolito, App Router) · Clean Architecture · Prisma + PostgreSQL · shadcn/ui · multi-tenant.
- **WhatsApp:** patrón adapter con proveedores intercambiables por env var `WHATSAPP_PROVIDER` → `baileys` (dev) · `meta` (Cloud API) · `twilio` (pre/producción).
- **IA:** patrón adapter por `AI_PROVIDER` → `openai` · `gemini`. Function calling con 3 tools (catálogo, info del negocio, crear pedido).

> Convención: el dominio depende de **puertos** (`src/modules/*/domain/ports`). Las implementaciones concretas viven en `infrastructure` y se eligen vía factory. Los casos de uso reciben los proveedores por inyección.
