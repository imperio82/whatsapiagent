import type { Prisma } from "@prisma/client";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { AITool } from "../domain/ports/ai-provider";
import { rankProducts } from "../domain/product-search";
import { isGenericClientName } from "../domain/client-memory";
import { simulateLoan } from "../domain/financing";
import { buildTools, ensureClientId, type ToolContext } from "./tools";
import { SchedulingService } from "@modules/integrations/application/scheduling.service";

/**
 * Herramientas del perfil de intermediación (vehículos e inmuebles). Igual que las de la
 * tienda, se cierran sobre el tenantId del contexto y nunca confían en el modelo para eso.
 *
 * Privacidad: ninguna herramienta devuelve el propietario, su teléfono, la dirección exacta
 * ni las notas privadas del bien. El modelo no puede filtrar lo que nunca recibe.
 */

export interface BrokerageToolContext extends ToolContext {
  /** Avisa al dueño del negocio por WhatsApp (comprador caliente, oferta, visita, bien nuevo). Best-effort. */
  notifyOwner?: (text: string) => Promise<void>;
  /** Agenda sobre el calendario conectado (Google u otro). Por defecto, la del negocio. */
  scheduling?: SchedulingService;
}

const MAX_INVENTORY_SCAN = 1000;
/** Ventana en la que una misma acción repetida (reintento del grafo o del modelo) no se duplica. */
const DEDUP_WINDOW_MS = 30 * 60 * 1000;

const KIND_LABEL = { VEHICLE: "vehículo", PROPERTY: "inmueble", OTHER: "otro" } as const;
const OPERATION_LABEL = { SALE: "venta", RENT: "arriendo" } as const;

type ListingRow = Prisma.ListingGetPayload<object>;

export function formatCop(value: number | bigint): string {
  return `$${Number(value).toLocaleString("es-CO")}`;
}

function attributesText(attributes: Prisma.JsonValue | null): string {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return "";
  return Object.entries(attributes)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
}

/** Lo que el comprador puede saber del bien. Sin datos del propietario. */
function publicListing(l: ListingRow, withPhotos: boolean) {
  // Sin el id interno: el agente se refiere a los bienes por nombre o código (findListing acepta ambos)
  return {
    code: l.code,
    title: l.title,
    kind: l.kind,
    operation: OPERATION_LABEL[l.operation],
    priceCop: Number(l.priceCop),
    city: l.city,
    zone: l.zone,
    details: attributesText(l.attributes),
    status: l.status === "RESERVED" ? "RESERVED (reservado)" : "AVAILABLE",
    ...(withPhotos ? { description: l.description, photos: l.photos.slice(0, 5) } : { photosCount: l.photos.length }),
  };
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);

async function clientOf(tenantId: string, ctx: ToolContext) {
  const clientId = await ensureClientId(tenantId, ctx);
  if (!clientId) return null;
  return prisma.client.findFirst({ where: { id: clientId, tenantId } });
}

/**
 * El bien al que se refiere el modelo: acepta el id, el código (INV-0001) o el nombre ("Mazda CX-5").
 * El historial no trae los ids de turnos anteriores, así que el nombre es lo más confiable.
 */
export async function findListing(
  tenantId: string,
  ref: unknown,
  statuses: ListingRow["status"][] = ["AVAILABLE", "RESERVED"],
): Promise<ListingRow | null> {
  const value = text(ref);
  if (!value) return null;
  const exact = await prisma.listing.findFirst({
    where: { tenantId, OR: [{ id: value }, { code: { equals: value, mode: "insensitive" } }] },
  });
  if (exact) return exact;
  const inventory = await prisma.listing.findMany({
    where: { tenantId, status: { in: statuses } },
    take: MAX_INVENTORY_SCAN,
  });
  const [best] = rankProducts(
    value,
    inventory.map((l) => ({ listing: l, name: l.title, sku: l.code, description: null })),
    1,
  );
  return best?.listing ?? null;
}

const LISTING_NOT_FOUND = JSON.stringify({
  error: "bien_inexistente",
  detalle: "No encontré ese bien. Usa search_listings y pasa el nombre exacto o el código que devuelve.",
});

