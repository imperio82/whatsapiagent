import { toast } from "sonner";
import type { ListingDto } from "@modules/listings/application/dtos";

export interface NearMatch {
  name: string;
  missed: string;
  listingTitle?: string;
}

/** "Ana: busca en otra ciudad · Luis: su presupuesto es hasta …" */
function nearText(near: NearMatch[], withListing = false): string {
  const shown = near
    .slice(0, 3)
    .map((n) => `${n.name.split(" ")[0]}: ${n.missed}${withListing && n.listingTitle ? ` (${n.listingTitle})` : ""}`);
  return `${shown.join(" · ")}${near.length > 3 ? ` y ${near.length - 3} más` : ""}`;
}

/** Compradores a los que les falló una sola condición: no se les propone mensaje, pero el asesor debe saberlo. */
export function announceNearMatches(near: NearMatch[], opts: { withListing?: boolean } = {}): void {
  if (near.length === 0) return;
  const n = near.length;
  toast.info(`${n} comprador${n === 1 ? "" : "es"} casi coincide${n === 1 ? "" : "n"}`, {
    description: `${nearText(near, opts.withListing)}. Revisa el pipeline por si igual le sirve.`,
    action: { label: "Ver pipeline", onClick: () => (window.location.href = "/leads") },
    duration: 12_000,
  });
}

/** Al publicar un bien se buscan compradores: se le avisa al asesor cuántos encontró. */
export function announceMatches(listing: ListingDto): void {
  const n = listing.newMatches ?? 0;
  if (n > 0) {
    toast.success(`${n} comprador${n === 1 ? "" : "es"} busca${n === 1 ? "" : "n"} algo así`, {
      description: "Revisa y aprueba los mensajes en Coincidencias.",
      action: { label: "Ver", onClick: () => (window.location.href = "/coincidencias") },
    });
  }
  announceNearMatches(listing.nearMatches ?? []);
}
