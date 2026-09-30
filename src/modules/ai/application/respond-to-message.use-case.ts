import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { AIProvider, ChatMessage, ChatTurnOutput } from "../domain/ports/ai-provider";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import { buildSystemPrompt } from "../infrastructure/system-prompt";
import { buildTools } from "../infrastructure/tools";
import { estimateCostMicroUsd } from "../infrastructure/pricing";

const FALLBACK_MESSAGE =
  "Disculpá, tuve un problema procesando tu mensaje 🙏 Un agente humano te va a responder en un momento.";

export interface RespondInput {
  tenantId: string;
  conversationId: string;
}

const MAX_CONTEXT_MESSAGES = 20;

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

    const chatHistory: ChatMessage[] = orderedMessages.map((m) => ({
      role: m.direction === "INBOUND" ? "user" : "assistant",
      content: m.content,
    }));

    const systemPrompt = buildSystemPrompt({
      businessName: tenant.name,
      industry: tenant.industry,
      description: tenant.description,
      agentName: tenant.aiAgentName ?? undefined,
    });

    const tools = buildTools(tenantId, {
      conversationId: conversation.id,
      clientId: conversation.clientId,
      waChatId: conversation.waChatId,
    });

    console.log(
      `[ai respond] llamando a IA (${this.ai.kind}) con ${chatHistory.length} mensajes y ${tools.length} tools…`,
    );
    let result;
    try {
      result = await this.ai.chat({
        systemPrompt,
        messages: chatHistory,
        tools,
      });
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

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: sent.sentAt },
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
        `¡Perfecto! Anoté tu número (+${phone}). Para que pueda escribirte detalles, agregame como contacto en tu WhatsApp y avisame cuando lo hayas hecho ✅`,
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
        "¡Hola! 👋 Para poder atenderte mejor te pediría tu número de WhatsApp completo (con código de país, ej: +50212345678). Igual contame cómo te puedo ayudar y vamos avanzando 😊",
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
    result: ChatTurnOutput,
  ): Promise<void> {
    try {
      const costMicroUsd = estimateCostMicroUsd(result.model, result.tokensIn, result.tokensOut);
      await prisma.aiUsageLog.create({
        data: {
          tenantId,
          conversationId,
          provider: this.ai.kind,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          toolCalls: result.toolCallsUsed,
          costMicroUsd,
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
