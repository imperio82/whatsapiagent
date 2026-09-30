import { InfrastructureError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import type {
  ConnectionState,
  InboundHandler,
  InboundMessage,
  SendTextParams,
  SendTextResult,
  WhatsAppProvider,
} from "../../domain/ports/whatsapp-provider";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

/**
 * Provider de WhatsApp Cloud API (Meta) para producción.
 * - sendText hace POST al Graph API.
 * - Los inbound NO los recibe este provider directamente: llegan por el
 *   webhook en /api/v1/whatsapp/webhook, que parsea el payload de Meta
 *   y llama a `pushInbound()` aquí para que ejecute los handlers.
 *
 * El estado de "conexión" es virtual: si hay WhatsappAccount activa para
 * el tenant, se considera conectado.
 */
export class MetaCloudProvider implements WhatsAppProvider {
  readonly kind = "meta" as const;
  private readonly inboundHandlers: InboundHandler[] = [];

  onInbound(handler: InboundHandler): void {
    this.inboundHandlers.push(handler);
  }

  async start(_tenantId: string): Promise<void> {
    // No-op: la conexión es por configuración persistida en WhatsappAccount.
  }

  async stop(_tenantId: string): Promise<void> {
    // No-op.
  }

  getState(_tenantId: string): ConnectionState {
    // Implementación real consultaría la tabla WhatsappAccount. Por ahora dev-stub.
    return { kind: "disconnected" };
  }

  async sendText(tenantId: string, params: SendTextParams): Promise<SendTextResult> {
    const account = await prisma.whatsappAccount.findUnique({ where: { tenantId } });
    if (!account?.verified) {
      throw new InfrastructureError("Cuenta de WhatsApp Meta no configurada");
    }

    // Nota: en producción, accessTokenEnc debería guardarse cifrado en reposo
    // y descifrarse acá. Hoy lo usamos en texto plano — pendiente para hardening.
    const accessToken = account.accessTokenEnc;
    const res = await fetch(`${GRAPH_BASE}/${account.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.to,
        type: "text",
        text: { body: params.text },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new InfrastructureError(`Meta API error ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as { messages: Array<{ id: string }> };
    const id = data.messages[0]?.id;
    if (!id) throw new InfrastructureError("Meta API: respuesta sin id");

    return { providerMessageId: id, sentAt: new Date() };
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
        console.error("[MetaCloudProvider] inbound handler error:", err);
      }
    }
  }
}
