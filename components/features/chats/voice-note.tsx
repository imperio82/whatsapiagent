"use client";

import { Mic } from "lucide-react";
import { cn } from "@lib/utils";

/** Nota de voz en un chat: el audio para escucharla y lo que dice, para leerla rápido. */
export function VoiceNote({
  src,
  transcript,
  outbound,
}: {
  src: string | null;
  transcript: string;
  outbound?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-80">
        <Mic className="h-3 w-3" /> Nota de voz
      </div>
      {src ? (
        <audio controls preload="none" src={src} className="h-9 w-60 max-w-full" />
      ) : (
        <div className="text-xs opacity-70">El audio no está disponible.</div>
      )}
      {transcript && (
        <div className={cn("whitespace-pre-wrap break-words text-xs italic", outbound ? "opacity-90" : "text-muted-foreground")}>
          “{transcript}”
        </div>
      )}
    </div>
  );
}
