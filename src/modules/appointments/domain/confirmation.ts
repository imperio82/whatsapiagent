/**
 * Aviso al cliente cuando un asesor confirma su cita (o le cambia la hora). Lo controla la
 * habilidad "Avisar al cliente cuando se confirma la cita": si el negocio la apaga, no sale.
 */

const TIME_ZONE = "America/Bogota";

export interface AppointmentState {
  status: string;
  scheduledAt: Date | null;
}

/** Hay que avisar si la cita acaba de quedar confirmada con hora, o si ya lo estaba y cambió de hora. */
export function needsConfirmationNotice(before: AppointmentState, after: AppointmentState): boolean {
  if (after.status !== "CONFIRMED" || !after.scheduledAt) return false;
  if (before.status !== "CONFIRMED") return true;
  return before.scheduledAt?.getTime() !== after.scheduledAt.getTime();
}

export interface ConfirmationMessageInput {
  /** Primer nombre del cliente, o vacío si no se sabe. */
  firstName: string;
  scheduledAt: Date;
  listing: { title: string; kind: "VEHICLE" | "PROPERTY" | "OTHER" } | null;
  /** Nombre del asesor que la atiende, si hay uno asignado. */
  advisor: string | null;
  /** La cita ya estaba confirmada y se movió a otra hora. */
  moved: boolean;
}

/** "✅ Hola Ana, su visita para ver Apartamento en Palermo quedó confirmada para el jueves 29 de octubre a las 3:00 p. m. …" */
export function confirmationMessage(input: ConfirmationMessageInput): string {
  const fecha = input.scheduledAt.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE });
  const hora = input.scheduledAt.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE });
  const vehicle = input.listing?.kind === "VEHICLE";
  const what = vehicle ? "prueba de manejo" : "visita";
  const listing = input.listing ? (vehicle ? ` del ${input.listing.title}` : ` para ver ${input.listing.title}`) : "";
  const greeting = input.firstName ? `Hola ${input.firstName}, ` : "Hola, ";
  const change = input.moved ? "cambió de hora y quedó confirmada" : "quedó confirmada";
  const advisor = input.advisor ? ` Lo atiende ${input.advisor.split(" ")[0]}.` : "";
  // "4:15 p. m." ya termina en punto: no se le agrega otro
  const sentence = `su ${what}${listing} ${change} para el ${fecha} a las ${hora}`.replace(/\.$/, "");
  return `✅ ${greeting}${sentence}.${advisor} Si necesita cambiarla, escríbanos por aquí.`;
}
