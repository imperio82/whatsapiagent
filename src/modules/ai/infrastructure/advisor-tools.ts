import type { AgentProfile, LeadStage, LeadTemperature, ListingStatus } from "@prisma/client";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import { deliverOrQueue } from "@modules/conversations/application/send-proactive";
import { MatchingService } from "@modules/matching/application/matching.service";
import { SchedulingService } from "@modules/integrations/application/scheduling.service";
import { sendConfirmationNotice } from "@modules/appointments/application/confirmation-notice";
import type { AIProvider, AITool } from "../domain/ports/ai-provider";
import { appendMemory, isGenericClientName } from "../domain/client-memory";
import { findListing, formatCop } from "./brokerage-tools";

/**
 * Herramientas del asistente del asesor: el equipo del negocio le escribe por WhatsApp para
 * consultar su agenda, sus compradores y el inventario, o para actuar sin abrir el panel.
 *
 * A diferencia de las herramientas del cliente, aquí sí se ven los datos privados del bien
 * (propietario, dirección exacta): quien escribe es del equipo. Todo se cierra sobre el tenantId
 * del contexto; el modelo nunca lo elige.
 */

export interface AdvisorToolContext {
  profile: AgentProfile;
  /** Usuario del asesor (null si escribe desde el número de avisos sin cuenta en el panel). */
  userId: string | null;
  whatsapp: WhatsAppProvider;
  /** Para que el agente redacte los avisos al cliente (confirmación de citas) */
  ai?: AIProvider;
}

const TIME_ZONE = "America/Bogota";
/** Colombia no tiene horario de verano: siempre UTC-5. */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
/** Lo mismo que pausa la IA cuando pasa una conversación a una persona. */
const HANDOFF_PAUSE_MS = 2 * 60 * 60 * 1000;
const MAX_ITEMS = 10;

const TEMPERATURE_LABEL: Record<LeadTemperature, string> = { HOT: "caliente", WARM: "tibio", COLD: "frío" };
const STAGE_LABEL: Record<LeadStage, string> = {
  NEW: "nuevo",
  CONTACTED: "contactado",
  INTERESTED: "interesado",
  READY_TO_BUY: "listo para comprar",
  CUSTOMER: "cerrado",
  LOST: "perdido",
};
const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  PENDING_REVIEW: "por aprobar",
  AVAILABLE: "disponible",
  RESERVED: "reservado",
  SOLD: "vendido",
  ARCHIVED: "archivado",
};

/** Clientes recientes en los que se busca por nombre. */
const MAX_CLIENT_SCAN = 2000;

const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const json = (v: unknown) => JSON.stringify(v);

/** Inicio del día en Bogotá, `days` días desde hoy. */
function bogotaDayStart(days = 0, now = new Date()): Date {
  const local = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days) + BOGOTA_OFFSET_MS);
}

function when(date: Date | null): string | null {
  return (
    date?.toLocaleString("es-CO", {
      timeZone: TIME_ZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }) ?? null
  );
}

function clientLabel(client: { name: string; phone: string } | null): string {
  if (!client) return "Sin cliente";
  const name = isGenericClientName(client.name) ? "Sin nombre" : client.name;
  return client.phone.startsWith("lid:") ? name : `${name} (+${client.phone})`;
}

type ClientMatch =
  | { client: { id: string; name: string; phone: string; notes: string | null; aiMemory: string | null } }
  | { error: string };

/** El cliente al que se refiere el asesor: por teléfono (con o sin indicativo) o por nombre. */
async function findClient(tenantId: string, ref: unknown): Promise<ClientMatch> {
  const value = text(ref);
  if (!value) return { error: "Falta el nombre o el teléfono del cliente." };
  const select = { id: true, name: true, phone: true, notes: true, aiMemory: true } as const;

  const digits = value.replace(/\D/g, "");
  if (digits.length >= 7) {
    const byPhone = await prisma.client.findFirst({
      where: { tenantId, phone: { endsWith: digits.slice(-10) } },
      select,
    });
    if (byPhone) return { client: byPhone };
  }

  // Por WhatsApp casi nadie escribe tildes: "perez" debe encontrar a "Pérez"
  const wanted = normalize(value);
  const recent = await prisma.client.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    take: MAX_CLIENT_SCAN,
    select,
  });
  const byName = recent.filter((c) => normalize(c.name).includes(wanted)).slice(0, 5);
  if (byName.length === 1) return { client: byName[0]! };
  if (byName.length === 0) return { error: `No encontré ningún cliente que se llame "${value}". Pide el teléfono.` };
  // Si el nombre coincide exacto con uno, ese es; si no, que el asesor elija
  const exact = byName.filter((c) => normalize(c.name) === wanted);
  if (exact.length === 1) return { client: exact[0]! };
  return {
    error: `Hay varios clientes con ese nombre: ${byName.map(clientLabel).join("; ")}. Pregunta cuál es (por el teléfono).`,
  };
}

