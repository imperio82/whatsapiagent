/**
 * Helpers para trabajar con JIDs de WhatsApp.
 *
 * Hay dos formatos:
 * - `<phone>@s.whatsapp.net`: el número real, mostrable como teléfono
 * - `<id>@lid`: identificador interno que WhatsApp usa cuando el cliente
 *   oculta su número o es una cuenta business — NO es un teléfono visible
 */

export function isLidJid(jid: string): boolean {
  return jid.endsWith("@lid");
}

export function jidLocalPart(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

/**
 * Devuelve el número de teléfono visible (con `+`) si el JID es estándar.
 * Para LIDs devuelve null porque no son teléfonos reales.
 */
export function jidToDisplayPhone(jid: string): string | null {
  if (isLidJid(jid)) return null;
  const local = jidLocalPart(jid);
  const digits = local.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

/**
 * Texto corto para mostrar como subtítulo del cliente. Si hay teléfono,
 * lo muestra. Si es LID, indica que es un identificador interno.
 */
export function jidToDisplayLabel(jid: string): string {
  const phone = jidToDisplayPhone(jid);
  if (phone) return phone;
  return "Sin número público (LID)";
}

/**
 * Formatea el campo `Client.phone` (que puede ser un teléfono real
 * o un `lid:XXXX`) para mostrarlo en la UI. Nunca devuelve `+lid:...`.
 */
export function clientPhoneToDisplay(phone: string): string {
  if (phone.startsWith("lid:")) return "Sin número público (LID)";
  return `+${phone}`;
}
