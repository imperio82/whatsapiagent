/**
 * Puerto del proveedor de WhatsApp. El dominio depende de esta interfaz,
 * nunca de implementaciones concretas (Baileys/Meta).
 *
 * Cada implementación corre como singleton por tenant. La factory en
 * infrastructure decide cuál instanciar según WHATSAPP_PROVIDER.
 */

export type ConnectionState =
  | { kind: "disconnected" }
  | { kind: "connecting" }
  | { kind: "qr"; qrPng: string; qrRaw: string; expiresAt: Date } // Solo Baileys
  | { kind: "connected"; phoneNumber: string; connectedAt: Date }
  | { kind: "error"; reason: string };

export interface SendTextParams {
  to: string;       // E.164 sin '+', ej "50212345678"
  text: string;
  /** id opcional para correlacionar el ack con el mensaje persistido */
  externalId?: string;
}

export interface SendTextResult {
  providerMessageId: string;
  sentAt: Date;
}

export interface InboundMessage {
  tenantId: string;
  from: string;          // E.164 del cliente
  toPhoneNumber: string; // E.164 del negocio
  providerMessageId: string;
  type: "text" | "image" | "audio" | "video" | "document";
  text?: string;
  mediaUrl?: string;
  contactName?: string;
  timestamp: Date;
}

/** Callback de mensajes entrantes (push del provider hacia la app). */
export type InboundHandler = (message: InboundMessage) => Promise<void>;

export interface WhatsAppProvider {
  readonly kind: "baileys" | "meta" | "twilio";

  /** Inicia o reanuda la conexión para un tenant. Idempotente. */
  start(tenantId: string): Promise<void>;

  /** Cierra la conexión y libera recursos. */
  stop(tenantId: string): Promise<void>;

  /** Estado actual de la conexión de un tenant. */
  getState(tenantId: string): ConnectionState;

  /** Envía un mensaje de texto. Lanza si no está conectado. */
  sendText(tenantId: string, params: SendTextParams): Promise<SendTextResult>;

  /** Registra un handler global para mensajes entrantes. */
  onInbound(handler: InboundHandler): void;
}
