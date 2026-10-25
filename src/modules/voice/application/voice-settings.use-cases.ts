import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError, ValidationError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { GRAPH_PROFILES } from "@modules/ai/infrastructure/graph/profiles";
import { getWhatsAppProvider, sendsVoiceNotes } from "@modules/whatsapp/infrastructure/provider-factory";
import { GEMINI_VOICES, DEFAULT_VOICE_STYLE, VOICE_PREVIEW_CONVERSATION } from "../domain/voice-policy";
import {
  cloneElevenLabsVoice,
  deleteElevenLabsVoice,
  elevenLabsConfigured,
  elevenLabsModel,
  geminiConfigured,
  geminiTtsModel,
  listElevenLabsVoices,
  synthesizeSpeech,
} from "../infrastructure/speech";
import { elevenLabsCostMicroUsd, geminiTtsCostMicroUsd } from "../infrastructure/voice-pricing";
import { loadVoiceSettings, logVoiceUsage, type VoiceSettings } from "./voice-runtime";


/** Lo que dicen el botón «Escuchar» y la primera prueba de una voz clonada. */
const PREVIEW_TEXT = "¡Hola! Qué gusto saludarte. Cuéntame qué estás buscando y con mucho gusto te ayudo.";

/** Una nota de voz típica del agente: unos 30 segundos, 450 caracteres. */
const TYPICAL_SECONDS = 30;
const TYPICAL_CHARS = 450;

export interface VoiceOptionDto {
  provider: "GEMINI" | "ELEVENLABS";
  voiceId: string;
  name: string;
  description: string;
  /** Voz clonada por este negocio */
  cloned?: boolean;
  /** Id interno de la voz clonada, para borrarla */
  clonedId?: string;
  previewUrl?: string | null;
}

export interface VoiceSettingsDto {
  settings: VoiceSettings;
  /** Especialistas del perfil, para elegir cuáles pueden hablar */
  intents: string[];
  status: {
    geminiConfigured: boolean;
    elevenLabsConfigured: boolean;
    /** El proveedor de WhatsApp conectado puede enviar notas de voz */
    whatsappSendsVoice: boolean;
    whatsappProvider: string;
  };
  voices: VoiceOptionDto[];
  defaultStyle: string;
  /** Costo aproximado de una nota de voz de 30 s, en USD */
  costPerNoteUsd: { GEMINI: number; ELEVENLABS: number };
}

export class GetVoiceSettingsUseCase {
  async execute(): Promise<VoiceSettingsDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { agentProfile: true } });
    if (!tenant) throw new NotFoundError("Negocio no encontrado");
    const wpp = getWhatsAppProvider();
    return {
      settings: await loadVoiceSettings(tenantId),
      intents: [...GRAPH_PROFILES[tenant.agentProfile].intents],
      status: {
        geminiConfigured: geminiConfigured(),
        elevenLabsConfigured: elevenLabsConfigured(),
        whatsappSendsVoice: sendsVoiceNotes(wpp),
        whatsappProvider: wpp.kind,
      },
      voices: await voiceOptions(tenantId),
      defaultStyle: DEFAULT_VOICE_STYLE,
      costPerNoteUsd: {
        GEMINI: geminiTtsCostMicroUsd(geminiTtsModel(), 120, TYPICAL_SECONDS * 25) / 1_000_000,
        ELEVENLABS: elevenLabsCostMicroUsd(TYPICAL_CHARS) / 1_000_000,
      },
    };
  }
}

/**
 * Voces que puede usar el negocio: las de Gemini, las prediseñadas de ElevenLabs y solo sus propias
 * voces clonadas (la cuenta de ElevenLabs es compartida por todos los negocios).
 */
