import { prisma } from "@shared/infrastructure/prisma/client";
import { isLidJid, jidLocalPart } from "@shared/domain/wa-jid";
import type { AITool } from "../domain/ports/ai-provider";
import { rankProducts } from "../domain/product-search";
import { appendMemory, isGenericClientName } from "../domain/client-memory";
import { formatMonthDay, isValidMonthDay } from "@modules/clients/domain/special-dates";

/** Catálogo máximo que se revisa en memoria por búsqueda (pymes: cientos de productos). */
const MAX_CATALOG_SCAN = 1000;

class InsufficientStockError extends Error {
  constructor(readonly detalle: Array<{ name: string; pedido: number; disponible: number }>) {
    super("stock_insuficiente");
  }
}

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
export async function ensureClientId(tenantId: string, ctx: ToolContext): Promise<string | null> {
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
      name: "save_client_info",
      description:
        "Guarda en la ficha del cliente lo que te cuente: nombre, ciudad, dirección de entrega, correo y preferencias (talla, color, para quién compra). Úsala apenas te dé uno de esos datos, para no volver a preguntarlo en otra conversación.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre real del cliente" },
          city: { type: "string", description: "Ciudad o municipio" },
          address: { type: "string", description: "Dirección de entrega" },
          email: { type: "string", description: "Correo electrónico" },
          preference: { type: "string", description: "Preferencia o dato útil para próximas compras (ej: 'usa talla M en camisetas')" },
        },
        required: [],
        additionalProperties: false,
      },
      async execute(args) {
        const clientId = await ensureClientId(tenantId, ctx);
        if (!clientId) return JSON.stringify({ error: "no hay un cliente asociado a la conversación" });
        const client = await prisma.client.findFirst({ where: { id: clientId, tenantId } });
        if (!client) return JSON.stringify({ error: "cliente no encontrado" });

        const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
        const data: { name?: string; city?: string; address?: string; email?: string; aiMemory?: string } = {};
        const saved: string[] = [];
        let memory = client.aiMemory;

        // Como en un CRM: se llenan los campos vacíos; lo que ya escribió una persona no se sobrescribe,
        // pero si el cliente da un dato distinto queda anotado en la memoria.
        const fill = (field: "name" | "city" | "address" | "email", value: string | null, isEmpty: boolean, label: string) => {
          if (!value) return;
          if (isEmpty) {
            data[field] = value;
            saved.push(field);
          } else if ((client[field] ?? "").toLowerCase() !== value.toLowerCase()) {
            memory = appendMemory(memory, `${label} distinta a la de la ficha: ${value}`);
            saved.push(`${field} (anotada en memoria)`);
          }
        };
        fill("name", text(args.name), isGenericClientName(client.name), "Dio un nombre");
        fill("city", text(args.city), !client.city, "Mencionó una ciudad");
        fill("address", text(args.address), !client.address, "Mencionó una dirección");
        fill("email", text(args.email), !client.email, "Mencionó un correo");

        const preference = text(args.preference);
        if (preference) {
          memory = appendMemory(memory, preference);
          saved.push("preferencia");
        }
        if (memory !== client.aiMemory) data.aiMemory = memory ?? undefined;

        if (Object.keys(data).length > 0) await prisma.client.update({ where: { id: client.id }, data });
        return JSON.stringify({ ok: true, guardado: saved });
      },
    },

    {
      name: "save_special_date",
      description:
        "Guarda una fecha especial que el cliente mencione: su cumpleaños, el de alguien cercano (esposa, hijo, mamá…), un aniversario u otra fecha importante. El negocio la usa para felicitarlo. Úsala solo si el cliente la dice; no la pidas si no viene al caso.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["BIRTHDAY", "ANNIVERSARY", "CUSTOM"], description: "BIRTHDAY cumpleaños, ANNIVERSARY aniversario, CUSTOM otra fecha" },
          month: { type: "number", description: "Mes, 1 a 12" },
          day: { type: "number", description: "Día del mes" },
          year: { type: "number", description: "Año, solo si el cliente lo dijo" },
          personName: { type: "string", description: "Si la fecha es de otra persona: su nombre y relación, ej 'María (esposa)'. Vacío si es del cliente." },
          label: { type: "string", description: "Qué se celebra si no es un cumpleaños, ej 'aniversario de bodas'" },
        },
        required: ["kind", "month", "day"],
        additionalProperties: false,
      },
      async execute(args) {
        const clientId = await ensureClientId(tenantId, ctx);
        if (!clientId) return JSON.stringify({ error: "no hay un cliente asociado a la conversación" });
        const kind = args.kind === "ANNIVERSARY" || args.kind === "CUSTOM" ? args.kind : "BIRTHDAY";
        const month = Number(args.month);
        const day = Number(args.day);
        if (!isValidMonthDay(month, day)) {
          return JSON.stringify({ error: "fecha_invalida", detalle: "Mes de 1 a 12 y un día que exista en ese mes." });
        }
        const rawYear = Number(args.year);
        const year = Number.isInteger(rawYear) && rawYear > 1900 && rawYear <= new Date().getFullYear() ? rawYear : null;
        const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
        const personName = text(args.personName);

        // La misma fecha de la misma persona no se duplica: se actualiza
        const existing = await prisma.clientDate.findFirst({
          where: { tenantId, clientId, kind, personName: personName ? { equals: personName, mode: "insensitive" } : null },
        });
        const data = {
          month,
          day,
          year: year ?? existing?.year ?? null,
          label: text(args.label) ?? existing?.label ?? null,
          isActive: true,
        };
        if (existing) await prisma.clientDate.update({ where: { id: existing.id }, data });
        else await prisma.clientDate.create({ data: { tenantId, clientId, kind, personName, ...data } });
        return JSON.stringify({ ok: true, guardado: `${personName ?? "cliente"}: ${formatMonthDay({ month, day, year })}` });
      },
    },

    {
      name: "search_products",
      description:
        "Busca productos del catálogo por nombre, SKU o descripción (tolera tildes y plurales). Devuelve precio, stock y descripción. Úsala siempre antes de cotizar.",
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
        const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 10) : 5;
        // Se busca en memoria para tolerar tildes, plurales y "500g": el catálogo de una pyme es pequeño
        const catalog = await prisma.product.findMany({
          where: { tenantId, status: "ACTIVE" },
          orderBy: { updatedAt: "desc" },
          take: MAX_CATALOG_SCAN,
        });
        const products = rankProducts(query, catalog, limit);

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
        "Obtiene la información del negocio: nombre, rubro, dirección, descripción, horario, envíos, medios de pago y preguntas frecuentes. Úsala si el cliente pregunta por algo de eso.",
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
          businessHours: t.businessHours,
          deliveryInfo: t.deliveryInfo,
          paymentInfo: t.paymentInfo,
          faq: t.faq,
        });
      },
    },

    {
      name: "create_pending_order",
      description:
        "Crea el pedido cuando el cliente confirma que quiere comprar. Solo úsala cuando el cliente confirmó explícitamente productos y cantidades. NO inventes productos: usa los IDs que devolvió search_products. Reserva el stock y devuelve el código y el total.",
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

        // Cantidades enteras y positivas: no se corrigen en silencio
        if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1)) {
          return JSON.stringify({ error: "cantidad_invalida", detalle: "Las cantidades deben ser números enteros mayores a 0." });
        }

        const products = await prisma.product.findMany({
          where: { tenantId, status: "ACTIVE", id: { in: items.map((i) => i.productId) } },
        });
        const lookup = new Map(products.map((p) => [p.id, p]));

        // 2.2 — validamos ANTES de crear: productos reales y activos.
        const unknownIds = items.filter((i) => !lookup.has(i.productId)).map((i) => i.productId);
        if (unknownIds.length > 0) {
          return JSON.stringify({
            error: "producto_inexistente",
            detalle: `Estos IDs no están en el catálogo: ${unknownIds.join(", ")}. Usa search_products para obtener IDs válidos. NO inventes productos.`,
          });
        }

        // Las líneas repetidas del mismo producto se suman
        const quantities = new Map<string, number>();
        for (const i of items) quantities.set(i.productId, (quantities.get(i.productId) ?? 0) + i.quantity);

        let totalCents = 0;
        const orderItems = [...quantities].map(([productId, quantity]) => {
          const p = lookup.get(productId)!;
          totalCents += p.priceCents * quantity;
          return { productId, productNameSnap: p.name, unitPriceCents: p.priceCents, quantity };
        });

        let order;
        try {
          // Una sola transacción: reserva stock y asigna consecutivo; si algo falla no queda nada guardado
          order = await prisma.$transaction(async (tx) => {
            const insufficient: Array<{ name: string; pedido: number; disponible: number }> = [];
            for (const item of orderItems) {
              const p = lookup.get(item.productId)!;
              if (!p.trackInventory) continue;
              // Condición en el mismo UPDATE: si otro pedido se llevó las unidades, no descuenta
              const { count } = await tx.product.updateMany({
                where: { id: p.id, stock: { gte: item.quantity } },
                data: { stock: { decrement: item.quantity } },
              });
              if (count === 0) {
                const current = await tx.product.findUnique({ where: { id: p.id }, select: { stock: true } });
                insufficient.push({ name: p.name, pedido: item.quantity, disponible: current?.stock ?? 0 });
              }
            }
            if (insufficient.length > 0) throw new InsufficientStockError(insufficient);

            // El UPDATE bloquea la fila del tenant: dos pedidos no reciben el mismo código
            const { orderSeq } = await tx.tenant.update({
              where: { id: tenantId },
              data: { orderSeq: { increment: 1 } },
              select: { orderSeq: true },
            });

            return tx.order.create({
              data: {
                tenantId,
                clientId,
                code: `PED-${String(orderSeq).padStart(4, "0")}`,
                status: "PENDING_PAYMENT",
                totalCents,
                currency: products[0]?.currency ?? "COP",
                notes: typeof args.notes === "string" ? args.notes : null,
                items: { create: orderItems },
              },
            });
          });
        } catch (err) {
          if (err instanceof InsufficientStockError) {
            return JSON.stringify({
              error: "stock_insuficiente",
              detalle: err.detalle,
              mensaje:
                "No hay stock suficiente para algunos productos. Avísale al cliente las cantidades disponibles; el pedido NO se creó.",
            });
          }
          throw err;
        }

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
