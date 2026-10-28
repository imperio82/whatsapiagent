import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TUNING, toElevenLabsVoiceSettings, tuningFrom } from "./elevenlabs-tuning";

describe("ajustes de voz de ElevenLabs", () => {
  it("sin ajustes guardados no manda nada (usa los de la voz)", () => {
    assert.equal(tuningFrom(null), null);
  });

  it("deja los valores dentro de los rangos de ElevenLabs", () => {
    assert.deepEqual(tuningFrom({ speed: 2, stability: -1, similarity: 0.9, style: "x", speakerBoost: false }), {
      speed: 1.2,
      stability: 0,
      similarity: 0.9,
      style: DEFAULT_TUNING.style,
      speakerBoost: false,
    });
  });

  it("se traduce a los nombres de la API", () => {
    assert.deepEqual(toElevenLabsVoiceSettings(DEFAULT_TUNING), {
      speed: 1,
      stability: 0.45,
      similarity_boost: 0.8,
      style: 0.15,
      use_speaker_boost: true,
    });
  });
});
