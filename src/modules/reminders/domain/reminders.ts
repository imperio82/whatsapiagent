/**
 * Reglas de los recordatorios, sin base de datos: cuándo toca cada uno, qué mensaje lleva y si
 * puede salir solo. Las usa el servicio programado (reminders.service.ts) y se prueban aparte.
 */

export type ReminderKindValue = "APPOINTMENT" | "FOLLOW_UP" | "CUSTOM";
export type ReminderTemplateKey = "APPOINTMENT" | "FOLLOW_UP";
export type AlertMode = "APPROVAL" | "AUTO";

export const REMINDER_KIND_LABELS: Record<ReminderKindValue, string> = {
  APPOINTMENT: "Cita",
  FOLLOW_UP: "Seguimiento",
  CUSTOM: "Libre",
};

export const DEFAULT_REMINDER_TEMPLATES: Record<ReminderTemplateKey, string> = {
  APPOINTMENT:
    "Hola, {nombre} 👋 Te escribe {asesor} de {negocio} para recordarte tu cita el {fecha} a las {hora}{bien}. ¿Me confirmas que nos vemos? Si necesitas cambiar la hora, avísame por aquí.",
  FOLLOW_UP:
    "Hola, {nombre} 😊 Te escribe {asesor} de {negocio}. ¿Pudiste pensar en lo que hablamos? Si tienes alguna pregunta o quieres que te muestre más opciones, aquí estoy para ayudarte.",
};

export const REMINDER_TEMPLATE_LABELS: Record<ReminderTemplateKey, string> = {
  APPOINTMENT: "Recordatorio de cita",
  FOLLOW_UP: "Seguimiento",
};

export const REMINDER_PLACEHOLDERS: Record<ReminderTemplateKey, string[]> = {
  APPOINTMENT: ["{nombre}", "{negocio}", "{asesor}", "{fecha}", "{hora}", "{bien}"],
  FOLLOW_UP: ["{nombre}", "{negocio}", "{asesor}"],
};

/** Horario en que un recordatorio automático puede salir (hora de Colombia). */
export const AUTO_HOURS = { from: 8, to: 20 };
/** Un recordatorio pendiente que nadie aprobó se descarta a los 3 días. */
export const EXPIRE_AFTER_MS = 3 * 86_400_000;
/** El seguimiento solo mira silencios recientes: al activarlo no se escribe a chats viejos. */
export const FOLLOW_UP_LOOKBACK_MS = 7 * 86_400_000;

const HOUR_MS = 3_600_000;

/** Plantillas del negocio sobre las de fábrica; una vacía hereda la de fábrica. */
export function reminderTemplatesFrom(raw: unknown): Record<ReminderTemplateKey, string> {
  const custom = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<ReminderTemplateKey, unknown>>;
  const pick = (key: ReminderTemplateKey) =>
    typeof custom[key] === "string" && (custom[key] as string).trim() ? (custom[key] as string) : DEFAULT_REMINDER_TEMPLATES[key];
  return { APPOINTMENT: pick("APPOINTMENT"), FOLLOW_UP: pick("FOLLOW_UP") };
}

/** Llena la plantilla. Sin nombre saluda sin nombre ("Hola 👋" en vez de "Hola, 👋"). */
export function renderReminder(template: string, values: Record<string, string>): string {
  let text = template;
  for (const [key, value] of Object.entries(values)) text = text.split(key).join(value);
  return text
    .replace(/,\s*([.!?¡])/g, "$1")
    .replace(/,(\s*\p{Extended_Pictographic})/gu, "$1")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Cuándo se le recuerda la cita al cliente: `hoursBefore` antes. Si la cita se agendó con menos
 * anticipación, se le recuerda ya, siempre que falten al menos 2 horas (antes de eso no tiene sentido).
 * null: no hay que recordarla.
 */
export function appointmentReminderDue(scheduledAt: Date, hoursBefore: number, now: Date): Date | null {
  if (scheduledAt.getTime() - now.getTime() < 2 * HOUR_MS) return null;
  const due = new Date(scheduledAt.getTime() - hoursBefore * HOUR_MS);
  return due < now ? now : due;
}

/**
 * ¿Toca escribirle al cliente que dejó de responder? Solo si el último mensaje de la conversación es
 * del negocio (el cliente quedó debiendo la respuesta), el cliente sí había escrito antes, pasaron
 * las horas configuradas desde ese silencio y no es un silencio viejo.
 */
export function followUpDue(
  input: { lastMessageAt: Date; lastMessageInbound: boolean; lastInboundAt: Date | null; hours: number },
  now: Date,
): boolean {
  if (input.lastMessageInbound || !input.lastInboundAt) return false;
  const silentFor = now.getTime() - input.lastMessageAt.getTime();
  return silentFor >= input.hours * HOUR_MS && silentFor <= input.hours * HOUR_MS + FOLLOW_UP_LOOKBACK_MS;
}

/** ¿Sale solo? Las citas y el seguimiento según el modo del negocio; los libres según el asesor. */
export function sendsAutomatically(
  reminder: { kind: ReminderKindValue; autoSend: boolean },
  modes: { appointment: AlertMode; followUp: AlertMode },
): boolean {
  if (reminder.kind === "CUSTOM") return reminder.autoSend;
  return (reminder.kind === "APPOINTMENT" ? modes.appointment : modes.followUp) === "AUTO";
}

/** Los automáticos de citas y seguimiento respetan el horario; un libre sale a la hora que eligió el asesor. */
export function withinAutoHours(kind: ReminderKindValue, localHour: number): boolean {
  if (kind === "CUSTOM") return true;
  return localHour >= AUTO_HOURS.from && localHour < AUTO_HOURS.to;
}
