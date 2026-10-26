# Atiendo IA

CRM multi-tenant para vender por WhatsApp. Gestiona pedidos, leads y conversaciones con IA, basado en el flujo del Diagrama1.

## Stack

- **Next.js 15** (App Router) monolito con **TypeScript estricto**
- **API estilo NestJS** dentro de `app/api/v1/**` — los route handlers delegan a controllers
- **Clean Architecture** por módulo: `domain → application → infrastructure → interface`
- **Prisma + PostgreSQL** con multi-tenant por `tenantId`
- **NextAuth v5** (JWT) con RBAC granular
- **shadcn/ui + Tailwind v4** — diseño inspirado en Linear / Vercel / Intercom
- **WhatsApp via adapter pattern**: Baileys en desarrollo (gratis, QR con número personal), Meta Cloud API en producción
- **OpenAI GPT** (pendiente de integrar para la IA del chat)

## Arranque rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno
cp .env.example .env
# editar .env y poner DATABASE_URL apuntando a tu Postgres local

# 3. Crear esquema + correr seed (permisos, roles, demo tenant)
npm run prisma:migrate -- --name init
npm run db:seed

# 4. Levantar
npm run dev
```

Login demo: `demo@whatsappia.app` / `demo1234`

## WhatsApp en desarrollo (Baileys)

`WHATSAPP_PROVIDER=baileys` (default en `.env.example`). Para vincular tu número:

1. Levantá la app con `npm run dev`
2. Entrá al dashboard y andá a **Configuración → WhatsApp** (`/configuracion/whatsapp`)
3. Aparece un QR — escanealo con WhatsApp del celular:
   _Configuración → Dispositivos vinculados → Vincular un dispositivo_
4. **Usá un número descartable**, no el de tu negocio real. Baileys es un cliente no oficial
   y existe riesgo (bajo pero no nulo) de que Meta banee el número.
5. Las credenciales se guardan en `.whatsapp-sessions/<tenantId>/` y la sesión reconecta
   automáticamente cuando reinicies el server.

Cuando estés listo para producción, cambiá `WHATSAPP_PROVIDER=meta`, configurá las variables
de Meta en `.env` y exponé `/api/v1/whatsapp/webhook` por HTTPS hacia Meta.

## WhatsApp en producción (Meta Cloud API)

1. Crear cuenta Meta Business + WABA + número
2. Configurar webhook apuntando a `https://tu-dominio/api/v1/whatsapp/webhook`
   con el `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
3. Set `WHATSAPP_APP_SECRET` para validar firma HMAC `X-Hub-Signature-256`
4. Poblar `WhatsappAccount` con el `phoneNumberId`, `accessToken` y `businessAccountId`
   del tenant (UI de configuración pendiente)

## Estructura

```
app/                          → Next.js (UI + route handlers finos)
  (auth)/login, /register
  (dashboard)/page, /productos, …
  api/auth/[...nextauth]      → NextAuth handlers
  api/v1/<modulo>/…           → endpoints REST que delegan al controller

src/modules/<modulo>/         → cada módulo es un bounded context
  domain/                       entidades, value objects, puertos (interfaces)
  application/                  use cases, DTOs (zod), mappers
  infrastructure/               adapters concretos (Prisma repos, providers)
  interface/                    controllers HTTP

src/shared/                   → infra compartida
  domain/errors                 errores tipados (ValidationError, NotFoundError…)
  application/tenant-context    AsyncLocalStorage con tenantId+permisos
  application/authorize         guard de permisos
  interface/http                helpers de respuesta y middleware
  infrastructure/prisma         cliente singleton

components/
  ui/                           shadcn (button, dialog, dropdown…)
  features/                     componentes de negocio por módulo
  layout/                       sidebar, topbar

hooks/                        → react-query + lógica reusable
services/                     → cliente HTTP tipado al API interno
lib/utils.ts                  → cn(), formatCurrency(), formatDate()
prisma/schema.prisma          → modelo completo (multi-tenant + RBAC)
prisma/seed.ts                → permisos, roles del sistema, tenant demo
```

## Decisiones clave

### Multi-tenant por `tenantId` (no schema-per-tenant)

Cada entidad de negocio incluye `tenantId`. El middleware HTTP resuelve el tenant
activo desde el token JWT y lo deja en `TenantContext` (AsyncLocalStorage).
Los casos de uso leen el contexto y los repositorios filtran por `tenantId`
automáticamente. Esto facilita migrar a Supabase + RLS más adelante.

### RBAC

- `Permission` (ej: `products.create`) → `Role` → `Membership` → `User`
- Roles del sistema (no editables): `owner`, `admin`, `agent`, `viewer`
- Cada tenant puede crear roles personalizados
- El guard `authorize("products.create")` se llama desde casos de uso

### Patrón de módulo (referencia: `src/modules/products`)

```ts
// 1. Domain — sin dependencias externas
class Product {
  static create(input): Product { ... }
  rename(name: string): void { ... }
}

// 2. Application — orquesta dominio + repositorios (puertos)
class CreateProductUseCase {
  constructor(private repo: ProductRepository) {}
  async execute(input): Promise<ProductDto> {
    authorize("products.create");
    const product = Product.create(...);
    return toProductDto(await this.repo.save(product));
  }
}

// 3. Infrastructure — adapter concreto
class PrismaProductRepository implements ProductRepository { ... }

// 4. Interface — valida con zod y delega
class ProductsController {
  async create(body: unknown) {
    const input = createProductSchema.parse(body);
    return this.createUC.execute(input);
  }
}
```

### Frontend separa responsabilidades

- `services/products.service.ts` — cliente HTTP tipado, no React
- `hooks/use-products.ts` — wraps react-query, react-only
- `components/features/products/*` — UI/UX
- Componentes nunca hacen `fetch` directo, ni hooks tocan `fetch`

## Inspiración de diseño

- **Linear** — sidebar denso, tipografía clara, tablas con filas finas
- **Vercel Dashboard** — cards minimalistas, métricas con jerarquía
- **Intercom / Respond.io** — 3 columnas para chats (lista | conversación | cliente)
- **Pipedrive** — kanban para pipeline de leads (próxima fase)
- **WhatsApp green** (`--wa`) usado solo como acento sobre base neutra zinc

## Pendiente (próximas fases)

- [ ] Módulos Orders, Clients, Leads, Chats end-to-end
- [ ] Webhook de WhatsApp Cloud API (`/api/v1/whatsapp/webhook`) con verificación HMAC
- [ ] Cliente OpenAI con function calling para consultar catálogo
- [ ] UI de conversaciones 3-columnas
- [ ] Pipeline kanban de leads
- [ ] Dashboard real con datos
- [ ] Invitación de usuarios a un tenant
- [ ] Plantillas de mensajes con variables
- [ ] Almacenamiento de tokens de WhatsApp cifrado en reposo
