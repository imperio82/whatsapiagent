import { IngestInboundMessageUseCase } from "@modules/conversations/application/ingest-inbound-message.use-case";
import { RespondToMessageUseCase } from "@modules/ai/application/respond-to-message.use-case";
import { AdvisorAssistantUseCase, resolveAdvisor } from "@modules/ai/application/advisor-assistant.use-case";
import { getAIProvider, getFastAIProvider } from "@modules/ai/infrastructure/provider-factory";
import { getWhatsAppProvider, isBaileys } from "./provider-factory";
import { createReplyDebouncer, tenantReplyDelayMs } from "./reply-debouncer";
import { InfrastructureError } from "@shared/domain/errors";
import { transcribeInboundAudio } from "@modules/voice/application/voice-runtime";
import type { InboundMessage } from "../domain/ports/whatsapp-provider";

declare global {
  // eslint-disable-next-line no-var
  var __whatsappWired: boolean | undefined;
  // eslint-disable-next-line no-var
  var __inboundPipeline: ((msg: InboundMessage) => Promise<void>) | undefined;
}

/**
 * Entrada del simulador del panel: el mensaje recorre el mismo pipeline que uno de WhatsApp
 * (asistente del asesor, ingest, espera para agrupar mensajes e IA con sus herramientas).
 */
export async function simulateInbound(msg: InboundMessage): Promise<void> {
  ensureWhatsAppWired();
  if (!globalThis.__inboundPipeline) {
    throw new InfrastructureError("El servidor arrancó con una versión anterior: reinícialo para usar el simulador");
  }
  await globalThis.__inboundPipeline(msg);
}

/**
 * Pipeline de inbound:
 *   0. Si escribe un asesor del negocio, lo atiende el asistente del asesor (no es un cliente)
 *   1. Persistir el mensaje (IngestInboundMessage)
 *   1b. Si es una nota de voz, guardarla y transcribirla para que el agente la lea
 *   2. Si el tenant tiene IA activa y hay OPENAI_API_KEY, responder con IA
 *      después de unos segundos sin mensajes nuevos (ver reply-debouncer.ts)
 *
 * Idempotente — registra handlers una sola vez por proceso.
 * Además rehidrata todas las sesiones Baileys persistidas en disco.
 */
export function ensureWhatsAppWired(): void {
  if (globalThis.__whatsappWired) return;
  globalThis.__whatsappWired = true;

  const wpp = getWhatsAppProvider();
  const ingest = new IngestInboundMessageUseCase();

  let respond: RespondToMessageUseCase | null = null;
  function getRespond(): RespondToMessageUseCase | null {
    if (respond) return respond;
    // Aceptamos cualquiera de los dos providers como señal de IA activa.
    if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) return null;
    try {
      respond = new RespondToMessageUseCase(getAIProvider(), wpp);
      return respond;
    } catch (err) {
      console.warn("[ai] no se pudo inicializar provider de IA:", err);
      return null;
    }
  }

  let advisorAssistant: AdvisorAssistantUseCase | null = null;
  function getAdvisorAssistant(): AdvisorAssistantUseCase | null {
    if (advisorAssistant) return advisorAssistant;
    if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) return null;
    try {
      advisorAssistant = new AdvisorAssistantUseCase(getFastAIProvider(), wpp);
      return advisorAssistant;
    } catch (err) {
      console.warn("[ai] no se pudo inicializar el asistente del asesor:", err);
      return null;
    }
  }

  // Espera unos segundos para agrupar mensajes seguidos y responder una sola vez
  const debouncer = createReplyDebouncer(async (input) => {
    await getRespond()?.execute(input);
  });
  const scheduleReply = async (tenantId: string, conversationId: string): Promise<void> => {
    if (!getRespond()) return;
    debouncer.schedule(tenantId, conversationId, await tenantReplyDelayMs(tenantId));
  };

  const pipeline = async (msg: InboundMessage): Promise<void> => {
    try {
      // Sin IA configurada, el mensaje del asesor se guarda como el de cualquier contacto
      const assistant = getAdvisorAssistant();
      const advisor = assistant ? await resolveAdvisor(msg.tenantId, msg.from) : null;
      if (assistant && advisor) {
        // No se espera: el webhook debe responder rápido; los mensajes del asesor se atienden en orden
        void assistant.handle(advisor, msg);
        return;
      }

      const { conversationId, isMessageNew } = await ingest.execute(msg);
      if (!isMessageNew) {
        // Baileys reentregó un mensaje que ya procesamos. No respondemos
        // de nuevo: evita que la IA mande dos respuestas al cliente.
        return;
      }
      if (msg.type === "audio" && msg.media && !msg.text) {
        // Sin esperar: el webhook debe responder rápido; el agente responde cuando termine la transcripción
        void transcribeInboundAudio({
          tenantId: msg.tenantId,
          conversationId,
          providerMessageId: msg.providerMessageId,
          media: msg.media,
          whatsapp: wpp,
        })
          .finally(() => scheduleReply(msg.tenantId, conversationId))
          .catch((err) => console.error("[ai respond] error:", err));
        return;
      }
      await scheduleReply(msg.tenantId, conversationId);
    } catch (err) {
      console.error("[whatsapp ingest] error:", err);
    }
  };
  wpp.onInbound(pipeline);
  globalThis.__inboundPipeline = pipeline;

  // Auto-rehidratación de sesiones Baileys al arrancar (solo dev provider).
  if (isBaileys(wpp)) {
    wpp.restoreAllSessions().catch((err) =>
      console.error("[baileys] restoreAllSessions falló:", err),
    );
  }
}