function clientLabel(client: { name: string; phone: string }): string {
  const name = isGenericClientName(client.name) ? "Sin nombre" : client.name;
  const phone = client.phone.startsWith("lid:") ? "número oculto" : `+${client.phone}`;
  return `${name} (${phone})`;
}

/** El lead abierto del cliente para este tipo (comprador o vendedor), o uno nuevo. */
async function openLead(tenantId: string, client: { id: string; name: string; phone: string }, leadType: "BUYER" | "SELLER") {
  const existing = await prisma.lead.findFirst({
    where: { tenantId, clientId: client.id, leadType, stage: { notIn: ["CUSTOMER", "LOST"] } },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;
  return prisma.lead.create({
    data: {
      tenantId,
      clientId: client.id,
      contactName: client.name,
      phone: client.phone,
      leadType,
      stage: "NEW",
      source: "WHATSAPP",
      lastContactAt: new Date(),
    },
  });
}

function qualificationOf(value: Prisma.JsonValue | null): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)]));
}

const QUALIFICATION_LABELS: Record<string, string> = {
  busca: "Busca",
  presupuesto: "Presupuesto",
  formaPago: "Forma de pago",
  partePago: "Deja en parte de pago",
  zona: "Zona",
  plazo: "Para cuándo",
};

/** "CALIFICACIÓN ACTUAL" para el contexto del agente, así no vuelve a preguntar lo que ya sabe. */
export function formatLeadQualification(lead: {
  temperature: "HOT" | "WARM" | "COLD" | null;
  qualification: Prisma.JsonValue | null;
  offerCop: bigint | null;
  listing: { title: string } | null;
} | null): string | null {
  if (!lead) return null;
  const q = qualificationOf(lead.qualification);
  const lines = Object.entries(QUALIFICATION_LABELS)
    .filter(([key]) => q[key])
    .map(([key, label]) => `- ${label}: ${q[key]}`);
  if (lead.listing) lines.push(`- Le interesa: ${lead.listing.title}`);
  if (lead.offerCop) lines.push(`- Ya ofreció: ${formatCop(lead.offerCop)} (la oferta está con un asesor)`);
  if (lead.temperature) lines.push(`- Clasificación: ${lead.temperature}`);
  if (lines.length === 0) return null;
  return `CALIFICACIÓN ACTUAL DEL COMPRADOR (no vuelvas a preguntar esto):\n${lines.join("\n")}`;
}

