import { InfrastructureError } from "@shared/domain/errors";
import { speakableText, type VoiceProviderKind } from "../domain/voice-policy";
import { encodeOggOpus, parseWav, pcmSeconds, type PcmAudio } from "./ogg-opus";
import { elevenLabsCostMicroUsd, geminiTtsCostMicroUsd, transcriptionCostMicroUsd } from "./voice-pricing";
import { resolveTtsModel } from "./voice-model-setting";
import { elevenLabsApiKey } from "./elevenlabs-key";

/**
 * Voz con Gemini (incluida, con la misma clave del agente) y ElevenLabs (voces premium y clonadas).
 * Todo sale como nota de voz OGG/Opus lista para WhatsApp, con su costo para el presupuesto del negocio.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

/**
 * Si el principal falla por cupo (por ejemplo, el límite diario del plan gratuito) o por un error
 * pasajero, se intenta con este antes de responder por texto.
 */
const geminiTtsFallbackModel = (): string => process.env.GEMINI_TTS_FALLBACK_MODEL ?? "gemini-3.8-flash-tts";
export const elevenLabsModel = (): string => process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5";
/** Modelo que escucha las notas de voz de los clientes. */
export const transcribeModel = (): string => process.env.GEMINI_TRANSCRIBE_MODEL ?? "gemini-flash-lite-latest";

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/** Hay clave de ElevenLabs (del panel o del .env) y está prendido en /plataforma. */
export async function elevenLabsConfigured(): Promise<boolean> {
  return !!(await elevenLabsApiKey());
}

export interface SynthesizedVoice {
  ogg: Buffer;
  seconds: number;
  provider: string;
  model: string;
  /** Gemini: tokens de texto y de audio; ElevenLabs: caracteres y 0 */
  unitsIn: number;
  unitsOut: number;
  costMicroUsd: number;
}

export interface SpeechInput {
  provider: VoiceProviderKind;
  voiceId: string;
  style?: string | null;
  text: string;
}

export async function synthesizeSpeech(input: SpeechInput): Promise<SynthesizedVoice> {
  const text = speakableText(input.text);
  if (!text) throw new InfrastructureError("No hay texto para convertir en voz");
  return input.provider === "ELEVENLABS" ? elevenLabsSpeech(input.voiceId, text) : geminiSpeech(input.voiceId, input.style, text);
}

async function geminiSpeech(voiceName: string, style: string | null | undefined, text: string): Promise<SynthesizedVoice> {
  const { modelName } = await resolveTtsModel();
  try {
    return await geminiSpeechWith(modelName, voiceName, style, text);
  } catch (err) {
    if (!(err instanceof RetryableVoiceError) || geminiTtsFallbackModel() === modelName) throw err;
    console.warn(`[voz] ${err.message}; se intenta con ${geminiTtsFallbackModel()}`);
    return geminiSpeechWith(geminiTtsFallbackModel(), voiceName, style, text);
  }
}

/** Prueba un modelo con una frase corta, sin respaldo: así se sabe si ese modelo en sí funciona. */
export function testGeminiTts(model: string): Promise<SynthesizedVoice> {
  return geminiSpeechWith(model, "Kore", null, "Hola, esta es una prueba de voz.");
}

class RetryableVoiceError extends InfrastructureError {}

async function geminiSpeechWith(
  model: string,
  voiceName: string,
  style: string | null | undefined,
  text: string,
): Promise<SynthesizedVoice> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new InfrastructureError("Falta GEMINI_API_KEY para generar la voz");
  // El tono va en notas de dirección separadas de lo que se lee: escrito delante del texto
  // ("Dilo con un tono…:") a veces se lee en voz alta; así no se leyó en ninguna prueba
  const prompt = style?.trim() ? `### NOTAS DE DIRECCIÓN\nTono: ${style.trim()}.\n\n### TRANSCRIPCIÓN\n${text}` : text;
  const res = await safeFetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    }),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  if (res.status === 429) throw new RetryableVoiceError(`${model} sin cupo`);
  // A veces el modelo intenta responder con texto en vez de leer: se reintenta con el de respaldo
  if (res.status >= 500 || /only be used for TTS/i.test(json.error?.message ?? "")) {
    throw new RetryableVoiceError(`${model} falló (${res.status})`);
  }
  if (!res.ok) throw new InfrastructureError(`Gemini no generó la voz: ${json.error?.message ?? res.status}`);
  const inline = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!inline?.data) throw new InfrastructureError("Gemini respondió sin audio");

  const raw = Buffer.from(inline.data, "base64");
  // Según el modelo llega WAV o PCM crudo ("audio/L16;codec=pcm;rate=24000")
  const audio: PcmAudio = inline.mimeType?.includes("wav")
    ? parseWav(raw)
    : { pcm: raw, sampleRate: Number(/rate=(\d+)/.exec(inline.mimeType ?? "")?.[1] ?? 24000) as PcmAudio["sampleRate"] };
  const textTokens = json.usageMetadata?.promptTokenCount ?? 0;
  const audioTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
  return {
    ogg: encodeOggOpus(audio),
    seconds: pcmSeconds(audio),
    provider: "gemini-tts",
    model,
    unitsIn: textTokens,
    unitsOut: audioTokens,
    costMicroUsd: geminiTtsCostMicroUsd(model, textTokens, audioTokens),
  };
}

