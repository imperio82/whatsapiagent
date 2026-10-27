import { toast } from "sonner";
import type { ListingDto } from "@modules/listings/application/dtos";

/** Al publicar un bien se buscan compradores: se le avisa al asesor cuántos encontró. */
export function announceMatches(listing: ListingDto): void {
  const n = listing.newMatches ?? 0;
  if (n > 0) {
    toast.success(`${n} comprador${n === 1 ? "" : "es"} busca${n === 1 ? "" : "n"} algo así`, {
      description: "Revisa y aprueba los mensajes en Coincidencias.",
      action: { label: "Ver", onClick: () => (window.location.href = "/coincidencias") },
    });
  }
}
