import { IngestInboundMessageUseCase } from "@modules/conversations/application/ingest-inbound-message.use-case";
import { RespondToMessageUseCase } from "@modules/ai/application/respond-to-message.use-case";
import { AdvisorAssistantUseCase, resolveAdvisor } from "@modules/ai/application/advisor-assistant.use-case";
import { getAIProvider, getFastAIProvider } from "@modules/ai/infrastructure/provider-factory";
import { getWhatsAppProvider, isBaileys } from "./provider-factory";
import { createReplyDebouncer } from "./reply-debouncer";

declare global {
  // eslint-disable-next-line no-var
  var __whatsappWired: boolean | undefined;
}

/**
 * Pipeline de inbound:
 *   0. Si escribe un asesor del negocio, lo atiende el asistente del asesor (no es un cliente)
 *   1. Persistir el mensaje (IngestInboundMessage)
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

  wpp.onInbound(async (msg) => {
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
      if (getRespond()) debouncer.schedule(msg.tenantId, conversationId);
    } catch (err) {
      console.error("[whatsapp ingest] error:", err);
    }
  });

  // Auto-rehidratación de sesiones Baileys al arrancar (solo dev provider).
  if (isBaileys(wpp)) {
    wpp.restoreAllSessions().catch((err) =>
      console.error("[baileys] restoreAllSessions falló:", err),
    );
  }
}
