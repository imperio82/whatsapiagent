"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { matchesService } from "@services/matches.service";
import { ApiError } from "@services/api-client";
import { announceNearMatches } from "@components/features/listings/announce-matches";
import type { MatchStatusValue } from "@modules/matching/application/use-cases";

const KEY = "matches";

function showError(err: unknown): void {
  toast.error(err instanceof ApiError ? err.message : "Error inesperado");
}

export function useMatches(status?: MatchStatusValue) {
  return useQuery({ queryKey: [KEY, status ?? "all"], queryFn: () => matchesService.list(status) });
}

export function useSendMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message?: string }) => matchesService.send(id, message),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["listings"] });
      if (result.status === "SENT") toast.success("Mensaje enviado por WhatsApp");
      else toast.error(`No se pudo enviar: ${result.error ?? "error de WhatsApp"}`);
    },
    onError: showError,
  });
}

export function useDismissMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => matchesService.dismiss(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: showError,
  });
}

export function useRunListingMatches() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) => matchesService.runForListing(listingId),
    onSuccess: ({ created, sent, nearMisses }) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["listings"] });
      if (created === 0) {
        if (nearMisses.length === 0) toast.info("No hay compradores nuevos que coincidan con este bien");
      } else
        toast.success(
          `${created} comprador${created === 1 ? "" : "es"} coincide${created === 1 ? "" : "n"}` +
            (sent > 0 ? ` (${sent} avisado${sent === 1 ? "" : "s"} automáticamente)` : ". Revísalos en Coincidencias."),
        );
      announceNearMatches(nearMisses);
    },
    onError: showError,
  });
}

/** "Revisar ahora": todo el inventario disponible contra los compradores que esperan algo. */
export function useRunAllMatches() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => matchesService.runAll(),
    onSuccess: ({ created, sent, listings }) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["listings"] });
      if (created === 0) toast.info(`Revisé ${listings} bien${listings === 1 ? "" : "es"}: no hay coincidencias nuevas`);
      else
        toast.success(
          `${created} coincidencia${created === 1 ? "" : "s"} nueva${created === 1 ? "" : "s"}` +
            (sent > 0 ? ` (${sent} enviada${sent === 1 ? "" : "s"} automáticamente)` : ""),
        );
    },
    onError: showError,
  });
}
