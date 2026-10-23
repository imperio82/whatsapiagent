import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ValidationError } from "@shared/domain/errors";

/**
 * Una base de datos externa la escribe el usuario: no puede apuntar a la red interna del
 * servidor (la base de la app, metadatos de la nube, otros servicios privados). Se resuelve el
 * nombre y se conecta a la IP ya validada, para que no cambie entre la revisión y la conexión.
 *
 * En desarrollo se permite localhost para poder probar; en producción solo con
 * ALLOW_PRIVATE_DATA_SOURCES=true (por ejemplo, si la base del cliente está en una VPN propia).
 */

function privateAllowed(): boolean {
  return process.env.ALLOW_PRIVATE_DATA_SOURCES === "true" || process.env.NODE_ENV !== "production";
}

export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local y metadatos de la nube
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

/** Devuelve la IP a la que se debe conectar, o lanza si el destino no está permitido. */
export async function resolveAllowedHost(hostname: string): Promise<string> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new ValidationError("Falta el servidor de la base de datos");
  if (/\.(internal|local|localdomain)$/i.test(host) && !privateAllowed()) {
    throw new ValidationError("Ese servidor es de una red interna. Usa la dirección pública de tu base de datos.");
  }
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
  } catch {
    throw new ValidationError(`No se encontró el servidor "${host}". Revisa la dirección.`);
  }
  if (addresses.length === 0) throw new ValidationError(`No se encontró el servidor "${host}"`);
  if (!privateAllowed() && addresses.some(isPrivateAddress)) {
    throw new ValidationError("Ese servidor es de una red privada. Usa la dirección pública de tu base de datos.");
  }
  return addresses[0]!;
}
