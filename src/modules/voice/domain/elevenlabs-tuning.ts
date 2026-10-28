/**
 * Cómo suena una voz de ElevenLabs (voice_settings de su API). Cada negocio lo ajusta en Voz del agente;
 * sin ajustes, ElevenLabs usa los de la voz.
 */
export interface ElevenLabsTuning {
  /** 0,7 (más lenta) a 1,2 (más rápida) */
  speed: number;
  /** 0 a 1: baja = más expresiva y variable; alta = más pareja */
  stability: number;
  /** 0 a 1: qué tanto se ciñe al timbre y al acento de la voz original */
  similarity: number;
  /** 0 a 1: exagera la forma de hablar de la voz (mejor bajo) */
  style: number;
  /** Más claridad en la voz */
  speakerBoost: boolean;
}

export const TUNING_LIMITS = {
  speed: { min: 0.7, max: 1.2 },
  stability: { min: 0, max: 1 },
  similarity: { min: 0, max: 1 },
  style: { min: 0, max: 1 },
} as const;

export const TUNING_PRESETS: Record<"natural" | "pausada" | "energica", { label: string; tuning: ElevenLabsTuning }> = {
  natural: { label: "Natural", tuning: { speed: 1, stability: 0.45, similarity: 0.8, style: 0.15, speakerBoost: true } },
  pausada: { label: "Pausada y clara", tuning: { speed: 0.9, stability: 0.7, similarity: 0.8, style: 0, speakerBoost: true } },
  energica: { label: "Enérgica", tuning: { speed: 1.08, stability: 0.3, similarity: 0.75, style: 0.35, speakerBoost: true } },
};

export const DEFAULT_TUNING = TUNING_PRESETS.natural.tuning;

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Lo guardado (JSON), dentro de los rangos que acepta ElevenLabs; null si nunca se ajustó. */
export function tuningFrom(raw: unknown): ElevenLabsTuning | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    speed: clamp(r.speed, TUNING_LIMITS.speed.min, TUNING_LIMITS.speed.max, DEFAULT_TUNING.speed),
    stability: clamp(r.stability, 0, 1, DEFAULT_TUNING.stability),
    similarity: clamp(r.similarity, 0, 1, DEFAULT_TUNING.similarity),
    style: clamp(r.style, 0, 1, DEFAULT_TUNING.style),
    speakerBoost: typeof r.speakerBoost === "boolean" ? r.speakerBoost : DEFAULT_TUNING.speakerBoost,
  };
}

/** Lo que se le manda a ElevenLabs en "voice_settings". */
export function toElevenLabsVoiceSettings(t: ElevenLabsTuning) {
  return {
    speed: t.speed,
    stability: t.stability,
    similarity_boost: t.similarity,
    style: t.style,
    use_speaker_boost: t.speakerBoost,
  };
}
