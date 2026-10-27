import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import { SIMULATED_DOMAIN } from "@shared/domain/wa-jid";
import type { AIProvider, ChatMessage, ChatTurnOutput } from "../domain/ports/ai-provider";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import { buildBusinessContext, buildSystemPrompt, buildTurnContext, type SystemPromptInput } from "../infrastructure/system-prompt";
import { runSalesGraph, type TraceStep } from "../infrastructure/graph/sales-graph";
import { buildTools } from "../infrastructure/tools";
import { buildBrokerageTools, formatLeadQualification } from "../infrastructure/brokerage-tools";
import { loadActiveRules } from "../infrastructure/ai-rules";
import { GRAPH_PROFILES } from "../infrastructure/graph/profiles";
import { estimateCostMicroUsd } from "../infrastructure/pricing";
import { buildCollectionTools } from "../infrastructure/collection-tools";
import { aiCollections } from "@modules/collections/application/collections.use-cases";
import { collectionsCatalog } from "@modules/collections/domain/collections";
import { formatClientProfile, resumeNote } from "../domain/client-memory";
import { agentPermissionsFrom, filterToolsByPermissions, hasPermission, permissionRestrictions } from "../domain/agent-permissions";
import { aiBudgetExhausted } from "@modules/billing/application/usage";
import { canRespond, countWaitMessage } from "@modules/billing/application/response-gate";
import { waitMessage } from "@modules/billing/domain/usage-limits";
import type { PlanTier } from "@modules/billing/domain/plans";
import { limitsEnforcement } from "@modules/platform/infrastructure/platform-settings";
import { decideVoiceReply, type VoiceDecision } from "@modules/voice/domain/voice-policy";
import { loadVoiceSettings, logVoiceUsage, saveClip, synthesizeReply, type VoiceSettings } from "@modules/voice/application/voice-runtime";
import { elevenLabsConfigured, geminiConfigured } from "@modules/voice/infrastructure/speech";
import { sendsVoiceNotes } from "@modules/whatsapp/infrastructure/provider-factory";

const FALLBACK_MESSAGE =
  "Disculpa, tuve un problema procesando tu mensaje 🙏 Alguien del equipo te va a responder en un momento.";

export interface RespondInput {
  tenantId: string;
  conversationId: string;
  /** Si llegaron mensajes mientras se respondía el turno anterior, cuándo empezó ese turno. */
  lateSince?: Date;
}

const MAX_CONTEXT_MESSAGES = 20;
/** Pedidos anteriores del cliente que ve el agente. */
const RECENT_ORDERS = 3;

/** Margen para la hora de WhatsApp (en segundos y con algo de retraso) frente a la del servidor. */
const LATE_MARGIN_MS = 2000;

/**
 * Los mensajes que llegaron mientras la IA respondía tienen una hora anterior a esa respuesta,
 * pero la IA no los leyó: se ponen al final para que los conteste ahora.
 */
function arrangeLateInbound<T extends { direction: string; sentAt: Date }>(messages: T[], lateSince?: Date): T[] {
  if (!lateSince) return messages;
  const cutoff = lateSince.getTime() - LATE_MARGIN_MS;
  const isLate = (m: T) => m.direction === "INBOUND" && m.sentAt.getTime() >= cutoff;
  return [...messages.filter((m) => !isLate(m)), ...messages.filter(isLate)];
}

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
  delivery?: VoiceDecision;
  /** De tokensIn, los servidos desde la caché del proveedor */
  cachedTokensIn?: number;
}

