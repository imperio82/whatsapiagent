import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { AIProvider, ChatMessage, ChatTurnOutput } from "../domain/ports/ai-provider";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import { buildBusinessContext, buildSystemPrompt, type SystemPromptInput } from "../infrastructure/system-prompt";
import { runSalesGraph, type TraceStep } from "../infrastructure/graph/sales-graph";
import { buildTools } from "../infrastructure/tools";
import { buildBrokerageTools, formatLeadQualification } from "../infrastructure/brokerage-tools";
import { loadActiveRules } from "../infrastructure/ai-rules";
import { GRAPH_PROFILES } from "../infrastructure/graph/profiles";
import { estimateCostMicroUsd } from "../infrastructure/pricing";
import { formatClientProfile, resumeNote } from "../domain/client-memory";

const FALLBACK_MESSAGE =
  "Disculpa, tuve un problema procesando tu mensaje 🙏 Alguien del equipo te va a responder en un momento.";

export interface RespondInput {
  tenantId: string;
  conversationId: string;
}

const MAX_CONTEXT_MESSAGES = 20;
/** Pedidos anteriores del cliente que ve el agente. */
const RECENT_ORDERS = 3;

/** Tiempo que la IA deja de responder una conversación después de pasarla a una persona. */
const HANDOFF_PAUSE_MS = 2 * 60 * 60 * 1000;

/**
 * Motor de respuesta (AI_ENGINE en el .env):
 * - "graph" (por defecto): grafo multiagente con router, especialistas y verificador.
 * - "simple": un solo agente con todas las herramientas.
 */
function aiEngine(): "graph" | "simple" {
  return process.env.AI_ENGINE === "simple" ? "simple" : "graph";
}

interface TurnResult extends ChatTurnOutput {
  provider: string;
  intent?: string;
  handoff?: boolean;
  trace?: TraceStep[];
}

/**
 * Extrae el primer teléfono parseable de un texto libre.
 * Acepta dígitos con +, espacios, guiones, paréntesis. Requiere 8–15
 * dígitos (E.164). Devuelve solo dígitos, sin prefijo +.
 */
function extractPhone(text: string): string | null {
  // Buscar secuencias que parezcan teléfono: opcional +, luego dígitos
  // con separadores. Tomamos la primera que tenga 8-15 dígitos.
  const matches = text.matchAll(/\+?\d[\d\s\-().]{6,20}\d/g);
  for (const m of matches) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) {
      return digits;
    }
  }
  return null;
}

/**
 * Genera y envía una respuesta automática para el último mensaje de una
 * conversación. Solo corre si el tenant tiene `aiAutoReply=true`.
 *
 * No usa TenantContext (corre fuera de HTTP, lo dispara el provider).
 */
export class RespondToMessageUseCase implements UseCase<RespondInput, void> {
  constructor(
    private readonly ai: AIProvider,
    private readonly whatsapp: WhatsAppProvider,
  ) {}

