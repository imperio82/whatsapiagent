/**
 * Precios aproximados de voz (USD), igual que pricing.ts: sirven para el presupuesto del negocio y los
 * costos de la plataforma, no para facturar. Revísalos cuando cambien las tarifas.
 */

/** Gemini TTS: USD por millón de tokens de texto (entrada) y de audio (salida; 25 tokens por segundo). */
const GEMINI_TTS: Array<[prefix: string, inPerMillion: number, outPerMillion: (now: Date) => number]> = [
  // Preview: $6 hasta el 31 de diciembre de 2026 y $12 desde el 1 de enero de 2027
  ["gemini-3.8-flash-lite-tts", 0.5, (now) => (now >= new Date(2027, 0, 1) ? 12 : 6)],
  ["gemini-3.8-flash-tts", 1, (now) => (now >= new Date(2027, 0, 1) ? 9 : 18)],
  ["gemini-3.1-flash-tts", 1, () => 20],
  ["gemini-2.5-pro-preview-tts", 1, () => 20],
  ["gemini-2.5-flash-preview-tts", 0.5, () => 10],
];

export function geminiTtsCostMicroUsd(model: string, textTokens: number, audioTokens: number, now = new Date()): number {
  const row = GEMINI_TTS.find(([prefix]) => model.startsWith(prefix)) ?? GEMINI_TTS[0]!;
  return Math.round(textTokens * row[1] + audioTokens * row[2](now));
}

/** ElevenLabs se cobra por carácter: Flash v2.5 ~US$ 0,04 por cada 1.000 (ELEVENLABS_USD_PER_1K_CHARS). */
export function elevenLabsCostMicroUsd(characters: number): number {
  const per1k = Number(process.env.ELEVENLABS_USD_PER_1K_CHARS);
  return Math.round(characters * (Number.isFinite(per1k) && per1k > 0 ? per1k : 0.04) * 1000);
}

/** Transcripción con Gemini: el audio de entrada vale más que el texto. USD por millón de tokens. */
const TRANSCRIBE: Array<[prefix: string, audioInPerMillion: number, outPerMillion: number]> = [
  ["gemini-flash-lite", 0.3, 0.4],
  ["gemini-2.5-flash-lite", 0.3, 0.4],
  ["gemini-3.1-flash-lite", 0.5, 1.5],
  ["gemini-flash", 1, 2.5],
  ["gemini-2.5-flash", 1, 2.5],
];

export function transcriptionCostMicroUsd(model: string, tokensIn: number, tokensOut: number): number {
  const row = TRANSCRIBE.find(([prefix]) => model.startsWith(prefix)) ?? TRANSCRIBE[0]!;
  return Math.round(tokensIn * row[1] + tokensOut * row[2]);
}
