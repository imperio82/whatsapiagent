import { prisma } from "@shared/infrastructure/prisma/client";
import type { InboundMessage, WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import type { AIProvider, ChatMessage } from "../domain/ports/ai-provider";
import { samePhone, senderDigits } from "../domain/advisor-phone";
import { buildAdvisorTools } from "../infrastructure/advisor-tools";
import { estimateCostMicroUsd } from "../infrastructure/pricing";

/**
 * Asistente del asesor por WhatsApp.
 *
 * Cuando escribe al número del negocio alguien del equipo (un miembro con su WhatsApp
 * registrado en Configuración → Equipo, o el número de avisos del negocio), no se le trata
 * como cliente: no se crea ficha ni conversación y le responde un asistente interno que
 * consulta la agenda, los compradores y el inventario, y actúa en el CRM.
 *
 * El historial vive en memoria (por proceso) y se olvida tras unas horas sin mensajes:
 * basta para seguir el hilo ("confírmala para las 3") sin guardar estas charlas en el panel.
 */

export interface Advisor {
  tenantId: string;
  /** Usuario del panel; null si escribe desde el número de avisos sin cuenta asociada. */
  userId: string | null;
  name: string | null;
  phone: string;
}

const HISTORY_MESSAGES = 12;
const HISTORY_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_TOOL_STEPS = 6;
const TIME_ZONE = "America/Bogota";
/** Baileys reentrega mensajes al reconectar: se recuerdan los últimos ids para no responder dos veces. */
const SEEN_IDS_LIMIT = 500;

const FALLBACK = "No pude procesar eso ahora 🙏 Intenta de nuevo en un momento o revisa el panel.";

interface History {
  messages: ChatMessage[];
  updatedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __advisorHistory: Map<string, History> | undefined;
  // eslint-disable-next-line no-var
  var __advisorQueue: Map<string, Promise<void>> | undefined;
  // eslint-disable-next-line no-var
  var __advisorSeen: Set<string> | undefined;
}

// En globalThis para sobrevivir al hot reload de Next en desarrollo
const histories = (globalThis.__advisorHistory ??= new Map<string, History>());
const queues = (globalThis.__advisorQueue ??= new Map<string, Promise<void>>());
const seen = (globalThis.__advisorSeen ??= new Set<string>());

/** El asesor que escribe, o null si el remitente es un cliente (o el negocio apagó el asistente). */
export async function resolveAdvisor(tenantId: string, from: string): Promise<Advisor | null> {
  const digits = senderDigits(from);
  if (!digits) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      advisorAssistant: true,
      ownerNotifyPhone: true,
      memberships: {
        where: { status: "ACTIVE", whatsappPhone: { not: null } },
        select: { userId: true, whatsappPhone: true, user: { select: { name: true } } },
      },
    },
  });
  if (!tenant?.advisorAssistant) return null;

  const member = tenant.memberships.find((m) => samePhone(m.whatsappPhone, digits));
  if (member) return { tenantId, userId: member.userId, name: member.user.name, phone: digits };
  if (samePhone(tenant.ownerNotifyPhone, digits)) return { tenantId, userId: null, name: null, phone: digits };
  return null;
}

