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
  /** Tope interno de gasto de IA en el mes (protege el margen), sin contar los créditos que se le sumen */
  aiBudgetUsd: number;
  /** Precio de cada cliente adicional al recargar */
  extraChatCop: number;
  /** El plan que se sugiere al llegar al tope; null = plan a la medida */
  next: PlanTier | null;
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
    aiBudgetUsd: 10,
    extraChatCop: 300,
    next: "PRO",
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
    chats: 1_100,
    users: 3,
    aiBudgetUsd: 23,
    extraChatCop: 280,
    next: "NEGOCIO",
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
    chats: 2_200,
    users: 10,
    aiBudgetUsd: 45,
    extraChatCop: 260,
    next: null,
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

/**
 * Límites de uso (docs/Límites de uso, alertas y recarga – Atiendo IA.pdf). Los cupos y topes de arriba
 * salen de que la IA no pase del 30 % del precio del plan, con ~$77 de IA por cliente atendido.
 */
export const USAGE_LIMITS = {
  /** Peso máximo de la IA sobre el precio del plan */
  aiShareTarget: 0.3,
  /** Costo de IA por cliente atendido con el que se calcularon los cupos (prueba del 27 de octubre de 2026) */
  targetCostPerClientCop: 77,
  /** Avisos al dueño */
  warnAt: [0.7, 0.9] as const,
  /** Horas en que el agente sigue con los chats abiertos después de llegar al tope */
  graceHours: 48,
  /** Un chat está "abierto" si el agente le respondió en estas últimas horas */
  openChatHours: 24,
  /** Respuestas de IA por contacto al mes; después pasa a un asesor (spam, bots) */
  maxRepliesPerContact: 40,
} as const;

/**
 * Lo que vale para el negocio un gasto de IA: el costo dividido por el peso de la IA en el precio (30 %).
 * Al negocio siempre se le muestra este valor, nunca el costo, igual que el precio del plan.
 */
export function saleValueUsd(costUsd: number): number {
  return costUsd / USAGE_LIMITS.aiShareTarget;
}

/** Paquetes de recarga: el precio por cliente baja al comprar más y la IA queda por debajo del 30 % */
export const RECHARGE_PACKS = [
  { clients: 100, priceCop: 30_000 },
  { clients: 250, priceCop: 70_000 },
  { clients: 500, priceCop: 130_000 },
] as const;

/** Monto libre de recarga: mínimo y máximo en pesos */
export const RECHARGE_MIN_COP = 20_000;
export const RECHARGE_MAX_COP = 2_000_000;
/** Días que dura lo recargado */
export const RECHARGE_VALID_DAYS = 60;

export interface RechargeQuote {
  amountCop: number;
  /** Clientes adicionales que suma al cupo */
  clients: number;
  /** Saldo de IA que suma al tope, en proporción a lo que el plan da por cliente */
  creditUsd: number;
}

/**
 * Lo que da una recarga: con el monto de un paquete, los clientes del paquete; con un monto libre, al precio
 * del cliente adicional del plan. El saldo de IA crece en la misma proporción que el tope del plan por cliente.
 */
export function rechargeQuote(tier: PlanTier, amountCop: number): RechargeQuote {
  const plan = PLANS[tier];
  const pack = RECHARGE_PACKS.find((p) => p.priceCop === amountCop);
  const clients = pack ? pack.clients : Math.floor(amountCop / plan.extraChatCop);
  const creditUsd = Math.round(((clients * plan.aiBudgetUsd) / plan.chats) * 100) / 100;
  return { amountCop, clients, creditUsd };
}

/** Precio por cliente adicional más bajo (el del plan más grande), para textos de "desde" */
export const EXTRA_CHAT_COP = Math.min(...Object.values(PLANS).map((p) => p.extraChatCop));
export const TRIAL_DAYS = 14;

/**
 * Prueba gratis: lo que se regala, en dólares a precio de venta (no a costo). Se cambia en /plataforma;
 * este es el valor si no se ha configurado.
 */
export const TRIAL_DEFAULT_VALUE_USD = 3;
export const TRIAL_MAX_VALUE_USD = 50;

export interface TrialLimits {
  valueUsd: number;
  /** Tope de gasto real de IA: el valor regalado por el peso de la IA en el precio (30 %) */
  aiBudgetUsd: number;
  /** Clientes que da ese valor al precio por cliente de Emprende ($129.000 / 500 = $258) */
  chats: number;
}

/** Con US$ 3 y el dólar a $3.900: US$ 0,90 de IA y unos 45 clientes. */
export function trialLimits(valueUsd: number, usdCopRate: number): TrialLimits {
  const perClientCop = PLANS.EMPRENDE.priceCop / PLANS.EMPRENDE.chats;
  return {
    valueUsd,
    aiBudgetUsd: Math.round(valueUsd * USAGE_LIMITS.aiShareTarget * 100) / 100,
    chats: Math.max(1, Math.round((valueUsd * usdCopRate) / perClientCop)),
  };
}

/** Los límites con los que se mide el negocio: los de su plan o, si está en prueba (`trial`), los de la prueba. */
export function limitsPlan(tier: PlanTier, trial: TrialLimits | null): Plan {
  const plan = PLANS[tier];
  return trial ? { ...plan, name: "Prueba gratis", chats: trial.chats, aiBudgetUsd: trial.aiBudgetUsd } : plan;
}

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
