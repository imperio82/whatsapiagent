import type { WhatsAppProvider } from "../domain/ports/whatsapp-provider";
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

  globalThis.__whatsappProvider = provider;
  return provider;
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