async function latestConversation(tenantId: string, clientId: string) {
  return prisma.conversation.findFirst({ where: { tenantId, clientId }, orderBy: { lastMessageAt: "desc" } });
}

export function buildAdvisorTools(tenantId: string, ctx: AdvisorToolContext): AITool[] {
  const brokerage = ctx.profile === "BROKERAGE";
  const matching = new MatchingService(ctx.whatsapp);
  const scheduling = new SchedulingService();

  const common: AITool[] = [
    {
      name: "daily_summary",
      description:
        "Resumen del día del negocio: contactos nuevos, compradores calientes, citas de hoy y por confirmar, conversaciones esperando a una persona, bienes por aprobar y coincidencias por enviar. Úsala cuando pregunten '¿cómo vamos?', '¿qué tengo pendiente?' o similar.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      async execute() {
        const today = bogotaDayStart(0);
        const tomorrow = bogotaDayStart(1);
        const [newLeads, hotLeads, waiting, appointmentsToday, toConfirm, toApprove, matches] = await Promise.all([
          prisma.lead.count({ where: { tenantId, createdAt: { gte: today } } }),
          prisma.lead.count({ where: { tenantId, temperature: "HOT", stage: { notIn: ["CUSTOMER", "LOST"] } } }),
          prisma.conversation.count({ where: { tenantId, status: "PENDING_REVIEW" } }),
          prisma.appointment.count({
            where: { tenantId, status: "CONFIRMED", scheduledAt: { gte: today, lt: tomorrow } },
          }),
          prisma.appointment.count({ where: { tenantId, status: "REQUESTED" } }),
          prisma.listing.count({ where: { tenantId, status: "PENDING_REVIEW" } }),
          prisma.listingMatch.count({ where: { tenantId, status: "PENDING" } }),
        ]);
        return json({
          contactosNuevosHoy: newLeads,
          compradoresCalientes: hotLeads,
          conversacionesEsperandoPersona: waiting,
          ...(brokerage
            ? {
                citasConfirmadasHoy: appointmentsToday,
                citasPorConfirmar: toConfirm,
                bienesPorAprobar: toApprove,
                coincidenciasPorEnviar: matches,
              }
            : {}),
        });
      },
    },

    {
      name: "list_leads",
      description:
        "Lista compradores (o vendedores) abiertos, los más recientes primero. Sirve para '¿quiénes están calientes?', '¿qué vendedores llegaron?'.",
      parameters: {
        type: "object",
        properties: {
          temperature: { type: "string", enum: ["HOT", "WARM", "COLD"], description: "Filtra por temperatura" },
          type: { type: "string", enum: ["BUYER", "SELLER"], description: "Compradores o vendedores (default compradores)" },
        },
        required: [],
        additionalProperties: false,
      },
      async execute(args) {
        const temperature = args.temperature === "HOT" || args.temperature === "WARM" || args.temperature === "COLD" ? args.temperature : null;
        const leads = await prisma.lead.findMany({
          where: {
            tenantId,
            leadType: args.type === "SELLER" ? "SELLER" : "BUYER",
            stage: { notIn: ["CUSTOMER", "LOST"] },
            ...(temperature ? { temperature } : {}),
          },
          include: { client: { select: { name: true, phone: true } }, listing: { select: { code: true, title: true } } },
          orderBy: { updatedAt: "desc" },
          take: MAX_ITEMS,
        });
        if (leads.length === 0) return json({ resultado: "No hay contactos abiertos con ese filtro." });
        return json(
          leads.map((l) => ({
            cliente: clientLabel(l.client ?? { name: l.contactName, phone: l.phone }),
            temperatura: l.temperature ? TEMPERATURE_LABEL[l.temperature] : "sin calificar",
            etapa: STAGE_LABEL[l.stage],
            leInteresa: l.listing ? `${l.listing.title} (${l.listing.code})` : l.productInterest,
            oferta: l.offerCop ? formatCop(l.offerCop) : null,
            resumen: l.aiSummary,
            ultimoContacto: when(l.lastContactAt ?? l.updatedAt),
          })),
        );
      },
    },

    {
      name: "client_details",
      description:
        "Ficha completa de un cliente: lo que busca, su calificación, notas, citas y los últimos mensajes de su conversación. Úsala antes de responder sobre un cliente concreto.",
      parameters: {
        type: "object",
        properties: { client: { type: "string", description: "Nombre o teléfono del cliente" } },
        required: ["client"],
        additionalProperties: false,
      },
      async execute(args) {
        const found = await findClient(tenantId, args.client);
        if ("error" in found) return json({ error: found.error });
        const { client } = found;
        const [leads, appointments, conversation] = await Promise.all([
          prisma.lead.findMany({
            where: { tenantId, clientId: client.id },
            include: { listing: { select: { code: true, title: true } } },
            orderBy: { updatedAt: "desc" },
            take: 3,
          }),
          prisma.appointment.findMany({
            where: { tenantId, clientId: client.id, status: { in: ["REQUESTED", "CONFIRMED"] } },
            include: { listing: { select: { title: true } } },
            take: 3,
          }),
          prisma.conversation.findFirst({
            where: { tenantId, clientId: client.id },
            orderBy: { lastMessageAt: "desc" },
            include: { messages: { orderBy: { sentAt: "desc" }, take: 8 } },
          }),
        ]);
        return json({
          cliente: clientLabel(client),
          notasDelEquipo: client.notes,
          loQueHaContado: client.aiMemory,
          contactos: leads.map((l) => ({
            tipo: l.leadType === "SELLER" ? "vendedor" : "comprador",
            temperatura: l.temperature ? TEMPERATURE_LABEL[l.temperature] : "sin calificar",
            etapa: STAGE_LABEL[l.stage],
            calificacion: l.qualification,
            leInteresa: l.listing ? `${l.listing.title} (${l.listing.code})` : l.productInterest,
            oferta: l.offerCop ? formatCop(l.offerCop) : null,
            resumen: l.aiSummary,
          })),
          citas: appointments.map((a) => ({
            estado: a.status === "CONFIRMED" ? "confirmada" : "por confirmar",
            pidio: a.requestedSlot,
            fecha: when(a.scheduledAt),
            bien: a.listing?.title ?? null,
          })),
          conversacion: conversation
            ? {
                estado: conversation.status === "PENDING_REVIEW" ? "esperando a una persona" : "abierta",
                iaPausada: !!conversation.aiPausedUntil && conversation.aiPausedUntil > new Date(),
                ultimosMensajes: [...conversation.messages].reverse().map((m) => ({
                  de: m.direction === "INBOUND" ? "cliente" : m.authoredBy === "AI" ? "IA" : "equipo",
                  texto: m.content.slice(0, 300),
                  hora: when(m.sentAt),
                })),
              }
            : null,
        });
      },
    },

    {
      name: "update_lead",
      description:
        "Actualiza un cliente: su temperatura, la etapa del proceso o agrega una nota interna del equipo (el cliente nunca la ve). Úsala cuando el asesor diga 'márcalo caliente', 'ya compró', 'se cayó', 'anota que…'.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Nombre o teléfono del cliente" },
          temperature: { type: "string", enum: ["HOT", "WARM", "COLD"] },
          stage: {
            type: "string",
            enum: ["NEW", "CONTACTED", "INTERESTED", "READY_TO_BUY", "CUSTOMER", "LOST"],
            description: "CUSTOMER = ya cerró el negocio; LOST = se perdió",
          },
          note: { type: "string", description: "Nota interna para el equipo" },
        },
        required: ["client"],
        additionalProperties: false,
      },
      async execute(args) {
        const found = await findClient(tenantId, args.client);
        if ("error" in found) return json({ error: found.error });
        const { client } = found;
        const temperature = (["HOT", "WARM", "COLD"] as const).find((t) => t === args.temperature) ?? null;
        const stage = (Object.keys(STAGE_LABEL) as LeadStage[]).find((s) => s === args.stage) ?? null;
        const note = text(args.note);
        if (!temperature && !stage && !note) return json({ error: "No indicaste qué cambiar." });

        const changes: string[] = [];
        if (temperature || stage) {
          const lead = await prisma.lead.findFirst({
            where: { tenantId, clientId: client.id },
            orderBy: { updatedAt: "desc" },
          });
          if (!lead) return json({ error: `${clientLabel(client)} no tiene un proceso de compra o venta abierto.` });
          await prisma.lead.update({
            where: { id: lead.id },
            data: { ...(temperature ? { temperature } : {}), ...(stage ? { stage } : {}) },
          });
          if (temperature) changes.push(`temperatura: ${TEMPERATURE_LABEL[temperature]}`);
          if (stage) changes.push(`etapa: ${STAGE_LABEL[stage]}`);
        }
        if (note) {
          await prisma.client.update({ where: { id: client.id }, data: { notes: appendMemory(client.notes, note) } });
          changes.push("nota guardada");
        }
        return json({ ok: true, cliente: clientLabel(client), cambios: changes });
      },
    },

    {
      name: "list_waiting_conversations",
      description: "Conversaciones que la IA pasó a una persona y están esperando respuesta del equipo.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      async execute() {
        const conversations = await prisma.conversation.findMany({
          where: { tenantId, status: "PENDING_REVIEW" },
          include: {
            client: { select: { name: true, phone: true } },
            messages: { where: { direction: "INBOUND" }, orderBy: { sentAt: "desc" }, take: 1 },
          },
          orderBy: { lastMessageAt: "desc" },
          take: MAX_ITEMS,
        });
        if (conversations.length === 0) return json({ resultado: "No hay conversaciones esperando a una persona." });
        return json(
          conversations.map((c) => ({
            cliente: clientLabel(c.client),
            ultimoMensajeDelCliente: c.messages[0]?.content.slice(0, 200) ?? null,
            hora: when(c.lastMessageAt),
          })),
        );
      },
    },

    {
      name: "message_client",
      description:
        "Envía un mensaje por WhatsApp a un cliente en nombre del asesor y pausa la IA en esa conversación (la toma una persona). " +
        "Primero muéstrale al asesor el texto exacto y pregúntale si lo envías; llama con confirmed=true solo cuando diga que sí.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Nombre o teléfono del cliente" },
          text: { type: "string", description: "El mensaje exacto que recibirá el cliente" },
          confirmed: { type: "boolean", description: "true solo si el asesor aprobó este texto exacto" },
        },
        required: ["client", "text", "confirmed"],
        additionalProperties: false,
      },
      async execute(args) {
        const body = text(args.text);
        if (!body) return json({ error: "El mensaje está vacío." });
        const found = await findClient(tenantId, args.client);
        if ("error" in found) return json({ error: found.error });
        const { client } = found;
        if (args.confirmed !== true) {
          return json({ pendiente: "Muéstrale al asesor el texto y pregúntale si lo envías.", cliente: clientLabel(client), texto: body });
        }
        let delivery;
        try {
          delivery = await deliverOrQueue(ctx.whatsapp, tenantId, client, body, { userId: ctx.userId, source: "asesor" });
        } catch (err) {
          const detail = err instanceof Error ? err.message : "error desconocido";
          return json({ error: `No se pudo enviar: ${detail}` });
        }
        if (delivery.status === "queued") {
          return json({
            pendiente: true,
            cliente: clientLabel(client),
            motivo: delivery.reason,
            queSigue: "El mensaje sale apenas el cliente vuelva a escribir (dentro de los próximos 7 días). Díselo al asesor.",
          });
        }
        const conversation = await latestConversation(tenantId, client.id);
        if (conversation) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { aiPausedUntil: new Date(Date.now() + HANDOFF_PAUSE_MS), status: "OPEN" },
          });
        }
        return json({ ok: true, enviadoA: clientLabel(client), iaPausada: "2 horas" });
      },
    },

    {
      name: "resume_ai",
      description: "Vuelve a activar la IA en la conversación de un cliente (después de que la atendió una persona).",
      parameters: {
        type: "object",
        properties: { client: { type: "string", description: "Nombre o teléfono del cliente" } },
        required: ["client"],
        additionalProperties: false,
      },
      async execute(args) {
        const found = await findClient(tenantId, args.client);
        if ("error" in found) return json({ error: found.error });
        const conversation = await latestConversation(tenantId, found.client.id);
        if (!conversation) return json({ error: "Ese cliente no tiene conversación." });
        await prisma.conversation.update({ where: { id: conversation.id }, data: { aiPausedUntil: null, status: "OPEN" } });
        return json({ ok: true, cliente: clientLabel(found.client) });
      },
    },
  ];

  if (!brokerage) return common;

  const brokerageTools: AITool[] = [
    {
      name: "list_appointments",
      description: "Citas (visitas y pruebas de manejo). range: today, tomorrow, week (próximos 7 días) o pending (por confirmar).",
      parameters: {
        type: "object",
        properties: {
          range: { type: "string", enum: ["today", "tomorrow", "week", "pending"] },
          mine: { type: "boolean", description: "true para ver solo las citas asignadas al asesor que escribe" },
        },
        required: ["range"],
        additionalProperties: false,
      },
      async execute(args) {
        const range = args.range;
        const where =
          range === "pending"
            ? { status: "REQUESTED" as const }
            : {
                status: { in: ["CONFIRMED" as const, "REQUESTED" as const] },
                scheduledAt: {
                  gte: bogotaDayStart(range === "tomorrow" ? 1 : 0),
                  lt: bogotaDayStart(range === "today" ? 1 : range === "tomorrow" ? 2 : 7),
                },
              };
        const appointments = await prisma.appointment.findMany({
          where: { tenantId, ...where, ...(args.mine === true && ctx.userId ? { assignedUserId: ctx.userId } : {}) },
          include: {
            client: { select: { name: true, phone: true } },
            listing: { select: { code: true, title: true, exactAddress: true } },
            assignedUser: { select: { name: true } },
          },
          orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
          take: MAX_ITEMS * 2,
        });
        if (appointments.length === 0) return json({ resultado: "No hay citas en ese rango." });
        return json(
          appointments.map((a) => ({
            cliente: clientLabel(a.client),
            estado: a.status === "CONFIRMED" ? "confirmada" : "por confirmar",
            fecha: when(a.scheduledAt),
            pidio: a.requestedSlot,
            bien: a.listing ? `${a.listing.title} (${a.listing.code})` : null,
            direccion: a.listing?.exactAddress ?? null,
            asesor: a.assignedUser?.name ?? null,
            notas: a.notes,
          })),
        );
      },
    },

    {
      name: "update_appointment",
      description:
        "Confirma, mueve, cancela o marca como realizada la cita activa de un cliente. Para confirmar o mover pasa scheduledAt en ISO 8601 con zona de Colombia (ej: 2026-10-23T15:00:00-05:00). Se refleja en el calendario conectado.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Nombre o teléfono del cliente" },
          action: { type: "string", enum: ["confirm", "cancel", "done"] },
          scheduledAt: { type: "string", description: "Fecha y hora acordadas (obligatoria para confirmar si no la tenía)" },
          notes: { type: "string" },
          clientMessageHints: {
            type: "string",
            description:
              "Lo que el asesor pidió decirle al cliente en el aviso de confirmación (ej: que traiga la cédula). El aviso lo redacta el agente.",
          },
        },
        required: ["client", "action"],
        additionalProperties: false,
      },
      async execute(args) {
        const found = await findClient(tenantId, args.client);
        if ("error" in found) return json({ error: found.error });
        const appointment = await prisma.appointment.findFirst({
          where: { tenantId, clientId: found.client.id, status: { in: ["REQUESTED", "CONFIRMED"] } },
          orderBy: { createdAt: "desc" },
        });
        if (!appointment) return json({ error: `${clientLabel(found.client)} no tiene citas activas.` });

        const rawDate = text(args.scheduledAt);
        const scheduledAt = rawDate ? new Date(rawDate) : null;
        if (rawDate && Number.isNaN(scheduledAt!.getTime())) return json({ error: "La fecha no es válida." });
        const status = args.action === "cancel" ? "CANCELLED" : args.action === "done" ? "DONE" : "CONFIRMED";
        if (status === "CONFIRMED" && !scheduledAt && !appointment.scheduledAt) {
          return json({ error: `Falta la fecha y hora. El cliente pidió: "${appointment.requestedSlot}".` });
        }
        const notes = text(args.notes);
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: {
            status,
            ...(scheduledAt ? { scheduledAt } : {}),
            ...(notes ? { notes } : {}),
            ...(status === "CONFIRMED" && !appointment.assignedUserId && ctx.userId ? { assignedUserId: ctx.userId } : {}),
          },
        });
        const sync = await scheduling.syncFromPanel(tenantId, appointment.id).catch((err: unknown) => ({
          synced: false,
          error: err instanceof Error ? err.message : "error del calendario",
        }));
        const notice = await sendConfirmationNotice(ctx.whatsapp, tenantId, appointment.id, appointment, ctx.userId, {
          ai: ctx.ai,
          instructions: text(args.clientMessageHints),
        });
        return json({
          ok: true,
          cliente: clientLabel(found.client),
          estado: status === "CONFIRMED" ? "confirmada" : status === "CANCELLED" ? "cancelada" : "realizada",
          fecha: when(scheduledAt ?? appointment.scheduledAt),
          calendario: sync.synced ? "actualizado" : sync.error ? `no se pudo actualizar: ${sync.error}` : "sin calendario conectado",
          avisoAlCliente:
            notice.status === "sent"
              ? "ya se le envió la confirmación con el día y la hora; no se la repitas"
              : notice.status === "queued"
                ? `queda pendiente: sale apenas el cliente vuelva a escribir (${notice.reason})`
                : notice.status === "failed"
                ? `no se pudo enviar (${notice.error}); ofrece avisarle con message_client`
                : "no se envió aviso automático; avísale con message_client si hace falta",
        });
      },
    },

    {
      name: "search_inventory",
      description:
        "Busca bienes del inventario, incluidos los datos privados (propietario, teléfono, dirección exacta, notas). Sin query trae los más recientes.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Código (INV-0001), marca, tipo, barrio o ciudad" },
          status: { type: "string", enum: ["PENDING_REVIEW", "AVAILABLE", "RESERVED", "SOLD"] },
        },
        required: [],
        additionalProperties: false,
      },
      async execute(args) {
        const query = text(args.query);
        const status = (Object.keys(LISTING_STATUS_LABEL) as ListingStatus[]).find((s) => s === args.status);
        const listings = await prisma.listing.findMany({
          where: {
            tenantId,
            ...(status ? { status } : { status: { not: "ARCHIVED" } }),
            ...(query
              ? {
                  OR: [
                    { title: { contains: query, mode: "insensitive" } },
                    { code: { contains: query, mode: "insensitive" } },
                    { city: { contains: query, mode: "insensitive" } },
                    { zone: { contains: query, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          include: { _count: { select: { leads: true } } },
          orderBy: { updatedAt: "desc" },
          take: MAX_ITEMS,
        });
        if (listings.length === 0) return json({ resultado: "No encontré bienes con esa búsqueda." });
        return json(
          listings.map((l) => ({
            codigo: l.code,
            titulo: l.title,
            precio: formatCop(l.priceCop),
            estado: LISTING_STATUS_LABEL[l.status],
            ubicacion: [l.zone, l.city].filter(Boolean).join(", "),
            interesados: l._count.leads,
            propietario: l.ownerName,
            telefonoPropietario: l.ownerPhone,
            direccionExacta: l.exactAddress,
            notasPrivadas: l.privateNotes,
          })),
        );
      },
    },

    {
      name: "set_listing_status",
      description:
        "Cambia el estado de un bien: AVAILABLE (aprobar o volver a publicar), RESERVED, SOLD o ARCHIVED. Al publicarlo se buscan compradores que coincidan.",
      parameters: {
        type: "object",
        properties: {
          listing: { type: "string", description: "Código (INV-0001) o nombre del bien" },
          status: { type: "string", enum: ["AVAILABLE", "RESERVED", "SOLD", "ARCHIVED"] },
        },
        required: ["listing", "status"],
        additionalProperties: false,
      },
      async execute(args) {
        const status = (["AVAILABLE", "RESERVED", "SOLD", "ARCHIVED"] as const).find((s) => s === args.status);
        if (!status) return json({ error: "Estado no válido." });
        const listing = await findListing(tenantId, args.listing, ["PENDING_REVIEW", "AVAILABLE", "RESERVED", "SOLD"]);
        if (!listing) return json({ error: "No encontré ese bien. Usa search_inventory para ver el código." });
        await prisma.listing.update({ where: { id: listing.id }, data: { status } });

        let compradoresQueCoinciden = 0;
        if (status === "AVAILABLE" && listing.status !== "AVAILABLE") {
          compradoresQueCoinciden = await matching
            .findMatchesForListing(tenantId, listing.id)
            .then((r) => r.created)
            .catch((err) => {
              console.error("[advisor] no se pudieron buscar compradores:", err);
              return 0;
            });
        }
        return json({
          ok: true,
          bien: `${listing.title} (${listing.code})`,
          antes: LISTING_STATUS_LABEL[listing.status],
          ahora: LISTING_STATUS_LABEL[status],
          ...(status === "AVAILABLE" ? { compradoresQueCoinciden } : {}),
        });
      },
    },

    {
      name: "list_pending_matches",
      description: "Coincidencias por enviar: compradores a los que les puede interesar un bien que entró, con el mensaje sugerido.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      async execute() {
        const matches = await prisma.listingMatch.findMany({
          where: { tenantId, status: { in: ["PENDING", "FAILED"] } },
          include: {
            lead: { include: { client: { select: { name: true, phone: true } } } },
            listing: { select: { code: true, title: true } },
          },
          orderBy: [{ score: "desc" }, { createdAt: "desc" }],
          take: MAX_ITEMS,
        });
        if (matches.length === 0) return json({ resultado: "No hay coincidencias por enviar." });
        return json(
          matches.map((m) => ({
            cliente: clientLabel(m.lead.client ?? { name: m.lead.contactName, phone: m.lead.phone }),
            bien: `${m.listing.title} (${m.listing.code})`,
            porQue: m.reasons,
            mensajeSugerido: m.message,
            ...(m.status === "FAILED" ? { fallo: m.error } : {}),
          })),
        );
      },
    },

    {
      name: "decide_match",
      description:
        "Envía o descarta una coincidencia (comprador + bien). Para enviar, confirma antes con el asesor; puede cambiar el mensaje.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Nombre o teléfono del comprador" },
          listing: { type: "string", description: "Código o nombre del bien" },
          action: { type: "string", enum: ["send", "dismiss"] },
          message: { type: "string", description: "Mensaje a enviar si el asesor lo cambió; si no, va el sugerido" },
        },
        required: ["client", "listing", "action"],
        additionalProperties: false,
      },
      async execute(args) {
        const found = await findClient(tenantId, args.client);
        if ("error" in found) return json({ error: found.error });
        const listing = await findListing(tenantId, args.listing, ["AVAILABLE", "RESERVED"]);
        if (!listing) return json({ error: "No encontré ese bien." });
        const match = await prisma.listingMatch.findFirst({
          where: { tenantId, listingId: listing.id, lead: { clientId: found.client.id }, status: { in: ["PENDING", "FAILED"] } },
        });
        if (!match) return json({ error: "No hay una coincidencia pendiente entre ese cliente y ese bien." });
        if (args.action === "dismiss") {
          await matching.dismiss(tenantId, match.id, ctx.userId);
          return json({ ok: true, descartada: true });
        }
        const result = await matching.send(tenantId, match.id, { userId: ctx.userId, message: text(args.message) ?? undefined });
        return json(result.status === "SENT" ? { ok: true, enviadoA: clientLabel(found.client) } : { error: result.error });
      },
    },
  ];

  return [...common, ...brokerageTools];
}