const TEXT_ONLY: VoiceDecision = { voice: false, alsoText: false, reason: "por texto" };

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

  async execute({ tenantId, conversationId, lateSince }: RespondInput): Promise<void> {
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
    if (tenant.status !== "ACTIVE") {
      console.log(`[ai respond] SKIP: negocio ${tenant.name} en estado ${tenant.status}`);
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

    const orderedMessages = arrangeLateInbound([...conversation.messages].reverse(), lateSince);
    const last = orderedMessages[orderedMessages.length - 1];
    if (!last || last.direction !== "INBOUND") {
      console.log(`[ai respond] SKIP: último mensaje no es INBOUND (dir=${last?.direction ?? "none"})`);
      return;
    }

    if (!(await this.withinLimits(tenant, conversation))) return;

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
      // Las notas de voz llegan transcritas; el agente sabe que el cliente habló
      const content =
        m.type === "AUDIO" && m.direction === "INBOUND"
          ? m.content
            ? `[Nota de voz] ${m.content}`
            : "[Nota de voz que no se pudo transcribir: pídele amablemente que la escriba]"
          : m.content;
      return {
        role: m.direction === "INBOUND" ? "user" : "assistant",
        content: note ? `${note} ${content}` : content,
      };
    });

    // Permisos del agente: lo que el negocio no le deja leer no entra a su contexto
    const profile = tenant.agentProfile;
    const permissions = agentPermissionsFrom(tenant.aiPermissions, profile);
    const readsClient = hasPermission(permissions, "clients", "read");
    const readsOrders = hasPermission(permissions, "orders", "read");

    // Memoria entre conversaciones: ficha del cliente, lo que ha contado y sus últimos pedidos
    const recentOrders = conversation.clientId && readsOrders
      ? await prisma.order.findMany({
          where: { tenantId, clientId: conversation.clientId },
          orderBy: { createdAt: "desc" },
          take: RECENT_ORDERS,
          include: { items: { select: { quantity: true, productNameSnap: true } } },
        })
      : [];
    const clientProfile = conversation.client && (readsClient || recentOrders.length > 0)
      ? formatClientProfile({
          name: readsClient ? conversation.client.name : "",
          address: readsClient ? conversation.client.address : null,
          city: readsClient ? conversation.client.city : null,
          email: readsClient ? conversation.client.email : null,
          aiMemory: readsClient ? conversation.client.aiMemory : null,
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
    const buyerLead =
      profile === "BROKERAGE" && conversation.clientId && hasPermission(permissions, "leads", "read")
        ? await prisma.lead.findFirst({
            where: { tenantId, clientId: conversation.clientId, leadType: "BUYER", stage: { notIn: ["CUSTOMER", "LOST"] } },
            orderBy: { updatedAt: "desc" },
            include: { listing: { select: { title: true } } },
          })
        : null;
    const qualification = formatLeadQualification(buyerLead);

    // Reglas de negocio editables (tabla ai_rules) y tablas de información que puede consultar
    const [rules, collections] = await Promise.all([loadActiveRules(tenantId, profile), aiCollections(tenantId)]);

    // Voz del agente: solo si el proveedor de WhatsApp manda audios y la voz elegida está disponible
    const voice = await loadVoiceSettings(tenantId);
    const voiceAvailable =
      sendsVoiceNotes(this.whatsapp) && (voice.provider === "ELEVENLABS" ? elevenLabsConfigured() : geminiConfigured());
    const voicePolicy = { ...voice, enabled: voice.enabled && voiceAvailable };
    const clientSentAudio = last.type === "AUDIO";

    // Los clientes creados automáticamente se llaman "Cliente 1234": ese nombre no sirve para saludar
    const clientName = readsClient ? conversation.client?.name : null;
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
      agentRole: tenant.aiAgentRole,
      personality: tenant.aiPersonality,
      restrictions: permissionRestrictions(permissions, profile),
      collections: collectionsCatalog(collections),
      clientName: clientName && !/^Cliente \d+$/.test(clientName) ? clientName : null,
      clientProfile: [clientProfile, qualification].filter(Boolean).join("\n\n") || null,
    };

    const toolContext = {
      conversationId: conversation.id,
      clientId: conversation.clientId,
      waChatId: conversation.waChatId,
    };
    const allTools =
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
    const tools = [
      ...filterToolsByPermissions(allTools, permissions),
      ...buildCollectionTools(tenantId, collections.map((c) => c.name)),
    ];

    const engine = aiEngine();
    console.log(
      `[ai respond] motor=${engine} proveedor=${this.ai.kind} mensajes=${chatHistory.length} tools=${tools.length}`,
    );
    let result: TurnResult;
    try {
      if (engine === "graph") {
        const graph = await runSalesGraph({
          businessContext: buildBusinessContext(promptInput),
          turnContext: buildTurnContext(promptInput),
          history: chatHistory,
          tools,
          profile: GRAPH_PROFILES[profile],
          handoffRules: rules.filter((r) => r.category === "HANDOFF").map((r) => r.content),
          voice: { policy: voicePolicy, clientSentAudio },
        });
        result = { ...graph };
        for (const step of graph.trace) {
          console.log(
            `[ai graph] ${step.node} · ${step.type}${step.tool ? ` ${step.tool}` : ""}${step.detail ? ` — ${step.detail}` : ""}${
              step.ms !== undefined ? ` (${(step.ms / 1000).toFixed(1)} s)` : ""
            }`,
          );
        }
      } else {
        const simple = await this.ai.chat({
          systemPrompt: buildSystemPrompt(promptInput),
          messages: chatHistory,
          tools,
        });
        result = {
          ...simple,
          provider: this.ai.kind,
          // Sin router no hay reglas de voz: el modo por reglas se comporta como "si el cliente manda audio"
          delivery: decideVoiceReply(voicePolicy, {
            reply: simple.text,
            intent: "",
            clientSentAudio,
            routerSuggestsVoice: clientSentAudio,
          }),
        };
      }
    } catch (err) {
      // 2.5 — la IA falló. NO dejamos al cliente en silencio: enviamos un
      // mensaje de respaldo y dejamos rastro para el operador.
      console.error(`[ai respond] ⚠️ error de IA, enviando fallback:`, err);
      await this.sendFallback(tenantId, conversation);
      return;
    }
    console.log(
      `[ai respond] IA respondió: tools=${result.toolCallsUsed}, tokensIn=${result.tokensIn} (en caché ${result.cachedTokensIn ?? 0}), tokensOut=${result.tokensOut}, textLen=${result.text.length}`,
    );

    // 2.3 — registramos el uso (tokens + costo estimado) por conversación.
    await this.logUsage(tenantId, conversation.id, result);

    const reply = result.text.trim();
    if (!reply) {
      console.log(`[ai respond] SKIP envío: IA devolvió texto vacío`);
      return;
    }

    const delivery = result.delivery ?? TEXT_ONLY;
    const voiceSent = delivery.voice ? await this.sendVoiceReply(tenantId, conversation, voice, reply) : null;

    // Por texto: si no va con voz, si la voz falló o si además lleva los datos escritos
    let sent = voiceSent;
    if (!voiceSent || delivery.alsoText) {
      sent = await this.whatsapp.sendText(tenantId, {
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
    }

    // Pasó a una persona: queda por revisar y la IA no responde por un tiempo
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: sent!.sentAt,
        ...(result.handoff
          ? { status: "PENDING_REVIEW", aiPausedUntil: new Date(Date.now() + HANDOFF_PAUSE_MS) }
          : {}),
      },
    });
  }

  /**
   * Nota de voz con la respuesta: se genera con la voz del negocio, se envía, se guarda para escucharla
   * en el panel y su costo entra al presupuesto. Si algo falla devuelve null y la respuesta sale por texto.
   */
  private async sendVoiceReply(
    tenantId: string,
    conversation: { id: string; waChatId: string },
    settings: VoiceSettings,
    reply: string,
  ): Promise<{ providerMessageId: string; sentAt: Date } | null> {
    try {
      const started = Date.now();
      const audio = await synthesizeReply(settings, reply);
      const sent = await this.whatsapp.sendVoice!(tenantId, { to: conversation.waChatId, audio: audio.ogg, seconds: audio.seconds });
      const mediaUrl = await saveClip({
        tenantId,
        conversationId: conversation.id,
        data: audio.ogg,
        mimeType: "audio/ogg",
        seconds: audio.seconds,
      });
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          waMessageId: sent.providerMessageId,
          direction: "OUTBOUND",
          type: "AUDIO",
          content: reply,
          mediaUrl,
          authoredBy: "AI",
          sentAt: sent.sentAt,
        },
      });
      await logVoiceUsage({
        tenantId,
        conversationId: conversation.id,
        kind: "voz",
        provider: audio.provider,
        model: audio.model,
        tokensIn: audio.unitsIn,
        tokensOut: audio.unitsOut,
        costMicroUsd: audio.costMicroUsd,
        detail: `nota de voz de ${audio.seconds.toFixed(1)} s con ${settings.voiceName ?? settings.voiceId} en ${Date.now() - started} ms`,
      });
      console.log(`[ai respond] nota de voz enviada (${audio.seconds.toFixed(1)} s, ${audio.model})`);
      return sent;
    } catch (err) {
      console.error("[ai respond] ⚠️ no se pudo enviar la nota de voz, va por texto:", err);
      return null;
    }
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
   * Límites de uso del plan (docs/Límites de uso, alertas y recarga). En modo "registro" solo se anota qué
   * habría pasado y sigue el freno anterior (sin saldo, no responde). En modo "activo", al llegar al tope los
   * chats abiertos siguen 48 h y los clientes nuevos reciben un mensaje fijo, sin IA, y pasan al equipo.
   * El simulador no cuenta para el cupo. Devuelve si la IA puede responder.
   */
  private async withinLimits(
    tenant: { id: string; name: string; plan: PlanTier },
    conversation: { id: string; waChatId: string },
  ): Promise<boolean> {
    const simulated = conversation.waChatId.endsWith(SIMULATED_DOMAIN);
    const enforcement = await limitsEnforcement();
    if (!simulated) {
      try {
        const decision = await canRespond(tenant, conversation.id);
        if (decision.mode !== "IA") {
          console.log(
            `[limites] ${tenant.name}: ${decision.mode} — ${decision.reason}${enforcement === "registro" ? " (solo registro, no se aplica)" : ""}`,
          );
        }
        if (enforcement === "activo") {
          if (decision.mode === "ESPERA") await this.sendWaitMessage(tenant, conversation);
          return decision.mode !== "ESPERA";
        }
      } catch (err) {
        // Si el cálculo falla (por ejemplo, la migración sin aplicar), el agente sigue con el freno anterior
        console.error(`[limites] no se pudo calcular el cupo de ${tenant.name}:`, err);
      }
    }
    if (enforcement === "activo" && simulated) return true;
    if (await aiBudgetExhausted(tenant)) {
      console.log(`[ai respond] SKIP: ${tenant.name} gastó el presupuesto de IA del mes (plan ${tenant.plan})`);
      return false;
    }
    return true;
  }

  /** Mensaje fijo de espera (no gasta IA). La conversación queda para el equipo y la IA en pausa. */
  private async sendWaitMessage(tenant: { id: string; name: string }, conversation: { id: string; waChatId: string }) {
    const text = waitMessage(tenant.name);
    const sent = await this.whatsapp.sendText(tenant.id, { to: conversation.waChatId, text });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        waMessageId: sent.providerMessageId,
        direction: "OUTBOUND",
        type: "TEXT",
        content: text,
        authoredBy: "SYSTEM",
        sentAt: sent.sentAt,
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: sent.sentAt, status: "PENDING_REVIEW", aiPausedUntil: new Date(Date.now() + HANDOFF_PAUSE_MS) },
    });
    await countWaitMessage(tenant.id);
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
      const cachedTokensIn = result.cachedTokensIn ?? 0;
      const costMicroUsd = estimateCostMicroUsd(result.model, result.tokensIn, result.tokensOut, cachedTokensIn);
      await prisma.aiUsageLog.create({
        data: {
          tenantId,
          conversationId,
          provider: result.provider,
          model: result.model,
          tokensIn: result.tokensIn,
          cachedTokensIn,
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
