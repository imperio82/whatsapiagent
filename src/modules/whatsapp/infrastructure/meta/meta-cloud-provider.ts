import { InfrastructureError } from "@shared/domain/errors";
import { decryptSecret } from "@shared/infrastructure/crypto/secret-box";
import { prisma } from "@shared/infrastructure/prisma/client";
import type {
  ConnectionState,
  InboundHandler,
  InboundMessage,
  MediaDownload,
  SendTextParams,
  SendTextResult,
  SendVoiceParams,
  ShowTypingParams,
  WhatsAppProvider,
} from "../../domain/ports/whatsapp-provider";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

/**
 * fetch al Graph API con errores legibles: una caída de red (timeout, sin
 * internet) se convierte en un mensaje claro en vez de "fetch failed".
 */
async function graphFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    console.error("[MetaCloudProvider] sin conexión con graph.facebook.com:", err);
    throw new InfrastructureError(
      "No se pudo conectar con WhatsApp (Meta). Revisa la conexión a internet e intenta de nuevo.",
    );
  }
}

/** Extrae el mensaje de error que devuelve Meta (`{ error: { message } }`). */
async function graphErrorMessage(res: Response): Promise<string> {
  const body = await res.text();
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return body || `HTTP ${res.status}`;
  }
}

export interface MetaPhoneInfo {
  /** Número del negocio en solo dígitos (E.164 sin '+'). */
  displayPhoneNumber: string;
  verifiedName: string | null;
}

/**
 * Consulta el número en el Graph API para comprobar que el Phone Number ID
 * y el token funcionan. Lanza con el mensaje de Meta si no.
 */
export async function verifyMetaCredentials(
  phoneNumberId: string,
  accessToken: string,
): Promise<MetaPhoneInfo> {
  const res = await graphFetch(
    `${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new InfrastructureError(`Meta rechazó las credenciales: ${await graphErrorMessage(res)}`);
  }
  const data = (await res.json()) as { display_phone_number?: string; verified_name?: string };
  return {
    displayPhoneNumber: (data.display_phone_number ?? "").replace(/[^\d]/g, ""),
    verifiedName: data.verified_name ?? null,
  };
}

/**
 * Provider de WhatsApp Cloud API (Meta) para producción.
 * - sendText hace POST al Graph API con el token del tenant (cifrado en reposo).
 * - Los inbound NO los recibe este provider directamente: llegan por el
 *   webhook en /api/v1/whatsapp/webhook, que parsea el payload de Meta
 *   y llama a `pushInbound()` aquí para que ejecute los handlers.
 *
 * Las credenciales son por tenant y viven en la tabla WhatsappAccount
 * (provider="meta"). El estado de "conexión" es virtual: si la cuenta está
 * verificada (se probó contra el Graph API al guardarla), se considera conectado.
 */
export class MetaCloudProvider implements WhatsAppProvider {
  readonly kind = "meta" as const;
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
      account?.provider === "meta" &&
      account.verified &&
      !!account.phoneNumberId &&
      !!account.accessTokenEnc;

    const state: ConnectionState = ready
      ? {
          kind: "connected",
          phoneNumber: account!.displayPhoneNumber,
          connectedAt: account!.updatedAt,
        }
      : { kind: "disconnected" };

    this.stateCache.set(tenantId, state);
    return state;
  }

  async sendText(tenantId: string, params: SendTextParams): Promise<SendTextResult> {
    return this.sendMessage(tenantId, params.to, { type: "text", text: { body: params.text } });
  }

  /**
   * Nota de voz: se sube el OGG/Opus a Meta y se envía con `voice: true` para que WhatsApp la
   * muestre como audio grabado y no como archivo.
   */
  async sendVoice(tenantId: string, params: SendVoiceParams): Promise<SendTextResult> {
    const { phoneNumberId, accessToken } = await this.credentials(tenantId);
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "audio/ogg");
    form.append("file", new Blob([new Uint8Array(params.audio)], { type: "audio/ogg" }), "nota-de-voz.ogg");
    const upload = await graphFetch(`${GRAPH_BASE}/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!upload.ok) {
      throw new InfrastructureError(`WhatsApp (Meta) no recibió el audio: ${await graphErrorMessage(upload)}`);
    }
    const { id } = (await upload.json()) as { id?: string };
    if (!id) throw new InfrastructureError("Meta API: subida de audio sin id");
    return this.sendMessage(tenantId, params.to, { type: "audio", audio: { id, voice: true } });
  }

  /** Descarga un archivo recibido (por ejemplo, una nota de voz del cliente). */
  async downloadMedia(tenantId: string, mediaId: string): Promise<MediaDownload> {
    const { accessToken } = await this.credentials(tenantId);
    const meta = await graphFetch(`${GRAPH_BASE}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meta.ok) throw new InfrastructureError(`Meta no encontró el archivo: ${await graphErrorMessage(meta)}`);
    const info = (await meta.json()) as { url?: string; mime_type?: string };
    if (!info.url) throw new InfrastructureError("Meta API: archivo sin url");
    const file = await graphFetch(info.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!file.ok) throw new InfrastructureError(`Meta no entregó el archivo: ${await graphErrorMessage(file)}`);
    return { data: Buffer.from(await file.arrayBuffer()), mimeType: info.mime_type ?? "application/octet-stream" };
  }

  private async credentials(tenantId: string): Promise<{ phoneNumberId: string; accessToken: string }> {
    const account = await prisma.whatsappAccount.findUnique({ where: { tenantId } });
    if (
      account?.provider !== "meta" ||
      !account.verified ||
      !account.phoneNumberId ||
      !account.accessTokenEnc
    ) {
      throw new InfrastructureError("Cuenta de WhatsApp Meta no configurada");
    }
    return { phoneNumberId: account.phoneNumberId, accessToken: decryptSecret(account.accessTokenEnc) };
  }

  private async sendMessage(tenantId: string, to: string, content: Record<string, unknown>): Promise<SendTextResult> {
    const { phoneNumberId, accessToken } = await this.credentials(tenantId);
    const res = await graphFetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        ...content,
      }),
    });

    if (!res.ok) {
      throw new InfrastructureError(
        `WhatsApp (Meta) no envió el mensaje: ${await graphErrorMessage(res)}`,
      );
    }

    const data = (await res.json()) as { messages: Array<{ id: string }> };
    const id = data.messages[0]?.id;
    if (!id) throw new InfrastructureError("Meta API: respuesta sin id");

    return { providerMessageId: id, sentAt: new Date() };
  }

  /**
   * Marca el mensaje como leído (palomitas azules) y muestra "escribiendo…".
   * Meta lo quita al enviar la respuesta o a los 25 segundos.
   */
  async showTyping(tenantId: string, params: ShowTypingParams): Promise<void> {
    const account = await prisma.whatsappAccount.findUnique({ where: { tenantId } });
    if (account?.provider !== "meta" || !account.phoneNumberId || !account.accessTokenEnc) return;

    const res = await graphFetch(`${GRAPH_BASE}/${account.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${decryptSecret(account.accessTokenEnc)}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: params.inboundMessageId,
        typing_indicator: { type: "text" },
      }),
    });
    if (!res.ok) {
      throw new InfrastructureError(`Meta no mostró "escribiendo": ${await graphErrorMessage(res)}`);
    }
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
