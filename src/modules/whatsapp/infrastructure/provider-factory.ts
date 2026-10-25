import { randomUUID } from "node:crypto";
import { InfrastructureError } from "@shared/domain/errors";
import { isSimulatedJid } from "@shared/domain/wa-jid";
import type {
  SendTextParams,
  SendTextResult,
  SendVoiceParams,
  ShowTypingParams,
  WhatsAppProvider,
} from "../domain/ports/whatsapp-provider";
import { BaileysProvider } from "./baileys/baileys-provider";
import { MetaCloudProvider } from "./meta/meta-cloud-provider";
import { TwilioProvider } from "./twilio/twilio-provider";

/**
 * Singleton del provider activo. Se elige por la env var WHATSAPP_PROVIDER
 * y persiste durante la vida del proceso Node (compartido entre requests).
 */

declare global {
  // eslint-disable-next-line no-var
  var __whatsappProvider: WhatsAppProvider | undefined;
}

export function getWhatsAppProvider(): WhatsAppProvider {
  if (globalThis.__whatsappProvider) return globalThis.__whatsappProvider;

  const kind = (process.env.WHATSAPP_PROVIDER ?? "baileys").toLowerCase();
  const provider: WhatsAppProvider =
    kind === "meta"
      ? new MetaCloudProvider()
      : kind === "twilio"
        ? new TwilioProvider()
        : new BaileysProvider();

  globalThis.__whatsappProvider = withSimulator(provider);
  return globalThis.__whatsappProvider;
}

/**
 * Los chats del simulador (`<teléfono>@sim`) recorren el flujo real —IA, herramientas, base de
 * datos, calendario y avisos al dueño—, pero lo que se les "envía" se queda en el panel: no sale
 * por WhatsApp. El resto de llamadas pasan intactas al provider real.
 */
function withSimulator(provider: WhatsAppProvider): WhatsAppProvider {
  return new Proxy(provider, {
    get(target, prop) {
      if (prop === "sendText") {
        return async (tenantId: string, params: SendTextParams): Promise<SendTextResult> =>
          isSimulatedJid(params.to)
            ? { providerMessageId: `sim-${randomUUID()}`, sentAt: new Date() }
            : target.sendText(tenantId, params);
      }
      // En el simulador la nota de voz siempre "sale" (y se escucha en el panel), aunque el
      // provider real no envíe audios
      if (prop === "sendVoice") {
        const sendVoice = target.sendVoice?.bind(target);
        return async (tenantId: string, params: SendVoiceParams): Promise<SendTextResult> => {
          if (isSimulatedJid(params.to)) return { providerMessageId: `sim-${randomUUID()}`, sentAt: new Date() };
          if (!sendVoice) throw new InfrastructureError("Este proveedor de WhatsApp no envía notas de voz");
          return sendVoice(tenantId, params);
        };
      }
      if (prop === "showTyping" && target.showTyping) {
        const showTyping = target.showTyping.bind(target);
        return async (tenantId: string, params: ShowTypingParams): Promise<void> => {
          if (!isSimulatedJid(params.to)) await showTyping(tenantId, params);
        };
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// Los type guards comparan `kind` y no usan `instanceof`: en dev, Next.js
// carga copias distintas de cada clase (instrumentation vs. route handlers),
// así que el singleton puede no ser instancia de la clase que importa la ruta.

export function isBaileys(provider: WhatsAppProvider): provider is BaileysProvider {
  return provider.kind === "baileys";
}

export function isMeta(provider: WhatsAppProvider): provider is MetaCloudProvider {
  return provider.kind === "meta";
}

export function isTwilio(provider: WhatsAppProvider): provider is TwilioProvider {
  return provider.kind === "twilio";
}

/** Twilio necesita una URL pública para enviar audios; por ahora solo Meta y Baileys mandan notas de voz. */
export function sendsVoiceNotes(provider: WhatsAppProvider): boolean {
  return provider.kind === "meta" || provider.kind === "baileys";
}
