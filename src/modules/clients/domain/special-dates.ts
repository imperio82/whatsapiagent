/**
 * Fechas especiales de los clientes (cumpleaños, aniversarios, fechas propias) y el mensaje
 * de felicitación. Lógica pura para poder probarla sin base de datos.
 */

export type ClientDateKindValue = "BIRTHDAY" | "ANNIVERSARY" | "CUSTOM";

/** Claves de plantilla: el cumpleaños de otra persona del círculo del cliente lleva un texto distinto. */
export type GreetingTemplateKey = "BIRTHDAY" | "BIRTHDAY_OTHER" | "ANNIVERSARY" | "CUSTOM";

export const DATE_KIND_LABELS: Record<ClientDateKindValue, string> = {
  BIRTHDAY: "Cumpleaños",
  ANNIVERSARY: "Aniversario",
  CUSTOM: "Fecha especial",
};

export const DEFAULT_GREETING_TEMPLATES: Record<GreetingTemplateKey, string> = {
  BIRTHDAY: "¡Feliz cumpleaños, {nombre}! 🎉 De parte de todo el equipo de {negocio} le deseamos un día maravilloso y un año lleno de bendiciones.",
  BIRTHDAY_OTHER:
    "Hola, {nombre}. Hoy está de cumpleaños {persona} 🎉. De parte de {negocio}, por favor hágale llegar un saludo muy especial.",
  ANNIVERSARY: "Hola, {nombre}. Hoy es una fecha especial: {motivo}. En {negocio} queremos acompañarle con un saludo. ¡Felicitaciones!",
  CUSTOM: "Hola, {nombre}. Hoy recordamos una fecha especial: {motivo}. De parte de {negocio}, ¡un saludo muy especial!",
};

export const TEMPLATE_KEY_LABELS: Record<GreetingTemplateKey, string> = {
  BIRTHDAY: "Cumpleaños del cliente",
  BIRTHDAY_OTHER: "Cumpleaños de alguien de su círculo",
  ANNIVERSARY: "Aniversario",
  CUSTOM: "Otra fecha especial",
};

export const TEMPLATE_PLACEHOLDERS = ["{nombre}", "{persona}", "{motivo}", "{negocio}", "{asesor}", "{años}"] as const;

export interface SpecialDate {
  kind: ClientDateKindValue;
  month: number;
  day: number;
  year: number | null;
  label: string | null;
  personName: string | null;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isValidMonthDay(month: number, day: number): boolean {
  return Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1]!;
}

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * ¿La fecha se celebra el `day` local "YYYY-MM-DD"? El 29 de febrero se celebra el 28 en años
 * no bisiestos, para que nadie se quede sin su saludo.
 */
export function occursOn(date: Pick<SpecialDate, "month" | "day">, localDay: string): boolean {
  const [y, m, d] = localDay.split("-").map(Number) as [number, number, number];
  if (date.month === m && date.day === d) return true;
  return date.month === 2 && date.day === 29 && m === 2 && d === 28 && !isLeap(y);
}

/** Pares (mes, día) que hay que buscar en la base para un día local, incluyendo el caso del 29 de febrero. */
export function monthDayKeys(localDay: string): { month: number; day: number }[] {
  const [y, m, d] = localDay.split("-").map(Number) as [number, number, number];
  const keys = [{ month: m, day: d }];
  if (m === 2 && d === 28 && !isLeap(y)) keys.push({ month: 2, day: 29 });
  return keys;
}

export function templateKeyFor(date: Pick<SpecialDate, "kind" | "personName">): GreetingTemplateKey {
  if (date.kind === "BIRTHDAY") return date.personName ? "BIRTHDAY_OTHER" : "BIRTHDAY";
  return date.kind;
}

/** Plantillas del negocio sobre las de fábrica. */
export function templatesFrom(stored: unknown): Record<GreetingTemplateKey, string> {
  const result = { ...DEFAULT_GREETING_TEMPLATES };
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const key of Object.keys(result) as GreetingTemplateKey[]) {
      const value = (stored as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) result[key] = value.trim();
    }
  }
  return result;
}

export interface GreetingContext {
  clientName: string | null;
  businessName: string;
  agentName: string;
  /** Año del día en que se felicita, para calcular {años}. */
  year: number;
}

/** Llena la plantilla. Si falta el nombre del cliente se saluda sin nombre ("Hola." en vez de "Hola, ."). */
export function renderGreeting(template: string, date: SpecialDate, ctx: GreetingContext): string {
  const years = date.year ? ctx.year - date.year : null;
  const motive = date.label ?? DATE_KIND_LABELS[date.kind].toLowerCase();
  const values: Record<string, string> = {
    "{nombre}": ctx.clientName ?? "",
    "{persona}": date.personName ?? "",
    "{motivo}": motive,
    "{negocio}": ctx.businessName,
    "{asesor}": ctx.agentName,
    "{años}": years && years > 0 ? String(years) : "",
  };
  let text = template;
  for (const [key, value] of Object.entries(values)) text = text.split(key).join(value);
  return text
    .replace(/,\s*([.!?¡])/g, "$1") // "Hola, ." → "Hola."
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** "15 de marzo" (y el año si se sabe). */
export function formatMonthDay(date: Pick<SpecialDate, "month" | "day" | "year">): string {
  const month = new Date(Date.UTC(2000, date.month - 1, 1)).toLocaleString("es-CO", { month: "long", timeZone: "UTC" });
  return `${date.day} de ${month}${date.year ? ` de ${date.year}` : ""}`;
}
