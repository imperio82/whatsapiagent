import { isLidJid, jidLocalPart } from "@shared/domain/wa-jid";

/**
 * Reconoce si un mensaje entrante viene del WhatsApp de un asesor del negocio.
 *
 * Los números se guardan con indicativo (573001234567), pero WhatsApp o el asesor pueden
 * escribirlos sin él (3001234567). Por eso dos números son el mismo si coinciden completos
 * o en sus últimos 10 dígitos (el largo de un celular colombiano).
 */

const LOCAL_DIGITS = 10;

/** Dígitos del remitente. Un LID no es un teléfono: no se puede reconocer al asesor. */
export function senderDigits(from: string): string | null {
  if (isLidJid(from)) return null;
  const digits = jidLocalPart(from).replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a?.replace(/\D/g, "") ?? "";
  const y = b?.replace(/\D/g, "") ?? "";
  if (!x || !y) return false;
  if (x === y) return true;
  return x.length >= LOCAL_DIGITS && y.length >= LOCAL_DIGITS && x.slice(-LOCAL_DIGITS) === y.slice(-LOCAL_DIGITS);
}
