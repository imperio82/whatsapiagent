import { z } from "zod";
import { ValidationError } from "@shared/domain/errors";
import {
  ELEVENLABS_MODELS,
  clearElevenLabsKey,
  elevenLabsKeyStatus,
  isFreeElevenLabsVoice,
  saveElevenLabsKey,
  saveElevenLabsModel,
  setElevenLabsEnabled,
  setElevenLabsFreeOnly,
  testElevenLabsKey,
  type ElevenLabsKeyStatus,
} from "@modules/voice/infrastructure/elevenlabs-key";
import { listElevenLabsVoices } from "@modules/voice/infrastructure/speech";

export interface ElevenLabsVoiceSummary {
  voiceId: string;
  name: string;
  category: string;
  language: string | null;
  accent: string | null;
  /** Funciona con el plan gratuito de ElevenLabs (las prediseñadas) */
  free: boolean;
  previewUrl: string | null;
}

export interface ElevenLabsSettingsDto extends ElevenLabsKeyStatus {
  /** Las voces de la cuenta, para separar las gratis de las que piden plan pago; vacío si no está activo */
  voices: ElevenLabsVoiceSummary[];
  /** No se pudieron leer las voces (clave sin permiso, ElevenLabs caído…) */
  voicesError: string | null;
  models: { id: string; label: string; note: string; creditsPerChar: number }[];
}

const MODELS = ELEVENLABS_MODELS.map(({ id, label, note, creditsPerChar }) => ({ id, label, note, creditsPerChar }));

export class GetElevenLabsSettingsUseCase {
  async execute(): Promise<ElevenLabsSettingsDto> {
    const status = await elevenLabsKeyStatus();
    if (!status.enabled || !status.source) return { ...status, voices: [], voicesError: null, models: MODELS };
    try {
      const voices = (await listElevenLabsVoices())
        .map((v) => ({
          voiceId: v.voiceId,
          name: v.name,
          category: v.category,
          language: v.language,
          accent: v.accent,
          free: isFreeElevenLabsVoice(v.category),
          previewUrl: v.previewUrl,
        }))
        .sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
      return { ...status, voices, voicesError: null, models: MODELS };
    } catch (err) {
      return { ...status, voices: [], voicesError: (err as Error).message, models: MODELS };
    }
  }
}

/**
 * apiKey: la prueba y la guarda cifrada · removeKey: la borra · enabled: prende o apaga ElevenLabs ·
 * freeOnly: los negocios solo ven las voces gratis (prediseñadas)
 */
export const setElevenLabsSchema = z.object({
  apiKey: z.string().trim().min(20, "La clave de ElevenLabs es más larga").max(200).optional(),
  removeKey: z.literal(true).optional(),
  enabled: z.boolean().optional(),
  freeOnly: z.boolean().optional(),
  model: z.enum(ELEVENLABS_MODELS.map((m) => m.id) as [string, ...string[]]).optional(),
});
export type SetElevenLabsInput = z.infer<typeof setElevenLabsSchema>;

export class SetElevenLabsSettingsUseCase {
  async execute(input: SetElevenLabsInput): Promise<void> {
    if (input.apiKey) {
      const test = await testElevenLabsKey(input.apiKey);
      if (!test.ok) throw new ValidationError(`ElevenLabs rechazó la clave y no se guardó: ${test.error}`);
      await saveElevenLabsKey(input.apiKey);
    }
    if (input.removeKey) await clearElevenLabsKey();
    if (input.enabled !== undefined) await setElevenLabsEnabled(input.enabled);
    if (input.freeOnly !== undefined) await setElevenLabsFreeOnly(input.freeOnly);
    if (input.model) await saveElevenLabsModel(input.model as (typeof ELEVENLABS_MODELS)[number]["id"]);
  }
}
