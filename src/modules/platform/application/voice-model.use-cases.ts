import { z } from "zod";
import { ValidationError } from "@shared/domain/errors";
import { TTS_MODELS, findTtsModel } from "@modules/voice/domain/voice-models";
import { envTtsModel, resolveTtsModel, saveTtsModel } from "@modules/voice/infrastructure/voice-model-setting";
import { geminiConfigured, testGeminiTts } from "@modules/voice/infrastructure/speech";
import { geminiTtsCostMicroUsd } from "@modules/voice/infrastructure/voice-pricing";
import { usdCopRate } from "./platform.use-cases";

/** Gemini cuenta 25 tokens de audio por segundo */
const AUDIO_TOKENS_PER_MINUTE = 60 * 25;
/** Tokens de texto de un minuto de lectura, más las notas de tono */
const TEXT_TOKENS_PER_MINUTE = 250;
const TEST_TIMEOUT_MS = 30_000;

export interface VoiceModelOptionDto {
  id: string;
  label: string;
  note: string;
  minuteUsd: number;
  minuteCop: number;
}

export interface VoiceModelDto {
  current: { modelName: string; source: "panel" | "env" };
  /** El de GEMINI_TTS_MODEL, al que se vuelve si se quita el del panel */
  env: string;
  /** Falta GEMINI_API_KEY */
  available: boolean;
  usdCopRate: number;
  options: VoiceModelOptionDto[];
}

export class GetVoiceModelUseCase {
  async execute(now = new Date()): Promise<VoiceModelDto> {
    const current = await resolveTtsModel();
    const rate = usdCopRate();
    // Un modelo puesto a mano en el .env que no está en la lista también se muestra
    const extra = findTtsModel(current.modelName)
      ? []
      : [{ id: current.modelName, label: current.modelName, note: "Puesto en las variables de entorno." }];
    return {
      current,
      env: envTtsModel(),
      available: geminiConfigured(),
      usdCopRate: rate,
      options: [...TTS_MODELS, ...extra].map((m) => {
        const minuteUsd = geminiTtsCostMicroUsd(m.id, TEXT_TOKENS_PER_MINUTE, AUDIO_TOKENS_PER_MINUTE, now) / 1_000_000;
        return { ...m, minuteUsd, minuteCop: minuteUsd * rate };
      }),
    };
  }
}

/** model null = quitar el del panel y volver a GEMINI_TTS_MODEL */
export const setVoiceModelSchema = z.object({ model: z.string().min(1).nullable() });
export type SetVoiceModelInput = z.infer<typeof setVoiceModelSchema>;

export class SetVoiceModelUseCase {
  async execute(input: SetVoiceModelInput): Promise<void> {
    if (input.model === null) return saveTtsModel(null);

    const option = findTtsModel(input.model);
    if (!option) throw new ValidationError("Ese modelo de voz no está en la lista");
    if (!geminiConfigured()) throw new ValidationError("Falta GEMINI_API_KEY en las variables de entorno");

    // Una frase corta (fracciones de peso) antes de guardar: si el modelo no existe o no hay cupo,
    // los negocios no se quedan sin notas de voz
    try {
      await Promise.race([
        testGeminiTts(option.id),
        new Promise((_, reject) => setTimeout(() => reject(new Error("no respondió a tiempo")), TEST_TIMEOUT_MS)),
      ]);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      throw new ValidationError(`${option.label} no generó la voz de prueba y no se cambió: ${message.slice(0, 200)}`);
    }
    await saveTtsModel(option.id);
  }
}
