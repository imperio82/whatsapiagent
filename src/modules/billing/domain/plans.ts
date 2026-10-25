/**
 * Planes que se venden. Lo usan la landing, el contador del encabezado, el panel del administrador y el
 * freno del agente, así que cambiar un precio o un cupo aquí lo cambia en todas partes.
 */

export type PlanTier = "EMPRENDE" | "PRO" | "NEGOCIO";

export interface Plan {
  tier: PlanTier;
  name: string;
  priceCop: number;
  /** Clientes distintos que escriben en el mes */
  chats: number;
  users: number;
  /** Lo que puede gastar la IA en el mes antes de detenerse, sin contar los créditos que se le sumen */
  aiBudgetUsd: number;
  tagline: string;
  features: string[];
  highlighted?: boolean;
}

export const PLANS: Record<PlanTier, Plan> = {
  EMPRENDE: {
    tier: "EMPRENDE",
    name: "Emprende",
    priceCop: 129_000,
    chats: 500,
    users: 1,
    aiBudgetUsd: 5,
    tagline: "Para empezar a vender por WhatsApp sin contratar a nadie.",
    features: [
      "Agente de IA que responde las 24 horas",
      "Habilidades del agente editables y simulador",
      "Clientes, leads y pedidos en un solo lugar",
      "Hasta 100 productos o bienes",
      "Paso a una persona cuando el cliente lo pide",
      "Soporte por correo",
    ],
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    priceCop: 299_000,
    chats: 1_500,
    users: 3,
    aiBudgetUsd: 15,
    highlighted: true,
    tagline: "Lo que atendería un vendedor de medio tiempo, todos los días.",
    features: [
      "Todo lo de Emprende",
      "Productos o inventario sin límite",
      "Felicitaciones automáticas de cumpleaños y fechas especiales",
      "Google Calendar e importación desde Excel",
      "Reportes completos",
      "Soporte por WhatsApp",
    ],
  },
  NEGOCIO: {
    tier: "NEGOCIO",
    name: "Negocio",
    priceCop: 590_000,
    chats: 4_000,
    users: 10,
    aiBudgetUsd: 40,
    tagline: "Concesionarios, inmobiliarias y distribuidores con equipo de asesores.",
    features: [
      "Todo lo de Pro",
      "Asistente del asesor por WhatsApp",
      "Coincidencias entre inventario y compradores",
      "Citas y agenda por asesor",
      "Soporte prioritario",
    ],
  },
};

export const PLAN_TIERS = Object.keys(PLANS) as PlanTier[];

/** Lo que se cobra por cada cliente atendido por encima del cupo del plan */
export const EXTRA_CHAT_COP = 150;
export const TRIAL_DAYS = 14;

export const MICRO_USD = 1_000_000;

/**
 * Cobro de Meta por respuesta dentro de las 24 horas en Colombia (desde el 1 de octubre de 2026) y las que da
 * gratis cada número al mes. Lo paga cada negocio a Meta; aquí solo se usa para estimar su costo real.
 */
export const META_SERVICE_COP = 2.95;
export const META_FREE_SERVICE_MESSAGES = 1_000;

export interface Period {
  start: Date;
  end: Date;
}

/** Primer instante del mes en curso: el cupo de chats y el presupuesto de IA se reinician cada mes. */
export function periodStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Mes calendario `YYYY-MM`; sin mes (o con uno inválido) es el mes en curso. */
export function monthPeriod(month?: string | null, now = new Date()): Period {
  const match = month?.match(/^(\d{4})-(\d{2})$/);
  const start = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : periodStart(now);
  return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) };
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Mensajes que Meta cobra en el mes: los que pasan de las 1.000 respuestas gratis del número. */
export function metaServiceCostCop(outboundMessages: number): number {
  return Math.max(0, outboundMessages - META_FREE_SERVICE_MESSAGES) * META_SERVICE_COP;
}

/** Suma `months` meses a la fecha pagada; si ya venció, cuenta desde hoy. */
export function extendPaidUntil(paidUntil: Date | null, months: number, now = new Date()): Date {
  const from = paidUntil && paidUntil > now ? paidUntil : now;
  const next = new Date(from);
  next.setMonth(next.getMonth() + months);
  return next;
}
