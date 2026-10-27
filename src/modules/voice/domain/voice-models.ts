/**
 * Modelos de voz de Gemini que se pueden elegir en /plataforma. Todos usan las mismas 30 voces y el mismo
 * tono escrito; cambian la naturalidad, la velocidad y el precio (ver voice-pricing.ts).
 */
export interface TtsModelOption {
  id: string;
  label: string;
  note: string;
}

export const TTS_MODELS: TtsModelOption[] = [
  {
    id: "gemini-3.8-flash-lite-tts",
    label: "Gemini 3.8 Flash Lite TTS",
    note: "El más barato. Buena voz en español y rápido; recomendado para notas de voz de WhatsApp.",
  },
  {
    id: "gemini-3.8-flash-tts",
    label: "Gemini 3.8 Flash TTS",
    note: "Más natural y expresivo que el Lite, con mejor manejo del tono. Cuesta más por minuto.",
  },
  {
    id: "gemini-3.1-flash-tts",
    label: "Gemini 3.1 Flash TTS",
    note: "Generación anterior. Solo si los nuevos fallan.",
  },
  {
    id: "gemini-2.5-flash-preview-tts",
    label: "Gemini 2.5 Flash TTS (preview)",
    note: "El primero que salió. Más plano en español.",
  },
  {
    id: "gemini-2.5-pro-preview-tts",
    label: "Gemini 2.5 Pro TTS (preview)",
    note: "Más lento y caro; no suele valer la pena para notas cortas.",
  },
];

export function findTtsModel(id: string): TtsModelOption | undefined {
  return TTS_MODELS.find((m) => m.id === id);
}
