import { prisma } from "@shared/infrastructure/prisma/client";
import { decryptSecret, encryptSecret } from "@shared/infrastructure/crypto/secret-box";
import { BusinessRuleError, InfrastructureError } from "@shared/domain/errors";

/**
 * OAuth 2.0 con Google: URL de consentimiento, canje del código, renovación del token y revocación.
 *
 * Dos niveles de conexión por negocio:
 * - La del negocio ("business"): calendario compartido y hojas de cálculo.
 * - La de cada asesor ("user:<id>"): su calendario propio, donde caen las citas que atiende.
 *
 * Las credenciales de la app (Client ID / Secret) pueden ser las propias del negocio (guardadas
 * cifradas en `integration_apps`) o, si no tiene, las de la plataforma (variables de entorno).
 * Los tokens de cada conexión se guardan cifrados en `integrations`.
 */

export type ConnectionScope = "business" | "user";

const IDENTITY_SCOPES = ["openid", "email"];
// Crear, mover y borrar los eventos de las visitas; ver la lista de calendarios y los horarios ocupados
const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"];
// Leer las hojas que el negocio decida sincronizar
const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

/** El negocio pide calendario y hojas; un asesor solo su calendario. */
export function scopesFor(scope: ConnectionScope): string[] {
  return scope === "business" ? [...IDENTITY_SCOPES, ...CALENDAR_SCOPES, ...SHEETS_SCOPES] : [...IDENTITY_SCOPES, ...CALENDAR_SCOPES];
}

export const ownerKeyFor = (scope: ConnectionScope, userId: string) => (scope === "business" ? "business" : `user:${userId}`);

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
/** Se renueva un poco antes de que venza para no fallar a mitad de una llamada. */
const REFRESH_MARGIN_MS = 60_000;

export function platformGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export type CredentialsSource = "tenant" | "platform";

/** Credenciales de la app de Google para el negocio: las propias si las cargó, si no las de la plataforma. */
export async function googleCredentials(tenantId: string): Promise<{ clientId: string; clientSecret: string; source: CredentialsSource } | null> {
  const own = await prisma.integrationApp.findUnique({ where: { tenantId_provider: { tenantId, provider: "GOOGLE" } } });
  if (own) return { clientId: own.clientId, clientSecret: decryptSecret(own.clientSecretEnc), source: "tenant" };
  if (platformGoogleConfigured()) {
    return { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, source: "platform" };
  }
  return null;
}

async function requireCredentials(tenantId: string) {
  const creds = await googleCredentials(tenantId);
  if (!creds) {
    throw new BusinessRuleError("Google no está configurado: carga las credenciales de tu proyecto de Google en Integraciones");
  }
  return creds;
}

export async function isGoogleConfigured(tenantId: string): Promise<boolean> {
  return (await googleCredentials(tenantId)) !== null;
}

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** El mismo para todos los negocios: es el que se registra en el proyecto de Google Cloud. */
export function googleRedirectUri(): string {
  return `${appBaseUrl()}/api/v1/integrations/google/callback`;
}

export async function buildGoogleAuthUrl(tenantId: string, scope: ConnectionScope, state: string, loginHint?: string): Promise<string> {
  const { clientId } = await requireCredentials(tenantId);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: scopesFor(scope).join(" "),
    // offline + consent: Google entrega el refresh_token aunque el usuario ya hubiera autorizado antes
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    const err = new InfrastructureError(`Google rechazó la autorización: ${data.error_description ?? data.error ?? res.status}`);
    (err as InfrastructureError & { oauthError?: string }).oauthError = data.error;
    throw err;
  }
  return data;
}