async function elevenLabsSpeech(voiceId: string, text: string): Promise<SynthesizedVoice> {
  const apiKey = await elevenLabsApiKey();
  if (!apiKey) throw new InfrastructureError("La plataforma no tiene ElevenLabs activo");
  const model = elevenLabsModel();
  const res = await safeFetch(
    `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({ text, model_id: model, language_code: "es" }),
    },
  );
  if (!res.ok) throw new InfrastructureError(`ElevenLabs no generó la voz: ${await elevenLabsError(res)}`);
  const audio: PcmAudio = { pcm: Buffer.from(await res.arrayBuffer()), sampleRate: 24_000 };
  return {
    ogg: encodeOggOpus(audio),
    seconds: pcmSeconds(audio),
    provider: "elevenlabs",
    model,
    unitsIn: text.length,
    unitsOut: 0,
    costMicroUsd: elevenLabsCostMicroUsd(text.length),
  };
}

export interface Transcription {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
}

/** Escucha una nota de voz del cliente y devuelve lo que dijo. */
export async function transcribeAudio(audio: Buffer, mimeType: string): Promise<Transcription> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new InfrastructureError("Falta GEMINI_API_KEY para transcribir notas de voz");
  const model = transcribeModel();
  const res = await safeFetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: "Transcribe exactamente lo que dice esta nota de voz de un cliente, en el idioma en que habla. Devuelve solo la transcripción, sin comillas ni comentarios. Si no se entiende nada, responde [inaudible].",
            },
            // WhatsApp manda "audio/ogg; codecs=opus"; Gemini quiere el tipo sin parámetros
            { inlineData: { mimeType: mimeType.split(";")[0]!.trim() || "audio/ogg", data: audio.toString("base64") } },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    }),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  if (!res.ok) throw new InfrastructureError(`Gemini no transcribió el audio: ${json.error?.message ?? res.status}`);
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  const tokensIn = json.usageMetadata?.promptTokenCount ?? 0;
  const tokensOut = json.usageMetadata?.candidatesTokenCount ?? 0;
  return { text, model, tokensIn, tokensOut, costMicroUsd: transcriptionCostMicroUsd(model, tokensIn, tokensOut) };
}

// ── ElevenLabs: voces prediseñadas y clonadas ─────────────────────────────

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  /** premade (de ElevenLabs), professional o generated (de la Voice Library o diseñadas), cloned… */
  category: string;
  description: string | null;
  previewUrl: string | null;
  /** Código de idioma ("es", "en") y acento ("colombian", "american"), si ElevenLabs los trae */
  language: string | null;
  accent: string | null;
}

export async function listElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
  const apiKey = await elevenLabsApiKey();
  if (!apiKey) return [];
  const res = await safeFetch(`${ELEVENLABS_BASE}/voices`, { headers: { "xi-api-key": apiKey } });
  if (!res.ok) throw new InfrastructureError(`ElevenLabs no devolvió las voces: ${await elevenLabsError(res)}`);
  const json = (await res.json()) as {
    voices?: {
      voice_id: string;
      name: string;
      category?: string;
      description?: string | null;
      preview_url?: string | null;
      labels?: Record<string, string>;
      verified_languages?: { language?: string; accent?: string }[];
    }[];
  };
  return (json.voices ?? []).map((v) => {
    // Las voces de la Voice Library traen el idioma en labels o en verified_languages
    const spanish = v.verified_languages?.find((l) => l.language === "es");
    const verified = spanish ?? v.verified_languages?.[0];
    return {
      voiceId: v.voice_id,
      name: v.name,
      category: v.category ?? "premade",
      description: v.description ?? (v.labels ? Object.values(v.labels).join(", ") : null),
      previewUrl: v.preview_url ?? null,
      language: v.labels?.language ?? verified?.language ?? null,
      accent: v.labels?.accent ?? verified?.accent ?? null,
    };
  });
}

/** Clonación instantánea: con uno o varios audios de la persona (lo ideal, 1 a 3 minutos en total). */
export async function cloneElevenLabsVoice(name: string, samples: { name: string; type: string; data: Buffer }[]): Promise<string> {
  const apiKey = await elevenLabsApiKey();
  if (!apiKey) throw new InfrastructureError("La plataforma no tiene ElevenLabs activo");
  const form = new FormData();
  form.append("name", name);
  form.append("remove_background_noise", "true");
  for (const s of samples) form.append("files", new Blob([new Uint8Array(s.data)], { type: s.type }), s.name);
  const res = await safeFetch(`${ELEVENLABS_BASE}/voices/add`, { method: "POST", headers: { "xi-api-key": apiKey }, body: form });
  if (!res.ok) throw new InfrastructureError(`ElevenLabs no clonó la voz: ${await elevenLabsError(res)}`);
  const json = (await res.json()) as { voice_id?: string };
  if (!json.voice_id) throw new InfrastructureError("ElevenLabs respondió sin id de voz");
  return json.voice_id;
}

export async function deleteElevenLabsVoice(voiceId: string): Promise<void> {
  const apiKey = await elevenLabsApiKey();
  if (!apiKey) return;
  const res = await safeFetch(`${ELEVENLABS_BASE}/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok && res.status !== 404) throw new InfrastructureError(`ElevenLabs no borró la voz: ${await elevenLabsError(res)}`);
}

async function elevenLabsError(res: Response): Promise<string> {
  const body = await res.text();
  try {
    const parsed = JSON.parse(body) as { detail?: string | { message?: string } };
    return typeof parsed.detail === "string" ? parsed.detail : (parsed.detail?.message ?? `HTTP ${res.status}`);
  } catch {
    return body || `HTTP ${res.status}`;
  }
}

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    console.error("[voz] sin conexión con el proveedor de voz:", err);
    throw new InfrastructureError("No se pudo conectar con el proveedor de voz");
  }
}