async function voiceOptions(tenantId: string): Promise<VoiceOptionDto[]> {
  const gemini: VoiceOptionDto[] = GEMINI_VOICES.map((v) => ({
    provider: "GEMINI",
    voiceId: v.id,
    name: v.id,
    description: `${v.tone} · ${v.gender}`,
  }));
  if (!elevenLabsConfigured()) return gemini;

  const [account, clones] = await Promise.all([
    listElevenLabsVoices().catch((err) => {
      console.error("[voz] no se pudieron listar las voces de ElevenLabs:", err);
      return [];
    }),
    prisma.clonedVoice.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
  ]);
  const premade: VoiceOptionDto[] = account
    .filter((v) => v.category === "premade")
    .map((v) => ({
      provider: "ELEVENLABS",
      voiceId: v.voiceId,
      name: v.name,
      description: v.description ?? "Voz prediseñada",
      previewUrl: v.previewUrl,
    }));
  const cloned: VoiceOptionDto[] = clones.map((c) => ({
    provider: "ELEVENLABS",
    voiceId: c.providerVoiceId,
    name: c.name,
    description: "Voz clonada de tu negocio",
    cloned: true,
    clonedId: c.id,
  }));
  return [...gemini, ...cloned, ...premade];
}

export const updateVoiceSettingsSchema = z.object({
  transcribeInbound: z.boolean(),
  enabled: z.boolean(),
  provider: z.enum(["GEMINI", "ELEVENLABS"]),
  voiceId: z.string().trim().min(1).max(100),
  voiceName: z.string().trim().max(100).nullable(),
  style: z.string().trim().max(200).nullable(),
  mode: z.enum(["MIRROR", "RULES", "ALWAYS"]),
  rules: z.array(z.string().trim().min(3).max(200)).max(10),
  intents: z.array(z.string()).max(10),
  maxSeconds: z.number().int().min(10).max(120),
  textForData: z.boolean(),
  alsoSendText: z.boolean(),
});
export type UpdateVoiceSettingsInput = z.infer<typeof updateVoiceSettingsSchema>;

export class UpdateVoiceSettingsUseCase {
  async execute(input: UpdateVoiceSettingsInput): Promise<VoiceSettings> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    await assertVoiceAllowed(tenantId, input.provider, input.voiceId);
    if (input.enabled && input.mode === "RULES" && input.rules.length === 0) {
      throw new ValidationError("Escribe al menos una regla de cuándo responder con voz, o elige otro modo");
    }
    const data = { ...input, style: input.style || null, voiceName: input.voiceName || null };
    await prisma.agentVoice.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
    return loadVoiceSettings(tenantId);
  }
}

async function assertVoiceAllowed(tenantId: string, provider: "GEMINI" | "ELEVENLABS", voiceId: string): Promise<void> {
  if (provider === "GEMINI") {
    if (!GEMINI_VOICES.some((v) => v.id === voiceId)) throw new ValidationError("Esa voz de Gemini no existe");
    return;
  }
  if (!elevenLabsConfigured()) throw new ValidationError("ElevenLabs no está disponible en la plataforma");
  const options = await voiceOptions(tenantId);
  if (!options.some((v) => v.provider === "ELEVENLABS" && v.voiceId === voiceId)) {
    throw new ValidationError("Esa voz de ElevenLabs no está disponible para tu negocio");
  }
}

export const previewVoiceSchema = z.object({
  provider: z.enum(["GEMINI", "ELEVENLABS"]),
  voiceId: z.string().trim().min(1).max(100),
  style: z.string().trim().max(200).nullable().optional(),
  text: z.string().trim().max(300).optional(),
});
export type PreviewVoiceInput = z.infer<typeof previewVoiceSchema>;

export interface VoicePreviewDto {
  audio: string; // OGG/Opus en base64
  seconds: number;
  costUsd: number;
}

