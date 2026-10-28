import { prisma } from "@shared/infrastructure/prisma/client";
import { tuningFrom, type ElevenLabsTuning } from "../domain/elevenlabs-tuning";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import type { VoicePolicy, VoiceProviderKind } from "../domain/voice-policy";
import { synthesizeSpeech, transcribeAudio, type SynthesizedVoice } from "../infrastructure/speech";

/**
 * Voz en el flujo del agente: transcribir lo que manda el cliente, generar la nota de voz de la
 * respuesta, guardar los audios para escucharlos en el panel y sumar su costo al presupuesto de IA.
 */

export interface VoiceSettings extends VoicePolicy {
  transcribeInbound: boolean;
  provider: VoiceProviderKind;
  voiceId: string;
  voiceName: string | null;
  style: string | null;
  /** Solo ElevenLabs; null = los ajustes propios de la voz */
  elevenLabsTuning: ElevenLabsTuning | null;
}

/** Sin configuración guardada el agente entiende las notas de voz, pero responde por texto. */
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  transcribeInbound: true,
  enabled: false,
  provider: "GEMINI",
  voiceId: "Kore",
  voiceName: null,
  style: null,
  elevenLabsTuning: null,
  mode: "MIRROR",
  rules: [],
  intents: [],
  maxSeconds: 40,
  textForData: true,
  alsoSendText: false,
};

export async function loadVoiceSettings(tenantId: string): Promise<VoiceSettings> {
  const row = await prisma.agentVoice.findUnique({ where: { tenantId } });
  if (!row) return DEFAULT_VOICE_SETTINGS;
  return {
    transcribeInbound: row.transcribeInbound,
    enabled: row.enabled,
    provider: row.provider,
    voiceId: row.voiceId,
    voiceName: row.voiceName,
    style: row.style,
    elevenLabsTuning: tuningFrom(row.elevenLabsTuning),
    mode: row.mode,
    rules: row.rules,
    intents: row.intents,
    maxSeconds: row.maxSeconds,
    textForData: row.textForData,
    alsoSendText: row.alsoSendText,
  };
}

export const clipUrl = (id: string): string => `/api/v1/voice-clips/${id}`;

export async function saveClip(input: {
  tenantId: string;
  conversationId: string | null;
  data: Buffer;
  mimeType: string;
  seconds?: number;
}): Promise<string> {
  const clip = await prisma.voiceClip.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      data: new Uint8Array(input.data),
      mimeType: input.mimeType,
      seconds: input.seconds ?? null,
    },
    select: { id: true },
  });
  return clipUrl(clip.id);
}

/** Los audios cuentan en el mismo registro que las respuestas, así entran al presupuesto del mes. */
export async function logVoiceUsage(input: {
  tenantId: string;
  conversationId: string;
  kind: "voz" | "transcripcion";
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
  detail?: string;
}): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        provider: input.provider,
        model: input.model,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        costMicroUsd: input.costMicroUsd,
        intent: input.kind,
        trace: input.detail ? [{ node: input.kind, type: "voz", detail: input.detail }] : undefined,
      },
    });
  } catch (err) {
    console.error(`[voz] no se pudo registrar el costo de ${input.kind}:`, err);
  }
}

/**
 * Nota de voz del cliente: se descarga, se guarda para escucharla en el panel y se transcribe para
 * que el agente la lea como un mensaje más. Si algo falla, el mensaje queda como "nota de voz" y la
 * conversación sigue (el equipo la puede escuchar).
 */
export async function transcribeInboundAudio(input: {
  tenantId: string;
  conversationId: string;
  providerMessageId: string;
  media: { id?: string; data?: Buffer; mimeType?: string };
  whatsapp: WhatsAppProvider;
}): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { waMessageId: input.providerMessageId },
    select: { id: true, content: true },
  });
  if (!message) return;

  try {
    const download = input.media.data
      ? { data: input.media.data, mimeType: input.media.mimeType ?? "audio/ogg" }
      : input.media.id && input.whatsapp.downloadMedia
        ? await input.whatsapp.downloadMedia(input.tenantId, input.media.id)
        : null;
    if (!download) return;

    const mediaUrl = await saveClip({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      data: download.data,
      mimeType: download.mimeType,
    });
    await prisma.message.update({ where: { id: message.id }, data: { mediaUrl } });

    const settings = await loadVoiceSettings(input.tenantId);
    if (!settings.transcribeInbound) return;

    const started = Date.now();
    const result = await transcribeAudio(download.data, download.mimeType);
    await prisma.message.update({ where: { id: message.id }, data: { content: result.text || "[inaudible]" } });
    await logVoiceUsage({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      kind: "transcripcion",
      provider: "gemini",
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costMicroUsd: result.costMicroUsd,
      detail: `nota de voz transcrita en ${Date.now() - started} ms`,
    });
    console.log(`[voz] nota de voz transcrita (${result.text.length} caracteres)`);
  } catch (err) {
    console.error("[voz] no se pudo transcribir la nota de voz:", err);
  }
}

/** Genera la nota de voz de una respuesta con la voz configurada del negocio. */
export function synthesizeReply(settings: VoiceSettings, text: string): Promise<SynthesizedVoice> {
  return synthesizeSpeech({
    provider: settings.provider,
    voiceId: settings.voiceId,
    style: settings.style,
    tuning: settings.elevenLabsTuning,
    text,
  });
}
