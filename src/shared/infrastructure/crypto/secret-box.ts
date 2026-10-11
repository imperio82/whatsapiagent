import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { InfrastructureError } from "@shared/domain/errors";

/**
 * Cifrado en reposo de secretos de terceros (tokens de Meta, Twilio).
 * AES-256-GCM con IV aleatorio por valor. Formato guardado:
 *   v1:<iv base64>:<authTag base64>:<ciphertext base64>
 *
 * La llave vive en SECRETS_ENCRYPTION_KEY (32 bytes en base64).
 * Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const PREFIX = "v1:";

function getKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new InfrastructureError("Falta SECRETS_ENCRYPTION_KEY para cifrar secretos");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new InfrastructureError("SECRETS_ENCRYPTION_KEY debe ser de 32 bytes en base64");
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Descifra un valor guardado con `encryptSecret`. Los valores viejos sin
 * prefijo (guardados en texto plano antes del cifrado) se devuelven tal cual
 * para no romper cuentas existentes; se cifran la próxima vez que se guarden.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new InfrastructureError("Secreto cifrado con formato inválido");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