function nowInBogota(): string {
  return new Date().toLocaleString("es-CO", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function systemPrompt(input: { businessName: string; advisorName: string | null; brokerage: boolean }): string {
  const firstName = input.advisorName?.split(" ")[0] ?? null;
  return [
    `Eres el asistente interno del equipo de ${input.businessName}. Te escribe por WhatsApp ${firstName ? `${firstName}, un asesor del negocio` : "el dueño o un asesor del negocio"}, no un cliente.`,
    `Ahora en Colombia es ${nowInBogota()}. Las fechas que envíes a las herramientas van en ISO 8601 con zona -05:00.`,
    "",
    "Qué puedes hacer (siempre con las herramientas, nunca de memoria):",
    "- Resumen del día y pendientes.",
    "- Ver compradores y vendedores, su ficha y los últimos mensajes de su conversación; marcarlos caliente/tibio/frío, cambiar la etapa o anotar algo.",
    "- Ver las conversaciones que esperan a una persona, escribirle a un cliente en nombre del asesor y volver a activar la IA.",
    ...(input.brokerage
      ? [
          "- Ver la agenda de citas (hoy, mañana, la semana, por confirmar) y confirmarlas, moverlas, cancelarlas o marcarlas realizadas.",
          "- Buscar en el inventario con los datos privados (propietario, teléfono, dirección exacta) y cambiar el estado de un bien: aprobar, reservar, vendido, archivar.",
          "- Revisar las coincidencias entre bienes nuevos y compradores, y enviarlas o descartarlas.",
        ]
      : []),
    "",
    "Reglas:",
    "- Responde corto y directo, como un compañero de trabajo por WhatsApp. Usa listas con guiones y *negrita* de WhatsApp; nada de tablas ni markdown con #.",
    "- Antes de escribirle a un cliente o enviar una coincidencia, muestra el texto exacto y pregunta si lo envías. Solo envía cuando el asesor diga que sí.",
    "- Si un nombre coincide con varios clientes, pregunta cuál antes de actuar.",
    "- Nunca inventes una hora. Para confirmar o mover una cita necesitas la fecha y hora exactas dichas por el asesor; si el cliente pidió algo vago (\"jueves en la mañana\"), pregunta la hora antes de confirmar.",
    "- Después de cambiar algo, confirma en una línea qué quedó hecho.",
    "- Si piden algo que no puedes hacer, dilo y sugiere hacerlo en el panel.",
    "- Si saludan o piden ayuda, preséntate en dos líneas y da 3 ejemplos de lo que te pueden pedir.",
  ].join("\n");
}

export class AdvisorAssistantUseCase {
  constructor(
    private readonly ai: AIProvider,
    private readonly whatsapp: WhatsAppProvider,
  ) {}

  /** Atiende el mensaje en orden: los mensajes seguidos de un mismo asesor se responden uno tras otro. */
  handle(advisor: Advisor, message: InboundMessage): Promise<void> {
    if (seen.has(message.providerMessageId)) return Promise.resolve();
    seen.add(message.providerMessageId);
    if (seen.size > SEEN_IDS_LIMIT) seen.delete(seen.values().next().value!);

    const key = `${advisor.tenantId}:${advisor.phone}`;
    const run = (queues.get(key) ?? Promise.resolve())
      .then(() => this.respond(key, advisor, message))
      .catch((err) => console.error("[advisor] error:", err));
    queues.set(key, run);
    void run.finally(() => {
      if (queues.get(key) === run) queues.delete(key);
    });
    return run;
  }

  private async respond(key: string, advisor: Advisor, message: InboundMessage): Promise<void> {
    const reply = (text: string) => this.whatsapp.sendText(advisor.tenantId, { to: message.from, text });

    const content = message.text?.trim();
    if (!content) {
      await reply("Por ahora solo leo mensajes de texto ✍️");
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: advisor.tenantId },
      select: { name: true, agentProfile: true },
    });
    if (!tenant) return;

    const previous = histories.get(key);
    const history =
      previous && Date.now() - previous.updatedAt < HISTORY_TTL_MS ? previous.messages : ([] as ChatMessage[]);
    const messages: ChatMessage[] = [...history, { role: "user", content }];

    console.log(`[advisor] ${advisor.name ?? "número de avisos"} (${advisor.phone}) → asistente del asesor`);
    let answer: string;
    try {
      const result = await this.ai.chat({
        systemPrompt: systemPrompt({
          businessName: tenant.name,
          advisorName: advisor.name,
          brokerage: tenant.agentProfile === "BROKERAGE",
        }),
        messages,
        tools: buildAdvisorTools(advisor.tenantId, {
          profile: tenant.agentProfile,
          userId: advisor.userId,
          whatsapp: this.whatsapp,
        }),
        maxToolSteps: MAX_TOOL_STEPS,
      });
      answer = result.text.trim() || FALLBACK;
      await this.logUsage(advisor, result);
    } catch (err) {
      console.error("[advisor] la IA falló:", err);
      await reply(FALLBACK);
      return;
    }

    await reply(answer);
    histories.set(key, {
      messages: [...messages, { role: "assistant" as const, content: answer }].slice(-HISTORY_MESSAGES),
      updatedAt: Date.now(),
    });
  }

  /** Mismo registro de uso que las respuestas a clientes, para que el costo del asistente se vea por negocio. */
  private async logUsage(
    advisor: Advisor,
    result: { model: string; tokensIn: number; tokensOut: number; toolCallsUsed: number },
  ): Promise<void> {
    try {
      await prisma.aiUsageLog.create({
        data: {
          tenantId: advisor.tenantId,
          conversationId: `advisor:${advisor.phone}`,
          provider: this.ai.kind,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          toolCalls: result.toolCallsUsed,
          costMicroUsd: estimateCostMicroUsd(result.model, result.tokensIn, result.tokensOut),
          intent: "advisor",
        },
      });
    } catch (err) {
      console.error("[advisor] no se pudo registrar el uso de IA:", err);
    }
  }
}
