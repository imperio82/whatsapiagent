/**
 * Cuándo responde el agente con nota de voz. Es código fijo (nodo "voz" del grafo, después del
 * verificador): la IA solo opina en el modo RULES, a través del router.
 */

export type VoiceReplyMode = "MIRROR" | "RULES" | "ALWAYS";
export type VoiceProviderKind = "GEMINI" | "ELEVENLABS";

export interface VoicePolicy {
  enabled: boolean;
  mode: VoiceReplyMode;
  rules: string[];
  /** Especialistas que pueden responder con voz; vacío = todos */
  intents: string[];
  maxSeconds: number;
  textForData: boolean;
  alsoSendText: boolean;
}

export interface VoiceTurn {
  reply: string;
  intent: string;
  /** El último mensaje del cliente fue una nota de voz */
  clientSentAudio: boolean;
  /** Modo RULES: el router consideró que este turno va con voz */
  routerSuggestsVoice: boolean;
}

export interface VoiceDecision {
  voice: boolean;
  /** Mandar también el texto (debajo del audio) */
  alsoText: boolean;
  reason: string;
}

/** Ritmo de habla en español para estimar la duración antes de generar el audio. */
const CHARS_PER_SECOND = 15;

export function estimateSeconds(text: string): number {
  return Math.ceil(speakableText(text).length / CHARS_PER_SECOND);
}

/**
 * Datos que se leen mejor que se escuchan: precios, cantidades largas, enlaces, correos, teléfonos y
 * códigos de pedido o inventario (PED-0001, INV-0001).
 */
export function hasReadableData(text: string): boolean {
  return (
    /\$\s?\d/.test(text) ||
    /\d[\d.,]{3,}\d/.test(text) ||
    /https?:\/\/|www\./i.test(text) ||
    /[\w.+-]+@[\w-]+\.\w+/.test(text) ||
    /\b[A-Z]{2,5}-\d{2,}\b/.test(text)
  );
}

/** Lo que se lee en voz alta: sin emojis, viñetas ni marcas de formato de WhatsApp. */
export function speakableText(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[*_~`]/g, "")
    .replace(/^\s*[-•·]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function decideVoiceReply(policy: VoicePolicy, turn: VoiceTurn): VoiceDecision {
  const text = (reason: string): VoiceDecision => ({ voice: false, alsoText: false, reason });
  if (!policy.enabled) return text("respuestas con voz apagadas");
  if (!speakableText(turn.reply)) return text("la respuesta no tiene texto para leer");
  if (policy.intents.length > 0 && !policy.intents.includes(turn.intent)) {
    return text(`el especialista ${turn.intent} responde por texto`);
  }

  const wanted =
    policy.mode === "ALWAYS"
      ? "siempre con voz"
      : policy.mode === "MIRROR"
        ? turn.clientSentAudio
          ? "el cliente mandó una nota de voz"
          : null
        : turn.routerSuggestsVoice
          ? "lo pide una regla de voz"
          : null;
  if (!wanted) {
    return text(policy.mode === "MIRROR" ? "el cliente escribió por texto" : "ninguna regla de voz aplica");
  }

  const seconds = estimateSeconds(turn.reply);
  if (seconds > policy.maxSeconds) return text(`muy larga para audio (~${seconds} s de ${policy.maxSeconds} s)`);

  const withData = policy.textForData && hasReadableData(turn.reply);
  return {
    voice: true,
    alsoText: policy.alsoSendText || withData,
    reason: withData ? `${wanted}; también va por texto porque trae precios, enlaces o códigos` : wanted,
  };
}

/** Voces de Gemini. Las descripciones son de Google; el género es el que se percibe al escucharlas. */
export const GEMINI_VOICES: { id: string; tone: string; gender: "femenina" | "masculina" }[] = [
  { id: "Kore", tone: "Firme", gender: "femenina" },
  { id: "Sulafat", tone: "Cálida", gender: "femenina" },
  { id: "Achird", tone: "Amigable", gender: "masculina" },
  { id: "Aoede", tone: "Fresca", gender: "femenina" },
  { id: "Puck", tone: "Animada", gender: "masculina" },
  { id: "Vindemiatrix", tone: "Amable", gender: "femenina" },
  { id: "Charon", tone: "Informativa", gender: "masculina" },
  { id: "Zephyr", tone: "Brillante", gender: "femenina" },
  { id: "Zubenelgenubi", tone: "Casual", gender: "masculina" },
  { id: "Leda", tone: "Juvenil", gender: "femenina" },
  { id: "Sadachbia", tone: "Viva", gender: "masculina" },
  { id: "Despina", tone: "Suave", gender: "femenina" },
  { id: "Algieba", tone: "Suave", gender: "masculina" },
  { id: "Callirrhoe", tone: "Tranquila", gender: "femenina" },
  { id: "Umbriel", tone: "Tranquila", gender: "masculina" },
  { id: "Achernar", tone: "Delicada", gender: "femenina" },
  { id: "Iapetus", tone: "Clara", gender: "masculina" },
  { id: "Erinome", tone: "Clara", gender: "femenina" },
  { id: "Schedar", tone: "Pareja", gender: "masculina" },
  { id: "Gacrux", tone: "Madura", gender: "femenina" },
  { id: "Sadaltager", tone: "Experta", gender: "masculina" },
  { id: "Pulcherrima", tone: "Directa", gender: "femenina" },
  { id: "Orus", tone: "Firme", gender: "masculina" },
  { id: "Laomedeia", tone: "Animada", gender: "femenina" },
  { id: "Fenrir", tone: "Entusiasta", gender: "masculina" },
  { id: "Autonoe", tone: "Brillante", gender: "femenina" },
  { id: "Rasalgethi", tone: "Informativa", gender: "masculina" },
  { id: "Alnilam", tone: "Firme", gender: "masculina" },
  { id: "Enceladus", tone: "Susurrante", gender: "masculina" },
  { id: "Algenib", tone: "Grave", gender: "masculina" },
];

/** Las pruebas de voz del panel cuentan en el presupuesto bajo esta "conversación". */
export const VOICE_PREVIEW_CONVERSATION = "voz-prueba";

export const DEFAULT_VOICE_STYLE = "cálido, cercano y natural, con acento colombiano";
