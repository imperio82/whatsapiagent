import { InfrastructureError } from "@shared/domain/errors";
import { decryptSecret } from "@shared/infrastructure/crypto/secret-box";
import { prisma } from "@shared/infrastructure/prisma/client";
import type {
  ConnectionState,
  InboundHandler,
  InboundMessage,
  SendTextParams,
  SendTextResult,
  WhatsAppProvider,
} from "../../domain/ports/whatsapp-provider";

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";

/** Convierte un E.164 (con o sin '+') al formato de dirección de WhatsApp de Twilio. */
function toWhatsAppAddress(e164: string): string {
  const digits = e164.replace(/[^\d]/g, "");
  return `whatsapp:+${digits}`;
}

/**
 * Provider de WhatsApp vía Twilio (sandbox o número de producción).
 * - sendText hace POST al REST API de Twilio (Messages.json) con Basic Auth.
 * - Los inbound llegan por el webhook en /api/v1/whatsapp/twilio/webhook,
 *   que parsea el form-encoded de Twilio y llama a `pushInbound()` aquí.
 *
 * Las credenciales son por tenant y viven en la tabla WhatsappAccount
 * (provider="twilio"). El estado de "conexión" es virtual: si la cuenta
 * está verificada, se considera conectado.
 */
export class TwilioProvider implements WhatsAppProvider {
  readonly kind = "twilio" as const;
  private readonly inboundHandlers: InboundHandler[] = [];
  /** Cache en memoria del estado por tenant (getState es síncrono por contrato). */
  private readonly stateCache = new Map<string, ConnectionState>();

  onInbound(handler: InboundHandler): void {
    this.inboundHandlers.push(handler);
  }

  async start(tenantId: string): Promise<void> {
    await this.refreshState(tenantId);
  }

  async stop(tenantId: string): Promise<void> {
    this.stateCache.set(tenantId, { kind: "disconnected" });
  }

  getState(tenantId: string): ConnectionState {
    return this.stateCache.get(tenantId) ?? { kind: "disconnected" };
  }

  /**
   * Recalcula el estado leyendo la cuenta del tenant y lo cachea.
   * Lo llaman el endpoint de configuración y `start()`.
   */
  async refreshState(tenantId: string): Promise<ConnectionState> {
    const account = await prisma.whatsappAccount.findUnique({ where: { tenantId } });
    const ready =
      account?.provider === "twilio" &&
      account.verified &&
      !!account.twilioAccountSid &&
      !!account.twilioAuthTokenEnc &&
      !!account.displayPhoneNumber;

    const state: ConnectionState = ready
      ? {
          kind: "connected",
          phoneNumber: account!.displayPhoneNumber.replace(/[^\d]/g, ""),
          connectedAt: account!.updatedAt,
        }
      : { kind: "disconnected" };

    this.stateCache.set(tenantId, state);
    return state;
  }

  async sendText(tenantId: string, params: SendTextParams): Promise<SendTextResult> {
    const account = await prisma.whatsappAccount.findUnique({ where: { tenantId } });
    if (
      account?.provider !== "twilio" ||
      !account.verified ||
      !account.twilioAccountSid ||
      !account.twilioAuthTokenEnc ||
      !account.displayPhoneNumber
    ) {
      throw new InfrastructureError("Cuenta de WhatsApp (Twilio) no configurada");
    }

    const auth = Buffer.from(
      `${account.twilioAccountSid}:${decryptSecret(account.twilioAuthTokenEnc)}`,
    ).toString("base64");

    const form = new URLSearchParams();
    form.set("From", toWhatsAppAddress(account.displayPhoneNumber));
    form.set("To", toWhatsAppAddress(params.to));
    form.set("Body", params.text);

    const res = await fetch(`${TWILIO_BASE}/Accounts/${account.twilioAccountSid}/Messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new InfrastructureError(`Twilio API error ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as { sid?: string };
    if (!data.sid) throw new InfrastructureError("Twilio API: respuesta sin sid");

    return { providerMessageId: data.sid, sentAt: new Date() };
  }

  /**
   * Llamado por el webhook al recibir un mensaje. Despacha a los handlers.
   * No es parte del puerto público pero está disponible para infrastructure.
   */
  async pushInbound(message: InboundMessage): Promise<void> {
    for (const h of this.inboundHandlers) {
      try {
        await h(message);
      } catch (err) {
        console.error("[TwilioProvider] inbound handler error:", err);
      }
    }
  }
}
