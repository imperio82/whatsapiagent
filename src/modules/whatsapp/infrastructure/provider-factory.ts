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

export function isBaileys(provider: WhatsAppProvider): boolean {
  return provider.kind === "baileys";
}
