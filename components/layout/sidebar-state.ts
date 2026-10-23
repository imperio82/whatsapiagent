"use client";

import { useSyncExternalStore } from "react";

/** Si el menú lateral está escondido; se recuerda entre visitas en este navegador. */
const HIDDEN_KEY = "sidebar-hidden";

let hidden = false;
let loaded = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  if (!loaded) {
    loaded = true;
    try {
      hidden = localStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
      // Sin almacenamiento: el menú arranca visible
    }
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function toggleSidebar(): void {
  hidden = !hidden;
  try {
    localStorage.setItem(HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
    // Igual funciona, solo no se recuerda
  }
  listeners.forEach((l) => l());
}

/** Lo comparten el menú lateral y el botón de la barra superior. */
export function useSidebarHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hidden,
    () => false,
  );
}
