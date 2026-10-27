import {
  clearPlatformSetting,
  getPlatformSetting,
  setPlatformSetting,
} from "@modules/platform/infrastructure/platform-settings";
import { findTtsModel } from "../domain/voice-models";

/** Clave en platform_settings del modelo de voz elegido en /plataforma */
const KEY = "voice.ttsModel";

export interface TtsModelChoice {
  modelName: string;
  /** "panel" si lo eligieron en /plataforma; "env" si sale de GEMINI_TTS_MODEL */
  source: "panel" | "env";
}

/** El de las variables de entorno: GEMINI_TTS_MODEL o el más barato. */
export function envTtsModel(): string {
  return process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-lite-tts";
}

/** El modelo con el que se generan las notas de voz: el de /plataforma o, si no hay, el del .env. */
export async function resolveTtsModel(): Promise<TtsModelChoice> {
  const id = await getPlatformSetting(KEY);
  return id && findTtsModel(id) ? { modelName: id, source: "panel" } : { modelName: envTtsModel(), source: "env" };
}

/** Guarda el modelo elegido; null vuelve a las variables de entorno. */
export function saveTtsModel(id: string | null): Promise<void> {
  return id ? setPlatformSetting(KEY, id) : clearPlatformSetting(KEY);
}
