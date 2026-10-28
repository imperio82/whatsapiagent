import { decryptSecret, encryptSecret } from "@shared/infrastructure/crypto/secret-box";
import {
  clearPlatformSetting,
  getPlatformSetting,
  setPlatformSetting,
} from "@modules/platform/infrastructure/platform-settings";

/**
 * Clave de ElevenLabs de la plataforma: se pone en /plataforma (cifrada en platform_settings) o, si no, en
 * ELEVENLABS_API_KEY. Con el interruptor apagado, los negocios solo ven las voces de Gemini.
 */
const KEY = "voice.elevenlabs.apiKey";
const ENABLED = "voice.elevenlabs.enabled";

export interface ElevenLabsKeyStatus {
  /** De dónde sale la clave: del panel, de las variables de entorno o de ninguna parte */
  source: "panel" | "env" | null;
  enabled: boolean;
  /** Últimos 4 caracteres, para reconocerla sin mostrarla */
  last4: string | null;
}

async function storedKey(): Promise<string | null> {
  const stored = await getPlatformSetting(KEY);
  if (!stored) return null;
  try {
    return decryptSecret(stored);
  } catch (err) {
    console.warn(`[voz] no se pudo descifrar la clave de ElevenLabs: ${(err as Error).message}`);
    return null;
  }
}

export async function elevenLabsKeyStatus(): Promise<ElevenLabsKeyStatus> {
  const [stored, enabled] = await Promise.all([storedKey(), getPlatformSetting(ENABLED)]);
  const key = stored ?? process.env.ELEVENLABS_API_KEY ?? null;
  return { source: stored ? "panel" : key ? "env" : null, enabled: enabled !== "false", last4: key ? key.slice(-4) : null };
}

/** La clave con la que se llama a ElevenLabs; null si no hay o si está apagado desde /plataforma. */
export async function elevenLabsApiKey(): Promise<string | null> {
  if ((await getPlatformSetting(ENABLED)) === "false") return null;
  return (await storedKey()) ?? process.env.ELEVENLABS_API_KEY ?? null;
}

export function saveElevenLabsKey(apiKey: string): Promise<void> {
  return setPlatformSetting(KEY, encryptSecret(apiKey));
}

export function clearElevenLabsKey(): Promise<void> {
  return clearPlatformSetting(KEY);
}

export function setElevenLabsEnabled(enabled: boolean): Promise<void> {
  return setPlatformSetting(ENABLED, enabled ? "true" : "false");
}

/**
 * Prueba la clave antes de guardarla, pidiendo las voces (el mismo permiso que necesita el panel de voz).
 * Devuelve cuántas voces ve la cuenta, o el error de ElevenLabs.
 */
export async function testElevenLabsKey(apiKey: string): Promise<{ ok: true; voices: number } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = await res.text();
      let detail = body || `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(body) as { detail?: string | { message?: string } };
        detail = typeof parsed.detail === "string" ? parsed.detail : (parsed.detail?.message ?? detail);
      } catch {
        // la respuesta no era JSON: se deja el texto
      }
      return { ok: false, error: detail.slice(0, 200) };
    }
    const json = (await res.json()) as { voices?: unknown[] };
    return { ok: true, voices: json.voices?.length ?? 0 };
  } catch {
    return { ok: false, error: "No se pudo conectar con ElevenLabs" };
  }
}
