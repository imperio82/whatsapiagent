import { prisma } from "@shared/infrastructure/prisma/client";
import { isLidJid, jidLocalPart } from "@shared/domain/wa-jid";
import type { AITool } from "../domain/ports/ai-provider";

/**
 * Tools que la IA puede invocar durante una conversación. Se construyen
 * por tenant para que cada llamada esté aislada al negocio correcto.
 *
 * IMPORTANTE: las tools NUNCA confían en input del modelo para tenantId
 * — siempre se cierra sobre el tenantId del contexto.
 */

export interface ToolContext {
  conversationId: string;
  /** clientId conocido de la conversación (puede ser null en casos borde). */
  clientId: string | null;
  /** JID completo del chat, para derivar el cliente si hiciera falta. */
  waChatId: string;
}

/**
 * Deriva el `Client.phone` a partir del JID, igual que el ingest:
 * - `@lid` → `lid:<localPart>` (no es teléfono real)
 * - estándar → solo dígitos
 */
function phoneFromJid(waChatId: string): string {
  const local = jidLocalPart(waChatId);
  return isLidJid(waChatId) ? `lid:${local}` : local.replace(/\D/g, "");
}

/**
 * Garantiza que la conversación tenga un Client asociado y devuelve su id.
 * Si la conversación quedó sin `clientId` (caso borde), crea/asocia un
 * cliente derivado del número de WhatsApp. Idempotente por (tenantId, phone).
 */
async function ensureClientId(tenantId: string, ctx: ToolContext): Promise<string | null> {
  if (ctx.clientId) return ctx.clientId;

  const phone = phoneFromJid(ctx.waChatId);
  if (!phone) return null;

  const client = await prisma.client.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    update: {},
    create: {
      tenantId,
      phone,
      name: `Cliente ${phone.slice(-4)}`,
      source: "whatsapp",
    },
  });

  // Re-vinculamos la conversación si había quedado huérfana.
  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: { clientId: client.id },
  });

  return client.id;
}

export function buildTools(tenantId: string, ctx: ToolContext): AITool[] {
  return [
    {
      name: "search_products",
      description:
        "Busca productos del catálogo del negocio por nombre. Devuelve precios, stock y descripción. Usalo siempre antes de cotizar.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Texto a buscar en nombre o SKU. Vacío trae los productos más recientes.",
          },
          limit: { type: "number", description: "Máximo de resultados (default 5)" },
        },
        required: [],
        additionalProperties: false,
      },
      async execute(args) {
        const query = typeof args.query === "string" ? args.query : "";
        const limit = typeof args.limit === "number" ? Math.min(args.limit, 10) : 5;
        const products = await prisma.product.findMany({
          where: {
            tenantId,
            status: "ACTIVE",
            ...(query
              ? {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { sku: { contains: query, mode: "insensitive" } },
                    { description: { contains: query, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          take: limit,
          orderBy: query ? undefined : { updatedAt: "desc" },
        });

        return JSON.stringify(
          products.map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            priceMajor: p.priceCents / 100,
            currency: p.currency,
            stock: p.trackInventory ? p.stock : "ilimitado",
            description: p.description,
          })),
        );
      },
    },

    {
      name: "get_business_info",
      description:
        "Obtiene información del negocio: nombre, rubro, dirección, descripción. Usalo si el cliente pregunta a qué se dedica el negocio, dónde está, etc.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      async execute() {
        const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!t) return JSON.stringify({ error: "negocio no encontrado" });
        return JSON.stringify({
          name: t.name,
          industry: t.industry,
          address: t.address,
          description: t.description,
        });
      },
    },

    {
      name: "create_pending_order",
      description:
        "Crea un pedido en estado PENDING_PAYMENT cuando el cliente confirma que quiere comprar. Solo invocar cuando el cliente confirmó explícitamente productos y cantidades. NO inventes productos: usá los IDs devueltos por search_products.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Items del pedido",
            items: {
              type: "object",
              properties: {
                productId: { type: "string" },
                quantity: { type: "number" },
              },
              required: ["productId", "quantity"],
              additionalProperties: false,
            },
          },
          notes: { type: "string", description: "Notas opcionales del pedido" },
        },
        required: ["items"],
        additionalProperties: false,
      },
      async execute(args) {
        const items = (args.items ?? []) as Array<{ productId: string; quantity: number }>;
        if (items.length === 0) return JSON.stringify({ error: "items vacíos" });

        // 2.1 — aseguramos un cliente aunque la conversación no tuviera clientId.
        const clientId = await ensureClientId(tenantId, ctx);
        if (!clientId) {
          return JSON.stringify({
            error: "no se pudo asociar un cliente a la conversación. Pedile su número de WhatsApp.",
          });
        }

        const products = await prisma.product.findMany({
          where: { tenantId, id: { in: items.map((i) => i.productId) } },
        });
        const lookup = new Map(products.map((p) => [p.id, p]));

        // 2.2 — validamos ANTES de crear: productos reales y stock suficiente.
        const unknownIds = items.filter((i) => !lookup.has(i.productId)).map((i) => i.productId);
        if (unknownIds.length > 0) {
          return JSON.stringify({
            error: "producto_inexistente",
            detalle: `Estos IDs no están en el catálogo: ${unknownIds.join(", ")}. Usá search_products para obtener IDs válidos. NO inventes productos.`,
          });
        }

        const insufficient: Array<{ name: string; pedido: number; disponible: number }> = [];
        let totalCents = 0;
        const orderItems = items.map((i) => {
          const p = lookup.get(i.productId)!;
          const qty = Math.max(1, Math.floor(i.quantity));
          if (p.trackInventory && p.stock < qty) {
            insufficient.push({ name: p.name, pedido: qty, disponible: p.stock });
          }
          totalCents += p.priceCents * qty;
          return {
            productId: p.id,
            productNameSnap: p.name,
            unitPriceCents: p.priceCents,
            quantity: qty,
          };
        });

        if (insufficient.length > 0) {
          return JSON.stringify({
            error: "stock_insuficiente",
            detalle: insufficient,
            mensaje:
              "No hay stock suficiente para algunos productos. Avisale al cliente las cantidades disponibles; no crees el pedido.",
          });
        }

        const count = await prisma.order.count({ where: { tenantId } });
        const code = `ORD-${String(count + 1).padStart(4, "0")}`;

        const order = await prisma.order.create({
          data: {
            tenantId,
            clientId,
            code,
            status: "PENDING_PAYMENT",
            totalCents,
            currency: products[0]?.currency ?? "GTQ",
            notes: typeof args.notes === "string" ? args.notes : null,
            items: { create: orderItems },
          },
        });

        return JSON.stringify({
          ok: true,
          orderCode: order.code,
          totalMajor: totalCents / 100,
          currency: order.currency,
        });
      },
    },
  ];
}