export function buildBrokerageTools(tenantId: string, ctx: BrokerageToolContext): AITool[] {
  const notify = async (message: string) => {
    if (!ctx.notifyOwner) return;
    try {
      await ctx.notifyOwner(message);
    } catch (err) {
      console.warn("[brokerage] no se pudo avisar al dueño:", err);
    }
  };

  // Las herramientas de la ficha del cliente y del negocio son las mismas de la tienda
  const SHARED = new Set(["save_client_info", "save_special_date", "get_business_info"]);
  const shared = buildTools(tenantId, ctx).filter((t) => SHARED.has(t.name));
  const scheduling = ctx.scheduling ?? new SchedulingService();

  return [
    ...shared,

    {
      name: "search_listings",
      description:
        "Busca en el inventario de vehículos e inmuebles disponibles (o reservados). Devuelve título, precio, ciudad, barrio y datos clave. Úsala siempre antes de mencionar un bien o un precio.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "1 o 2 palabras: 'camioneta', 'mazda', 'apartamento', 'casa'. Vacío trae todo." },
          kind: { type: "string", enum: ["VEHICLE", "PROPERTY"], description: "Tipo de bien, si se sabe" },
          operation: { type: "string", enum: ["SALE", "RENT"], description: "Venta o arriendo, si se sabe" },
          maxPrice: { type: "number", description: "Precio máximo en pesos (presupuesto del cliente)" },
          city: { type: "string", description: "Ciudad, solo si el cliente la dijo en esta conversación" },
          limit: { type: "number", description: "Máximo de resultados (default 5)" },
        },
        required: [],
        additionalProperties: false,
      },
      async execute(args) {
        const query = text(args.query) ?? "";
        const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 8) : 5;
        const maxPrice = amount(args.maxPrice);
        const city = text(args.city);
        const kind = args.kind === "VEHICLE" || args.kind === "PROPERTY" ? args.kind : null;
        const operation = args.operation === "SALE" || args.operation === "RENT" ? args.operation : null;

        const search = async (filters: { city: string | null; maxPrice: number | null }) => {
          const inventory = await prisma.listing.findMany({
            where: {
              tenantId,
              status: { in: ["AVAILABLE", "RESERVED"] },
              ...(kind ? { kind } : {}),
              ...(operation ? { operation } : {}),
              ...(filters.maxPrice ? { priceCop: { lte: BigInt(Math.round(filters.maxPrice * 1.1)) } } : {}),
              ...(filters.city ? { city: { contains: filters.city, mode: "insensitive" as const } } : {}),
            },
            orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
            take: MAX_INVENTORY_SCAN,
          });
          // Se busca en título, código, barrio, ciudad y características, tolerando tildes y plurales
          const searchable = inventory.map((l) => ({
            listing: l,
            name: l.title,
            sku: l.code,
            description: [l.description, l.zone, l.city, attributesText(l.attributes)].filter(Boolean).join(" "),
          }));
          return rankProducts(query, searchable, limit).map((s) => publicListing(s.listing, false));
        };

        const found = await search({ city, maxPrice });
        if (found.length > 0) return JSON.stringify(found);

        // Sin resultados con ciudad o presupuesto: el modelo a veces los supone. Se busca sin ellos
        // y se le dice por qué, para que no responda "no tenemos" cuando sí hay en otra ciudad.
        if (city || maxPrice) {
          const wider = await search({ city: null, maxPrice: null });
          if (wider.length > 0) {
            const why = [city && `en ${city}`, maxPrice && `por ese presupuesto`].filter(Boolean).join(" ni ");
            return JSON.stringify({
              resultados: wider,
              nota: `No hay ${why}; estos son los que hay fuera de ese filtro. Díselo así al cliente (por ejemplo: "en ${city ?? "esa ciudad"} no, pero tenemos esta en otra ciudad").`,
            });
          }
        }
        return JSON.stringify({
          resultados: 0,
          nota: "No hay bienes así en el inventario. Prueba con otra palabra o sin palabra; si tampoco, dile al cliente que un asesor le avisa cuando entre algo así.",
        });
      },
    },

    {
      name: "get_listing",
      description: "Detalle de un bien del inventario: descripción completa, características y enlaces de fotos. Úsala cuando el cliente pida más información o fotos.",
      parameters: {
        type: "object",
        properties: { listing: { type: "string", description: "Nombre o código del bien tal como lo devolvió search_listings (ej: 'Mazda CX-5 Grand Touring 2021' o 'INV-0001')" }, },
        required: ["listing"],
        additionalProperties: false,
      },
      async execute(args) {
        const listing = await findListing(tenantId, args.listing);
        if (!listing || !["AVAILABLE", "RESERVED"].includes(listing.status)) return LISTING_NOT_FOUND;
        return JSON.stringify(publicListing(listing, true));
      },
    },

    {
      name: "qualify_lead",
      description:
        "Guarda lo que el comprador respondió a las preguntas de calificación y lo clasifica (HOT, WARM o COLD). Envía solo los campos que el cliente dijo de forma explícita en la conversación, con sus palabras: nunca deduzcas ni completes (si no dijo para cuándo, no envíes plazo; si no dijo zona, no envíes zona).",
      parameters: {
        type: "object",
        properties: {
          busca: { type: "string", description: "Qué busca, en sus palabras: 'camioneta para la familia', 'apartamento de 3 alcobas en Manizales'" },
          presupuesto: { type: "string", description: "Presupuesto o cuota inicial, tal como lo dijo: '$30.000.000 de inicial', 'hasta 100 millones'" },
          formaPago: { type: "string", description: "Contado, crédito, parte de pago o combinación" },
          partePago: { type: "string", description: "Lo que deja en parte de pago: marca, modelo, año, kilometraje" },
          zona: { type: "string", description: "Ciudad o zona de interés" },
          plazo: { type: "string", description: "Para cuándo lo necesita" },
          listing: { type: "string", description: "Nombre o código del bien tal como lo devolvió search_listings (ej: 'Mazda CX-5 Grand Touring 2021' o 'INV-0001') Solo si ya se sabe qué bien le interesa" },
          temperature: {
            type: "string",
            enum: ["HOT", "WARM", "COLD"],
            description: "Clasificación según las reglas del negocio. HOT solo si cumple TODO el criterio de caliente; si falta saber para cuándo o si quiere ver el bien, es WARM.",
          },
          resumen: { type: "string", description: "Una línea para el asesor con lo que quiere el cliente. Sin códigos ni datos que no haya dicho." },
          // Datos estructurados para avisarle cuando entre un bien que le sirva (solo si los dijo)
          tipoBien: { type: "string", enum: ["VEHICLE", "PROPERTY"], description: "Si busca vehículo o inmueble" },
          operacion: { type: "string", enum: ["SALE", "RENT"], description: "Si quiere comprar (SALE) o arrendar (RENT)" },
          presupuestoMaximo: { type: "number", description: "Valor total máximo que puede pagar, en pesos (100000000). No la cuota inicial." },
          ciudadBusqueda: { type: "string", description: "Ciudad o barrio donde lo busca, si lo dijo" },
        },
        required: ["temperature"],
        additionalProperties: false,
      },
      async execute(args) {
        const client = await clientOf(tenantId, ctx);
        if (!client) return JSON.stringify({ error: "no hay un cliente asociado a la conversación" });
        const lead = await openLead(tenantId, client, "BUYER");

        const qualification = qualificationOf(lead.qualification);
        const saved: string[] = [];
        for (const key of Object.keys(QUALIFICATION_LABELS)) {
          const value = text(args[key]);
          if (value) {
            qualification[key] = value;
            saved.push(key);
          }
        }
        const listing = await findListing(tenantId, args.listing);
        const searchKind = args.tipoBien === "VEHICLE" || args.tipoBien === "PROPERTY" ? args.tipoBien : null;
        const searchOperation = args.operacion === "SALE" || args.operacion === "RENT" ? args.operacion : null;
        const budgetMax = amount(args.presupuestoMaximo);
        const searchCity = text(args.ciudadBusqueda);
        const temperature = args.temperature === "HOT" || args.temperature === "WARM" || args.temperature === "COLD" ? args.temperature : null;
        const becameHot = temperature === "HOT" && lead.temperature !== "HOT";

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            qualification,
            ...(searchKind ? { searchKind } : {}),
            ...(searchOperation ? { searchOperation } : {}),
            ...(budgetMax ? { budgetMaxCop: BigInt(budgetMax) } : {}),
            ...(searchCity ? { searchCity } : {}),
            ...(temperature ? { temperature, stage: temperature === "HOT" ? "READY_TO_BUY" : temperature === "WARM" ? "INTERESTED" : "CONTACTED" } : {}),
            ...(listing ? { listingId: listing.id, productInterest: listing.title } : qualification.busca ? { productInterest: qualification.busca } : {}),
            ...(text(args.resumen) ? { aiSummary: text(args.resumen) } : {}),
            ...(isGenericClientName(lead.contactName) && !isGenericClientName(client.name) ? { contactName: client.name } : {}),
            lastContactAt: new Date(),
          },
        });

        if (becameHot) {
          const details = Object.entries(QUALIFICATION_LABELS)
            .filter(([key]) => qualification[key])
            .map(([key, label]) => `${label}: ${qualification[key]}`)
            .join(". ");
          // El aviso se arma con datos guardados, no con texto libre del modelo (que puede inventar códigos)
          await notify(`🔥 Comprador caliente: ${clientLabel(client)}${listing ? `. Le interesa ${listing.title} (${listing.code})` : ""}. ${details}.`);
        }
        return JSON.stringify({ ok: true, guardado: saved, temperatura: temperature, asesorAvisado: becameHot });
      },
    },

    {
      name: "check_availability",
      description:
        "Consulta la agenda del negocio y devuelve los horarios libres para visitas o pruebas de manejo en un día. Úsala antes de proponer horarios. Si la agenda no está conectada te lo dice.",
      parameters: {
        type: "object",
        properties: {
          day: { type: "string", description: "Día que quiere el cliente en formato YYYY-MM-DD (calcúlalo con la fecha de hoy). Vacío = hoy." },
        },
        required: [],
        additionalProperties: false,
      },
      async execute(args) {
        const day = text(args.day) ?? "";
        try {
          const result = await scheduling.availability(tenantId, day);
          if (!result.connected) {
            return JSON.stringify({
              agenda: "no_conectada",
              mensaje: "No hay agenda conectada: propón horarios según las reglas del negocio y registra la solicitud con request_visit sin dateTime.",
            });
          }
          return JSON.stringify({
            agenda: "conectada",
            dia: result.day,
            libres: result.slots.map((s) => ({ dateTime: s.start, texto: s.label })),
            otrosDias: result.nextDays.map((d) => ({ dia: d.day, libres: d.slots.map((s) => ({ dateTime: s.start, texto: s.label })) })),
            mensaje:
              result.slots.length > 0
                ? "Ofrécele 2 o 3 de estos horarios. Cuando elija uno, agenda con request_visit pasando su dateTime exacto."
                : "Ese día no hay espacio. Ofrécele horarios de otrosDias.",
          });
        } catch (err) {
          console.warn("[brokerage] no se pudo consultar la agenda:", err);
          return JSON.stringify({
            agenda: "error",
            mensaje: "No pude consultar la agenda. Pregúntale qué día y franja prefiere y registra la solicitud con request_visit sin dateTime; un asesor confirma.",
          });
        }
      },
    },

    {
      name: "request_visit",
      description:
        "Agenda la visita a un inmueble o la prueba de manejo de un vehículo. Con dateTime (uno de los horarios libres de check_availability) queda agendada en el calendario del negocio. Sin dateTime, o si no hay agenda conectada, queda como solicitud y un asesor confirma la hora. También sirve para mover una cita ya agendada a otra hora.",
      parameters: {
        type: "object",
        properties: {
          listing: { type: "string", description: "Nombre o código del bien tal como lo devolvió search_listings (ej: 'Mazda CX-5 Grand Touring 2021' o 'INV-0001')" },
          dateTime: { type: "string", description: "Horario exacto elegido, tal cual lo devolvió check_availability (ej: '2026-10-16T15:00')" },
          preferredSlot: { type: "string", description: "Lo que pidió el cliente con sus palabras: 'jueves en la mañana'" },
          notes: { type: "string", description: "Algo que el asesor deba saber" },
        },
        required: ["listing"],
        additionalProperties: false,
      },
      async execute(args) {
        const client = await clientOf(tenantId, ctx);
        if (!client) return JSON.stringify({ error: "no hay un cliente asociado a la conversación" });
        const listing = await findListing(tenantId, args.listing);
        if (!listing) return LISTING_NOT_FOUND;
        const dateTime = text(args.dateTime);
        const slot = text(args.preferredSlot) ?? dateTime ?? "por definir";
        const what = listing.kind === "VEHICLE" ? "prueba de manejo" : "visita";
        const lead = await openLead(tenantId, client, "BUYER");

        // Una cita abierta del cliente para este bien se actualiza (o se mueve) en vez de duplicarse
        const open = await prisma.appointment.findFirst({
          where: {
            tenantId,
            clientId: client.id,
            listingId: listing.id,
            OR: [{ status: "REQUESTED" }, { status: "CONFIRMED", scheduledAt: { gte: new Date() } }],
          },
          orderBy: { createdAt: "desc" },
        });
        const appointment = open
          ? await prisma.appointment.update({ where: { id: open.id }, data: { requestedSlot: slot, notes: text(args.notes) ?? open.notes } })
          : await prisma.appointment.create({
              data: { tenantId, clientId: client.id, leadId: lead.id, listingId: listing.id, requestedSlot: slot, notes: text(args.notes) },
            });
        await prisma.lead.update({
          where: { id: lead.id },
          data: { listingId: listing.id, productInterest: listing.title, stage: "READY_TO_BUY", lastContactAt: new Date() },
        });

        if (dateTime) {
          const booked = await scheduling.book(tenantId, appointment.id, dateTime);
          if (booked.ok) {
            const moved = open?.status === "CONFIRMED";
            await notify(
              `📅 ${moved ? "Cita movida" : "Cita agendada"} en el calendario: ${what} de ${listing.title} (${listing.code}) con ${clientLabel(client)} el ${booked.label}${booked.advisor ? `. La atiende ${booked.advisor}` : ""}.`,
            );
            return JSON.stringify({
              ok: true,
              estado: "agendada",
              fechaHora: booked.label,
              ...(booked.advisor ? { asesor: booked.advisor } : {}),
              mensaje: `Confírmale que quedó agendada para el ${booked.label}${booked.advisor ? ` con ${booked.advisor.split(" ")[0]}` : ""}. El asesor le envía la ubicación exacta antes de la cita.`,
            });
          }
          if (booked.reason !== "sin_calendario" && booked.reason !== "error_calendario") {
            return JSON.stringify({
              ok: false,
              estado: "no_agendada",
              motivo: booked.reason,
              alternativas: booked.alternatives.map((a) => ({ dateTime: a.start, texto: a.label })),
              mensaje: "Ese horario no está disponible. Ofrécele las alternativas y, cuando elija, vuelve a llamar request_visit con ese dateTime.",
            });
          }
          if (booked.reason === "error_calendario") console.warn("[brokerage] no se pudo agendar en el calendario:", booked.detail);
        }

        if (!open || open.requestedSlot !== slot) {
          await notify(
            `📅 Solicitud de ${what}: ${clientLabel(client)} quiere ver ${listing.title} (${listing.code}) el ${slot}. Confirmar hora y lugar.`,
          );
        }
        return JSON.stringify({
          ok: true,
          estado: "solicitada",
          horario: slot,
          mensaje: "Dile al cliente que un asesor le confirma la hora y el lugar. No digas que quedó confirmada.",
        });
      },
    },

    {
      name: "cancel_visit",
      description: "Cancela la visita o prueba de manejo que el cliente tiene con un bien, cuando él lo pida. La quita también del calendario.",
      parameters: {
        type: "object",
        properties: {
          listing: { type: "string", description: "Nombre o código del bien de la cita" },
          reason: { type: "string", description: "Por qué cancela, si lo dijo" },
        },
        required: ["listing"],
        additionalProperties: false,
      },
      async execute(args) {
        const client = await clientOf(tenantId, ctx);
        if (!client) return JSON.stringify({ error: "no hay un cliente asociado a la conversación" });
        const listing = await findListing(tenantId, args.listing);
        if (!listing) return LISTING_NOT_FOUND;
        const appointment = await prisma.appointment.findFirst({
          where: { tenantId, clientId: client.id, listingId: listing.id, status: { in: ["REQUESTED", "CONFIRMED"] } },
          orderBy: { createdAt: "desc" },
        });
        if (!appointment) return JSON.stringify({ error: "sin_cita", detalle: "El cliente no tiene una cita abierta con ese bien." });
        const reason = text(args.reason);
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: "CANCELLED", notes: [appointment.notes, reason ? `Canceló: ${reason}` : "Canceló por WhatsApp"].filter(Boolean).join(" · ") },
        });
        await scheduling.syncFromPanel(tenantId, appointment.id);
        await notify(`❌ ${clientLabel(client)} canceló la cita de ${listing.title} (${listing.code})${reason ? `: ${reason}` : ""}.`);
        return JSON.stringify({ ok: true, estado: "cancelada", mensaje: "Confírmale que la cita quedó cancelada y ofrécele reagendar cuando quiera." });
      },
    },

    {
      name: "simulate_payment",
      description:
        "Simula la cuota mensual aproximada de un crédito para comprar un bien. Úsala siempre que el cliente pregunte cuánto pagaría al mes; no hagas la cuenta tú. El resultado es un estimado, no una aprobación de crédito.",
      parameters: {
        type: "object",
        properties: {
          price: { type: "number", description: "Precio del bien en pesos, tal como lo devolvió search_listings (ej: 98000000)" },
          downPayment: { type: "number", description: "Cuota inicial en pesos que dijo el cliente (0 si no tiene)" },
          annualRatePercent: { type: "number", description: "Tasa efectiva anual en porcentaje (ej: 14.5), la de la información o las reglas del negocio" },
          months: { type: "number", description: "Plazo en meses (ej: 60)" },
        },
        required: ["price", "downPayment", "annualRatePercent", "months"],
        additionalProperties: false,
      },
      async execute(args) {
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
        const result = simulateLoan({
          price: num(args.price),
          downPayment: num(args.downPayment),
          annualRatePercent: num(args.annualRatePercent),
          months: num(args.months),
        });
        if (!result.ok) return JSON.stringify({ error: "datos_invalidos", detalle: result.error });
        return JSON.stringify({
          estimado: true,
          price: Math.round(num(args.price)),
          downPayment: Math.round(num(args.downPayment)),
          financedAmount: result.financedAmount,
          months: num(args.months),
          annualRatePercent: num(args.annualRatePercent),
          monthlyPayment: result.monthlyPayment,
          totalPaid: result.totalPaid,
          mensaje: "Dile al cliente que es un valor aproximado: la cuota real depende de la entidad, del estudio de crédito y de los seguros. No prometas aprobación.",
        });
      },
    },

    {
      name: "register_offer",
      description:
        "Registra una oferta o contraoferta del comprador por un bien y se la pasa a un asesor. Úsala cuando el cliente proponga un valor distinto al publicado. No aceptes ni rechaces la oferta.",
      parameters: {
        type: "object",
        properties: {
          listing: { type: "string", description: "Nombre o código del bien tal como lo devolvió search_listings (ej: 'Mazda CX-5 Grand Touring 2021' o 'INV-0001')" },
          offerAmount: { type: "number", description: "Valor ofrecido en pesos, número completo (90000000)" },
          conditions: { type: "string", description: "Condiciones: contado, con crédito, dejando un carro, etc." },
        },
        required: ["listing", "offerAmount"],
        additionalProperties: false,
      },
      async execute(args) {
        const client = await clientOf(tenantId, ctx);
        if (!client) return JSON.stringify({ error: "no hay un cliente asociado a la conversación" });
        const listing = await findListing(tenantId, args.listing);
        if (!listing) return LISTING_NOT_FOUND;
        const offer = amount(args.offerAmount);
        if (!offer) return JSON.stringify({ error: "valor_invalido", detalle: "El valor debe ser un número en pesos, por ejemplo 90000000." });

        const lead = await openLead(tenantId, client, "BUYER");
        const repeated = lead.offerCop === BigInt(offer) && lead.listingId === listing.id && Date.now() - lead.updatedAt.getTime() < DEDUP_WINDOW_MS;
        const conditions = text(args.conditions);
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            offerCop: BigInt(offer),
            listingId: listing.id,
            productInterest: listing.title,
            stage: "READY_TO_BUY",
            temperature: "HOT",
            aiSummary: `Ofreció ${formatCop(offer)} por ${listing.title} (publicado en ${formatCop(listing.priceCop)})${conditions ? `, ${conditions}` : ""}.`,
            lastContactAt: new Date(),
          },
        });
        if (!repeated) {
          await notify(
            `💰 Oferta: ${clientLabel(client)} ofrece ${formatCop(offer)} por ${listing.title} (${listing.code}), publicado en ${formatCop(listing.priceCop)}${conditions ? `. Condiciones: ${conditions}` : ""}. La conversación queda contigo.`,
          );
        }
        return JSON.stringify({
          ok: true,
          offerPrice: offer,
          handoff: true,
          mensaje: "La oferta quedó registrada y pasa a un asesor. Díselo al cliente; no digas si se acepta.",
        });
      },
    },

    {
      name: "register_seller_property",
      description:
        "Registra un vehículo o inmueble que el cliente quiere vender, consignar o arrendar a través del negocio. Queda pendiente de aprobación de un asesor; no se publica solo.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["VEHICLE", "PROPERTY", "OTHER"] },
          operation: { type: "string", enum: ["SALE", "RENT"], description: "Vender o arrendar (default vender)" },
          title: { type: "string", description: "Nombre corto: 'Chevrolet Onix 2020', 'Casa de 3 alcobas en Villamaría'" },
          description: { type: "string", description: "Todo lo que contó del bien" },
          expectedPrice: { type: "number", description: "Precio que espera en pesos, si lo dijo" },
          city: { type: "string" },
          zone: { type: "string", description: "Barrio o sector" },
          details: {
            type: "object",
            description: "Características clave: { \"Año\": \"2020\", \"Kilometraje\": \"35.000 km\" } o { \"Área\": \"90 m²\", \"Habitaciones\": \"3\" }",
            additionalProperties: { type: "string" },
          },
        },
        required: ["kind", "title", "city"],
        additionalProperties: false,
      },
      async execute(args) {
        const client = await clientOf(tenantId, ctx);
        if (!client) return JSON.stringify({ error: "no hay un cliente asociado a la conversación" });
        const kind = args.kind === "VEHICLE" || args.kind === "PROPERTY" ? args.kind : "OTHER";
        const operation = args.operation === "RENT" ? "RENT" : "SALE";
        const title = text(args.title) ?? "Bien sin nombre";
        const city = text(args.city) ?? "Sin ciudad";
        const price = amount(args.expectedPrice);
        const details =
          args.details && typeof args.details === "object" && !Array.isArray(args.details)
            ? Object.fromEntries(Object.entries(args.details as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
            : undefined;
        const data = {
          kind,
          operation,
          title,
          city,
          description: text(args.description),
          zone: text(args.zone),
          priceCop: BigInt(price ?? 0),
          ...(details ? { attributes: details } : {}),
        } as const;

        // Un mismo vendedor que sigue dando datos actualiza su registro pendiente en vez de crear otro
        const recent = await prisma.listing.findFirst({
          where: { tenantId, ownerPhone: client.phone, status: "PENDING_REVIEW", createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) } },
          orderBy: { createdAt: "desc" },
        });
        const listing = recent
          ? await prisma.listing.update({ where: { id: recent.id }, data })
          : await prisma.$transaction(async (tx) => {
              const { listingSeq } = await tx.tenant.update({
                where: { id: tenantId },
                data: { listingSeq: { increment: 1 } },
                select: { listingSeq: true },
              });
              return tx.listing.create({
                data: {
                  ...data,
                  tenantId,
                  code: `INV-${String(listingSeq).padStart(4, "0")}`,
                  status: "PENDING_REVIEW",
                  ownerName: isGenericClientName(client.name) ? null : client.name,
                  ownerPhone: client.phone,
                  privateNotes: "Recibido por WhatsApp. Revisar fotos, papeles y precio antes de publicar.",
                },
              });
            });

        const lead = await openLead(tenantId, client, "SELLER");
        await prisma.lead.update({
          where: { id: lead.id },
          data: { listingId: listing.id, productInterest: `Vende: ${title}`, stage: "INTERESTED", lastContactAt: new Date() },
        });
        if (!recent) {
          await notify(
            `🏷️ Bien nuevo para aprobar: ${title} en ${city} (${KIND_LABEL[kind]}, ${OPERATION_LABEL[operation]})${price ? `, espera ${formatCop(price)}` : ""}. Lo trae ${clientLabel(client)}. Código ${listing.code}.`,
          );
        }
        return JSON.stringify({
          ok: true,
          code: listing.code,
          estado: "pendiente de aprobación",
          mensaje: "Dile que un asesor revisa el bien y lo contacta antes de publicarlo, y que puede enviar fotos por este chat.",
        });
      },
    },
  ];
}
