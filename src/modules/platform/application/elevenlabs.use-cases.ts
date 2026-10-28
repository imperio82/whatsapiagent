import { z } from "zod";
import { ValidationError } from "@shared/domain/errors";
import {
  clearElevenLabsKey,
  elevenLabsKeyStatus,
  saveElevenLabsKey,
  setElevenLabsEnabled,
  testElevenLabsKey,
  type ElevenLabsKeyStatus,
} from "@modules/voice/infrastructure/elevenlabs-key";

export type ElevenLabsSettingsDto = ElevenLabsKeyStatus;

export class GetElevenLabsSettingsUseCase {
  execute(): Promise<ElevenLabsSettingsDto> {
    return elevenLabsKeyStatus();
  }
}

/** apiKey: la prueba y la guarda cifrada · removeKey: la borra del panel · enabled: prende o apaga ElevenLabs */
export const setElevenLabsSchema = z.object({
  apiKey: z.string().trim().min(20, "La clave de ElevenLabs es más larga").max(200).optional(),
  removeKey: z.literal(true).optional(),
  enabled: z.boolean().optional(),
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
  }
}