/** Canjea el código de la vuelta de Google y guarda la conexión (del negocio o del asesor). */
export async function completeGoogleConnection(
  tenantId: string,
  userId: string,
  scope: ConnectionScope,
  code: string,
): Promise<{ email: string | null }> {
  const { clientId, clientSecret } = await requireCredentials(tenantId);
  const tokens = await tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });

  const info: { email?: string } = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    .then((r) => (r.ok ? (r.json() as Promise<{ email?: string }>) : {}))
    .catch(() => ({}));

  const ownerKey = ownerKeyFor(scope, userId);
  const where = { tenantId_provider_ownerKey: { tenantId, provider: "GOOGLE" as const, ownerKey } };
  const existing = await prisma.integration.findUnique({ where });
  const refreshTokenEnc = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existing?.refreshTokenEnc ?? null;
  if (!refreshTokenEnc) throw new InfrastructureError("Google no entregó permiso sin conexión. Vuelve a conectar y acepta todos los permisos.");

  const data = {
    status: "CONNECTED" as const,
    accountEmail: info.email ?? null,
    scopes: (tokens.scope ?? scopesFor(scope).join(" ")).split(" ").filter(Boolean),
    accessTokenEnc: encryptSecret(tokens.access_token),
    refreshTokenEnc,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    lastError: null,
    connectedBy: userId,
  };
  await prisma.integration.upsert({
    where,
    create: { tenantId, provider: "GOOGLE", ownerKey, userId: scope === "user" ? userId : null, ...data },
    update: data,
  });
  return { email: info.email ?? null };
}

/** Token vigente de una conexión; lo renueva si está por vencer. */
export async function googleAccessToken(integrationId: string, forceRefresh = false): Promise<string> {
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!integration || integration.status === "DISCONNECTED" || !integration.refreshTokenEnc) {
    throw new BusinessRuleError("Google no está conectado");
  }
  const fresh = integration.expiresAt && integration.expiresAt.getTime() - REFRESH_MARGIN_MS > Date.now();
  if (!forceRefresh && fresh && integration.accessTokenEnc) return decryptSecret(integration.accessTokenEnc);

  const { clientId, clientSecret } = await requireCredentials(integration.tenantId);
  try {
    const tokens = await tokenRequest({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptSecret(integration.refreshTokenEnc),
      grant_type: "refresh_token",
    });
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: "CONNECTED",
        accessTokenEnc: encryptSecret(tokens.access_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        lastError: null,
      },
    });
    return tokens.access_token;
  } catch (err) {
    const oauthError = (err as { oauthError?: string }).oauthError;
    // invalid_grant: el usuario quitó el acceso. invalid_client: el negocio cambió sus credenciales.
    if (oauthError === "invalid_grant" || oauthError === "invalid_client" || oauthError === "unauthorized_client") {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { status: "ERROR", lastError: "Google retiró el acceso o cambiaron las credenciales. Vuelve a conectar la cuenta." },
      });
    }
    throw err;
  }
}

/** Llamada a una API de Google con el token de la conexión; si responde 401 renueva una vez y reintenta. */
export async function googleFetch(integrationId: string, url: string, init: RequestInit = {}): Promise<Response> {
  const call = (token: string) =>
    fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  let res = await call(await googleAccessToken(integrationId));
  if (res.status === 401) res = await call(await googleAccessToken(integrationId, true));
  return res;
}

/** Lee el cuerpo de error de Google en una frase útil. */
export async function googleError(res: Response, action: string): Promise<InfrastructureError> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return new InfrastructureError(`Google (${action}): ${body?.error?.message ?? `HTTP ${res.status}`}`);
}

/** Revoca el acceso en Google (best-effort) y marca la conexión como desconectada. */
export async function disconnectGoogle(integrationId: string): Promise<void> {
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!integration) return;
  const token = integration.refreshTokenEnc ?? integration.accessTokenEnc;
  if (token) {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(decryptSecret(token))}`, { method: "POST" }).catch(() => {});
  }
  await prisma.integration.update({
    where: { id: integration.id },
    data: { status: "DISCONNECTED", accessTokenEnc: null, refreshTokenEnc: null, expiresAt: null, lastError: null },
  });
}