export class PreviewVoiceUseCase {
  async execute(input: PreviewVoiceInput): Promise<VoicePreviewDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    await assertVoiceAllowed(tenantId, input.provider, input.voiceId);
    const voice = await synthesizeSpeech({
      provider: input.provider,
      voiceId: input.voiceId,
      style: input.style,
      text: input.text || PREVIEW_TEXT,
    });
    await logVoiceUsage({
      tenantId,
      conversationId: VOICE_PREVIEW_CONVERSATION,
      kind: "voz",
      provider: voice.provider,
      model: voice.model,
      tokensIn: voice.unitsIn,
      tokensOut: voice.unitsOut,
      costMicroUsd: voice.costMicroUsd,
      detail: `prueba de la voz ${input.voiceId}`,
    });
    return { audio: voice.ogg.toString("base64"), seconds: voice.seconds, costUsd: voice.costMicroUsd / 1_000_000 };
  }
}

const MAX_SAMPLE_BYTES = 10 * 1024 * 1024;

export class CloneVoiceUseCase {
  /** Clonación instantánea en ElevenLabs con audios de la persona, que debe haber dado su autorización. */
  async execute(input: { name: string; consent: boolean; files: File[] }): Promise<VoiceOptionDto> {
    authorize("tenant.settings");
    const { tenantId, userId } = TenantContext.require();
    if (!elevenLabsConfigured()) throw new ValidationError("ElevenLabs no está disponible en la plataforma");
    const name = input.name.trim();
    if (name.length < 2 || name.length > 60) throw new ValidationError("Ponle a la voz un nombre de 2 a 60 caracteres");
    if (!input.consent) {
      throw new ValidationError("Confirma que tienes la autorización de la persona dueña de la voz");
    }
    if (input.files.length === 0 || input.files.length > 5) throw new ValidationError("Sube de 1 a 5 audios de la voz");
    for (const f of input.files) {
      if (!f.type.startsWith("audio/")) throw new ValidationError(`«${f.name}» no es un audio`);
      if (f.size > MAX_SAMPLE_BYTES) throw new ValidationError(`«${f.name}» pesa más de 10 MB`);
    }
    if ((await prisma.clonedVoice.count({ where: { tenantId } })) >= 3) {
      throw new ValidationError("Ya tienes 3 voces clonadas: borra una para clonar otra");
    }

    const samples = await Promise.all(
      input.files.map(async (f) => ({ name: f.name, type: f.type, data: Buffer.from(await f.arrayBuffer()) })),
    );
    const providerVoiceId = await cloneElevenLabsVoice(`${name} · ${tenantId.slice(-6)}`, samples);
    const clone = await prisma.clonedVoice.create({ data: { tenantId, providerVoiceId, name, consentById: userId } });
    return {
      provider: "ELEVENLABS",
      voiceId: providerVoiceId,
      name,
      description: `Voz clonada de tu negocio · ${elevenLabsModel()}`,
      cloned: true,
      clonedId: clone.id,
    };
  }
}

export class DeleteClonedVoiceUseCase {
  async execute(id: string): Promise<void> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const clone = await prisma.clonedVoice.findFirst({ where: { id, tenantId } });
    if (!clone) throw new NotFoundError("Voz no encontrada");
    await deleteElevenLabsVoice(clone.providerVoiceId);
    await prisma.clonedVoice.delete({ where: { id } });
    // Si el agente usaba esa voz, vuelve a la de Gemini por defecto
    await prisma.agentVoice.updateMany({
      where: { tenantId, voiceId: clone.providerVoiceId },
      data: { provider: "GEMINI", voiceId: "Kore", voiceName: null },
    });
  }
}

export class GetVoiceClipUseCase {
  async execute(id: string): Promise<{ data: Buffer; mimeType: string }> {
    const { tenantId } = TenantContext.require();
    const clip = await prisma.voiceClip.findFirst({ where: { id, tenantId }, select: { data: true, mimeType: true } });
    if (!clip) throw new NotFoundError("Audio no encontrado");
    return { data: Buffer.from(clip.data), mimeType: clip.mimeType };
  }
}
