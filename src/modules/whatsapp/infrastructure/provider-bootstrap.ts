import { IngestInboundMessageUseCase } from "@modules/conversations/application/ingest-inbound-message.use-case";
import { RespondToMessageUseCase } from "@modules/ai/application/respond-to-message.use-case";
import { getAIProvider } from "@modules/ai/infrastructure/provider-factory";
import { getWhatsAppProvider, isBaileys } from "./provider-factory";

declare global {
  // eslint-disable-next-line no-var
  var __whatsappWired: boolean | undefined;
}

/**
 * Pipeline de inbound:
 *   1. Persistir el mensaje (IngestInboundMessage)
 *   2. Si el tenant tiene IA activa y hay OPENAI_API_KEY, responder con IA
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

  wpp.onInbound(async (msg) => {
    try {
      const { conversationId, isMessageNew } = await ingest.execute(msg);
      if (!isMessageNew) {
        // Baileys reentregó un mensaje que ya procesamos. No respondemos
        // de nuevo: evita que la IA mande dos respuestas al cliente.
        return;
      }
      const responder = getRespond();
      if (responder) {
        responder
          .execute({ tenantId: msg.tenantId, conversationId })
          .catch((err) => console.error("[ai respond] error:", err));
      }
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
