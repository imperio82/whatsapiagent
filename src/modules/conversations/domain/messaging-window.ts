/**
 * Ventana de atención de WhatsApp. Con la API oficial (Meta, y Twilio que la usa por debajo) el negocio
 * puede escribir texto libre solo hasta 24 horas después del último mensaje del cliente; pasado eso, Meta
 * únicamente acepta plantillas aprobadas. Con Baileys (WhatsApp Web) no hay ventana.
 */

export const WINDOW_HOURS = 24;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;

export type ProviderKind = "baileys" | "meta" | "twilio";

export interface WindowState {
  open: boolean;
  /** Último mensaje del cliente; null si nunca ha escrito */
  lastInboundAt: Date | null;
}

export function providerHasWindow(kind: ProviderKind): boolean {
  return kind === "meta" || kind === "twilio";
}

export function windowState(kind: ProviderKind, lastInboundAt: Date | null, now = new Date()): WindowState {
  if (!providerHasWindow(kind)) return { open: true, lastInboundAt };
  return { open: !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < WINDOW_MS, lastInboundAt };
}

/** "hace 3 días", "hace 26 horas", "nunca le ha escrito al negocio" */
export function sinceLastInbound(lastInboundAt: Date | null, now = new Date()): string {
  if (!lastInboundAt) return "nunca le ha escrito al negocio";
  const hours = Math.floor((now.getTime() - lastInboundAt.getTime()) / (60 * 60 * 1000));
  if (hours < 48) return `escribió por última vez hace ${hours} horas`;
  return `escribió por última vez hace ${Math.floor(hours / 24)} días`;
}

/** Por qué no se puede enviar: lo que ve el asesor. */
export function windowClosedReason(lastInboundAt: Date | null, now = new Date()): string {
  return (
    `El cliente ${sinceLastInbound(lastInboundAt, now)}. Pasadas ${WINDOW_HOURS} horas, WhatsApp solo deja escribirle con una ` +
    "plantilla aprobada por Meta, y todavía no hay una configurada."
  );
}
