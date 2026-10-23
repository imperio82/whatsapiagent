import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * `state` firmado para el flujo OAuth: amarra la vuelta del proveedor al negocio y al usuario
 * que inició la conexión, y vence en 10 minutos. El nonce también va en una cookie para que
 * otro navegador no pueda completar el flujo con un enlace robado.
 */

export interface OAuthState {
  tenantId: string;
  userId: string;
  /** Conexión del negocio o del propio usuario. */
  scope: "business" | "user";
  nonce: string;
  exp: number;
}

const TTL_MS = 10 * 60 * 1000;

function secret(): string {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("Falta AUTH_SECRET para firmar el estado de OAuth");
  return value;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function createState(
  tenantId: string,
  userId: string,
  scope: OAuthState["scope"],
  now = Date.now(),
): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ tenantId, userId, scope, nonce, exp: now + TTL_MS })).toString("base64url");
  return { state: `${payload}.${sign(payload)}`, nonce };
}

export function verifyState(state: string, now = Date.now()): OAuthState | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (typeof data.exp !== "number" || data.exp < now) return null;
    if (!data.tenantId || !data.userId || !data.nonce) return null;
    if (data.scope !== "business" && data.scope !== "user") return null;
    return data;
  } catch {
    return null;
  }
}
