/**
 * Memoria del cliente entre conversaciones: lo que el agente debe saber sin volver a preguntar
 * (datos de la ficha, preferencias y pedidos anteriores). Funciones puras para poder probarlas.
 */

/** Largo máximo de la memoria del agente; se conservan las notas más recientes. */
const MAX_MEMORY_CHARS = 1500;
/** Desde cuántas horas sin mensajes se le avisa al agente que el cliente retoma la conversación. */
const RESUME_GAP_HOURS = 6;
const TIME_ZONE = "America/Bogota";

/** Los clientes creados automáticamente se llaman "Cliente 1234" (o "lid:…"): no es su nombre real. */
export function isGenericClientName(name: string | null | undefined): boolean {
  return !name?.trim() || /^Cliente \d+$/.test(name.trim()) || name.startsWith("lid:") || looksLikeHandle(name.trim());
}

/**
 * El nombre de perfil de WhatsApp a veces es un usuario ("garciacalvojhon", "juan_p23"): todo junto, sin
 * mayúsculas y largo, o con números o signos. Saludar con eso suena a robot; se trata como desconocido.
 */
export function looksLikeHandle(name: string): boolean {
  if (/\s/.test(name)) return false;
  return /[\d_.@]/.test(name) || (name === name.toLowerCase() && name.length >= 13);
}

/** Agrega una nota con fecha a la memoria, sin repetir notas iguales y recortando las más viejas. */
export function appendMemory(current: string | null, note: string, now: Date = new Date()): string {
  const clean = note.trim().replace(/\s+/g, " ");
  const lines = (current ?? "").split("\n").filter(Boolean);
  if (lines.some((l) => l.toLowerCase().endsWith(clean.toLowerCase()))) return lines.join("\n");

  const date = now.toLocaleDateString("es-CO", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
  lines.push(`${date}: ${clean}`);

  let text = lines.join("\n");
  while (text.length > MAX_MEMORY_CHARS && lines.length > 1) {
    lines.shift();
    text = lines.join("\n");
  }
  return text;
}

export interface ClientProfileInput {
  name: string | null;
  address: string | null;
  city: string | null;
  email: string | null;
  aiMemory: string | null;
  orders: Array<{
    code: string;
    createdAt: Date;
    status: string;
    totalMajor: number;
    items: Array<{ quantity: number; name: string }>;
  }>;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "pendiente de pago",
  PAID: "pagado",
  AWAITING_DISPATCH: "por despachar",
  DISPATCHED: "despachado",
  COMPLETED: "entregado",
  CANCELLED: "cancelado",
};

function shortDate(d: Date): string {
  return d.toLocaleDateString("es-CO", { timeZone: TIME_ZONE, day: "numeric", month: "short" });
}

/** Sección del prompt con lo que ya se sabe del cliente. Devuelve null si no se sabe nada. */
export function formatClientProfile(c: ClientProfileInput): string | null {
  const lines: string[] = [];
  if (!isGenericClientName(c.name)) lines.push(`- Nombre: ${c.name}`);
  if (c.city) lines.push(`- Ciudad: ${c.city}`);
  if (c.address) lines.push(`- Dirección de entrega: ${c.address}`);
  if (c.email) lines.push(`- Correo: ${c.email}`);
  if (c.aiMemory?.trim()) lines.push(`- Lo que nos ha contado:\n${c.aiMemory.trim().split("\n").map((l) => `  · ${l}`).join("\n")}`);
  if (c.orders.length > 0) {
    lines.push("- Pedidos anteriores (del más reciente al más antiguo):");
    for (const o of c.orders) {
      const items = o.items.map((i) => `${i.quantity} x ${i.name}`).join(", ");
      const total = `$${o.totalMajor.toLocaleString("es-CO")}`;
      lines.push(`  · ${o.code} (${shortDate(o.createdAt)}, ${ORDER_STATUS_LABEL[o.status] ?? o.status}, ${total}): ${items}`);
    }
  }
  return lines.length > 0
    ? `DATOS DEL CLIENTE (ya los conoces: úsalos y NO los vuelvas a preguntar):\n${lines.join("\n")}`
    : null;
}

/**
 * Marca en el texto del cliente cuándo retoma la conversación después de un buen rato,
 * para que el agente no trate mensajes de hace días como si fueran de hace un minuto.
 */
export function resumeNote(previous: Date | null, current: Date): string | null {
  if (!previous) return null;
  const hours = (current.getTime() - previous.getTime()) / 3_600_000;
  if (hours < RESUME_GAP_HOURS) return null;
  const days = Math.floor(hours / 24);
  const when = days >= 1 ? `${days} día${days === 1 ? "" : "s"}` : `${Math.round(hours)} horas`;
  return `(El cliente vuelve a escribir después de ${when}.)`;
}