  async execute({ tenantId, conversationId }: RespondInput): Promise<void> {
    console.log(`[ai respond] inicio: tenant=${tenantId} conv=${conversationId}`);
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      console.log(`[ai respond] SKIP: tenant no encontrado`);
      return;
    }
    if (!tenant.aiAutoReply) {
      console.log(`[ai respond] SKIP: aiAutoReply=false para tenant ${tenant.name}`);
      return;
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: {
        client: true,
        messages: { orderBy: { sentAt: "desc" }, take: MAX_CONTEXT_MESSAGES },
      },
    });
    if (!conversation) {
      console.log(`[ai respond] SKIP: conversation no encontrada`);
      return;
    }

    if (conversation.aiPausedUntil && conversation.aiPausedUntil > new Date()) {
      console.log(`[ai respond] SKIP: IA en pausa hasta ${conversation.aiPausedUntil.toISOString()} (la atiende una persona)`);
      return;
    }

    const last = conversation.messages[0];
    if (!last || last.direction !== "INBOUND") {
      console.log(`[ai respond] SKIP: último mensaje no es INBOUND (dir=${last?.direction ?? "none"})`);
      return;
    }

    const orderedMessages = [...conversation.messages].reverse();

    // Flujo especial LID
    const isLid = conversation.waChatId.endsWith("@lid");
    const clientPhone = conversation.client?.phone ?? "";
    const hasRealPhone = !!clientPhone && !clientPhone.startsWith("lid:");
    console.log(
      `[ai respond] jid=${conversation.waChatId} isLid=${isLid} hasRealPhone=${hasRealPhone} clientPhone=${clientPhone || "—"}`,
    );
    if (isLid && !hasRealPhone) {
      const handled = await this.handleLidPhoneRequest(
        tenantId,
        conversation,
        orderedMessages,
        last.content,
      );
      if (handled) {
        console.log(`[ai respond] flow LID gestionó la respuesta. Fin.`);
        return;
      }
      console.log(`[ai respond] flow LID NO manejó (ya se pidió). Cayendo a IA normal.`);
    }

    // "Escribiendo…" mientras la IA piensa (si el proveedor lo soporta). No se espera:
    // si falla, la respuesta sale igual.
    if (last.waMessageId && this.whatsapp.showTyping) {
      this.whatsapp
        .showTyping(tenantId, { to: conversation.waChatId, inboundMessageId: last.waMessageId })
        .catch((err) => console.warn("[ai respond] no se pudo mostrar 'escribiendo':", err));
    }

    // Si el cliente retoma después de horas o días, se le avisa al agente en el mismo mensaje
    const chatHistory: ChatMessage[] = orderedMessages.map((m, i) => {
      const note = m.direction === "INBOUND" ? resumeNote(orderedMessages[i - 1]?.sentAt ?? null, m.sentAt) : null;
      return {
        role: m.direction === "INBOUND" ? "user" : "assistant",
        content: note ? `${note} ${m.content}` : m.content,
      };
    });

    // Memoria entre conversaciones: ficha del cliente, lo que ha contado y sus últimos pedidos
    const recentOrders = conversation.clientId
      ? await prisma.order.findMany({
          where: { tenantId, clientId: conversation.clientId },
          orderBy: { createdAt: "desc" },
          take: RECENT_ORDERS,
          include: { items: { select: { quantity: true, productNameSnap: true } } },
        })
      : [];
    const clientProfile = conversation.client
      ? formatClientProfile({
          name: conversation.client.name,
          address: conversation.client.address,
          city: conversation.client.city,
          email: conversation.client.email,
          aiMemory: conversation.client.aiMemory,
          orders: recentOrders.map((o) => ({
            code: o.code,
            createdAt: o.createdAt,
            status: o.status,
            totalMajor: o.totalCents / 100,
            items: o.items.map((i) => ({ quantity: i.quantity, name: i.productNameSnap })),
          })),
        })
      : null;

    // Intermediación: lo que el comprador ya respondió, para no volver a preguntarlo
    const profile = tenant.agentProfile;
    const buyerLead =
      profile === "BROKERAGE" && conversation.clientId
        ? await prisma.lead.findFirst({
            where: { tenantId, clientId: conversation.clientId, leadType: "BUYER", stage: { notIn: ["CUSTOMER", "LOST"] } },
            orderBy: { updatedAt: "desc" },
            include: { listing: { select: { title: true } } },
          })
        : null;
    const qualification = formatLeadQualification(buyerLead);

    // Reglas de negocio editables (tabla ai_rules)
    const rules = await loadActiveRules(tenantId, profile);

    // Los clientes creados automáticamente se llaman "Cliente 1234": ese nombre no sirve para saludar
    const clientName = conversation.client?.name;
    const promptInput: SystemPromptInput = {
      profile,
      rules,
      businessName: tenant.name,
      industry: tenant.industry,
      description: tenant.description,
      address: tenant.address,
      businessHours: tenant.businessHours,
      deliveryInfo: tenant.deliveryInfo,
      paymentInfo: tenant.paymentInfo,
      faq: tenant.faq,
      agentName: tenant.aiAgentName ?? undefined,
      clientName: clientName && !/^Cliente \d+$/.test(clientName) ? clientName : null,
      clientProfile: [clientProfile, qualification].filter(Boolean).join("\n\n") || null,
    };

    const toolContext = {
      conversationId: conversation.id,
      clientId: conversation.clientId,
      waChatId: conversation.waChatId,
    };
    const tools =
      profile === "BROKERAGE"
        ? buildBrokerageTools(tenantId, {
            ...toolContext,
            notifyOwner: tenant.ownerNotifyPhone
              ? async (text) => {
                  await this.whatsapp.sendText(tenantId, { to: tenant.ownerNotifyPhone!, text });
                }
              : undefined,
          })
        : buildTools(tenantId, toolContext);

    const engine = aiEngine();
    console.log(
      `[ai respond] motor=${engine} proveedor=${this.ai.kind} mensajes=${chatHistory.length} tools=${tools.length}`,
    );
    let result: TurnResult;
    try {
      if (engine === "graph") {
        const graph = await runSalesGraph({
          businessContext: buildBusinessContext(promptInput),
          history: chatHistory,
          tools,
          profile: GRAPH_PROFILES[profile],
          handoffRules: rules.filter((r) => r.category === "HANDOFF").map((r) => r.content),
        });
        result = { ...graph };
        for (const step of graph.trace) {
          console.log(`[ai graph] ${step.node} · ${step.type}${step.tool ? ` ${step.tool}` : ""}${step.detail ? ` — ${step.detail}` : ""}`);
        }
      } else {
        const simple = await this.ai.chat({
          systemPrompt: buildSystemPrompt(promptInput),
          messages: chatHistory,
          tools,
        });
        result = { ...simple, provider: this.ai.kind };
      }
    } catch (err) {
      // 2.5 — la IA falló. NO dejamos al cliente en silencio: enviamos un
      // mensaje de respaldo y dejamos rastro para el operador.
      console.error(`[ai respond] ⚠️ error de IA, enviando fallback:`, err);
      await this.sendFallback(tenantId, conversation);
      return;
    }
    console.log(
      `[ai respond] IA respondió: tools=${result.toolCallsUsed}, tokensIn=${result.tokensIn}, tokensOut=${result.tokensOut}, textLen=${result.text.length}`,
    );

    // 2.3 — registramos el uso (tokens + costo estimado) por conversación.
    await this.logUsage(tenantId, conversation.id, result);

    const reply = result.text.trim();
    if (!reply) {
      console.log(`[ai respond] SKIP envío: IA devolvió texto vacío`);
      return;
    }

    // Enviar por WhatsApp
    const sent = await this.whatsapp.sendText(tenantId, {
      to: conversation.waChatId,
      text: reply,
    });

    // Persistir como mensaje autoría IA
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        waMessageId: sent.providerMessageId,
        direction: "OUTBOUND",
        type: "TEXT",
        content: reply,
        authoredBy: "AI",
        sentAt: sent.sentAt,
      },
    });

    // Pasó a una persona: queda por revisar y la IA no responde por un tiempo
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: sent.sentAt,
        ...(result.handoff
          ? { status: "PENDING_REVIEW", aiPausedUntil: new Date(Date.now() + HANDOFF_PAUSE_MS) }
          : {}),
      },
    });
  }

  /**
   * Intenta capturar el teléfono real de un cliente LID:
   * - Si el último mensaje contiene un teléfono parseable: lo guarda en
   *   Client.phone y confirma. Devuelve true (mensaje manejado).
   * - Si nunca pedimos antes: pedimos el teléfono. Devuelve true.
   * - Si ya pedimos y el cliente sigue conversando sin mandar número:
   *   devolvemos false para que la IA responda normalmente — NO
   *   insistimos con el pedido en cada mensaje.
   */
  private async handleLidPhoneRequest(
    tenantId: string,
    conversation: { id: string; waChatId: string; client: { id: string; phone: string } | null },
    orderedMessages: Array<{ direction: "INBOUND" | "OUTBOUND"; authoredBy: "CLIENT" | "AGENT" | "AI" | "SYSTEM" }>,
    lastInboundText: string,
  ): Promise<boolean> {
    // Prioridad 1: si el cliente mandó un teléfono, capturarlo.
    const phone = extractPhone(lastInboundText);
    if (phone && conversation.client) {
      await prisma.client.update({
        where: { id: conversation.client.id },
        data: { phone },
      });
      await this.sendAiMessage(
        tenantId,
        conversation,
        `¡Perfecto! Anoté tu número (+${phone}). Para poder escribirte los detalles, agrégame como contacto en tu WhatsApp y avísame cuando lo hayas hecho ✅`,
      );
      return true;
    }

    // Prioridad 2: si nunca le pedimos antes, pedirlo una sola vez.
    const alreadyAsked = orderedMessages.some(
      (m) => m.direction === "OUTBOUND" && m.authoredBy === "AI",
    );
    if (!alreadyAsked) {
      await this.sendAiMessage(
        tenantId,
        conversation,
        "¡Hola! 👋 Para atenderte mejor, ¿me compartes tu número de WhatsApp completo con el indicativo del país (ej: +57 300 123 4567)? Mientras tanto, cuéntame en qué te puedo ayudar 😊",
      );
      return true;
    }

    // Ya pedimos y no nos lo dio. No insistimos: dejamos que la IA
    // responda normal — el banner UI ya alerta al operador del riesgo.
    return false;
  }

  /**
   * Envía un mensaje de respaldo cuando la IA falla. Tolerante a fallos: si
   * el envío también falla, lo loguea pero no propaga (no queremos romper el
   * pipeline de inbound).
   */
  private async sendFallback(
    tenantId: string,
    conversation: { id: string; waChatId: string },
  ): Promise<void> {
    try {
      await this.sendAiMessage(tenantId, conversation, FALLBACK_MESSAGE);
    } catch (err) {
      console.error(`[ai respond] ⚠️ falló también el envío del fallback:`, err);
    }
  }

  /**
   * Persiste el uso de IA (tokens + costo estimado) del turno. Tolerante a
   * fallos: si la tabla aún no existe o el insert falla, no rompe la respuesta.
   */
  private async logUsage(
    tenantId: string,
    conversationId: string,
    result: TurnResult,
  ): Promise<void> {
    try {
      const costMicroUsd = estimateCostMicroUsd(result.model, result.tokensIn, result.tokensOut);
      await prisma.aiUsageLog.create({
        data: {
          tenantId,
          conversationId,
          provider: result.provider,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          toolCalls: result.toolCallsUsed,
          costMicroUsd,
          intent: result.intent ?? null,
          trace: result.trace ? JSON.parse(JSON.stringify(result.trace)) : undefined,
        },
      });
      console.log(
        `[ai respond] uso registrado: ${result.model} costo≈$${(costMicroUsd / 1_000_000).toFixed(6)}`,
      );
    } catch (err) {
      console.error(`[ai respond] no se pudo registrar el uso de IA:`, err);
    }
  }

  private async sendAiMessage(
    tenantId: string,
    conversation: { id: string; waChatId: string },
    text: string,
  ): Promise<void> {
    const sent = await this.whatsapp.sendText(tenantId, {
      to: conversation.waChatId,
      text,
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        waMessageId: sent.providerMessageId,
        direction: "OUTBOUND",
        type: "TEXT",
        content: text,
        authoredBy: "AI",
        sentAt: sent.sentAt,
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: sent.sentAt },
    });
  }
}
