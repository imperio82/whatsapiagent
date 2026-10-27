"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Bell, Bot, ChevronDown, Headset, UserRound } from "lucide-react";
import { Button } from "@components/ui/button";
import { useConversationAction, useHandoffQueue } from "@hooks/use-conversations";

const TITLE_ALERT = "🔴 Un cliente espera a una persona";

/** Dos pitidos cortos con Web Audio (sin archivos de sonido). */
function playAlertSound(): void {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // El navegador bloquea el audio hasta que el usuario interactúa con la página.
  }
}

/**
 * Alerta global del panel: cuando el agente de IA pasa una conversación a una
 * persona, aparece una ventana que parpadea, suena, avisa en el escritorio y
 * hace titilar el título de la pestaña hasta que alguien la atiende.
 */
export function HandoffAlerts(): React.ReactElement | null {
  const router = useRouter();
  const { data } = useHandoffQueue();
  const action = useConversationAction();
  const items = data ?? [];

  const [collapsed, setCollapsed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, []);

  // Casos nuevos: sonido, aviso de escritorio y se vuelve a abrir la ventana.
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.map((c) => c.id));
    if (seen.current === null) {
      // Primera carga: lo que ya estaba pendiente también se anuncia.
      seen.current = new Set();
    }
    const fresh = data.filter((c) => !seen.current!.has(c.id));
    seen.current = ids;
    if (fresh.length === 0) return;

    setCollapsed(false);
    playAlertSound();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const c of fresh) {
        const n = new Notification(`${c.clientName} pide hablar con una persona`, {
          body: c.lastMessagePreview || "El agente de IA pasó la conversación a una persona.",
          tag: `handoff-${c.id}`,
        });
        n.onclick = () => {
          window.focus();
          router.push(`/chats?c=${c.id}`);
          n.close();
        };
      }
    }
  }, [data, router]);

  // Título de la pestaña titilando mientras haya casos sin atender.
  useEffect(() => {
    if (items.length === 0) return;
    const original = document.title.startsWith("🔴") ? "Atiendo IA" : document.title;
    let on = false;
    const timer = setInterval(() => {
      on = !on;
      document.title = on ? `(${items.length}) ${TITLE_ALERT}` : original;
    }, 1500);
    return () => {
      clearInterval(timer);
      document.title = original;
    };
  }, [items.length]);

  if (items.length === 0) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground shadow-lg animate-pulse"
      >
        <Bell className="h-4 w-4" />
        {items.length} {items.length === 1 ? "cliente espera" : "clientes esperan"}
      </button>
    );
  }

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-2 border-destructive bg-card shadow-2xl"
    >
      <div className="flex items-center gap-2 bg-destructive px-4 py-2.5 text-destructive-foreground">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
        </span>
        <span className="flex-1 text-sm font-semibold animate-pulse">
          {items.length === 1
            ? "Un cliente pide hablar con una persona"
            : `${items.length} clientes piden hablar con una persona`}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Minimizar"
          className="rounded p-0.5 hover:bg-white/20"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {items.map((c) => (
          <li key={c.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start gap-2">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{c.clientName}</span>
                  {c.lastMessageAt && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      hace{" "}
                      {formatDistanceToNow(new Date(c.lastMessageAt), { locale: es })}
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {c.lastMessagePreview || "El agente de IA pasó la conversación a una persona."}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="wa"
                className="flex-1"
                disabled={action.isPending}
                onClick={() => {
                  action.mutate({ id: c.id, action: "attend" });
                  router.push(`/chats?c=${c.id}`);
                }}
              >
                <Headset className="h-3.5 w-3.5" /> Atender
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={action.isPending}
                onClick={() => action.mutate({ id: c.id, action: "resume-ai" })}
              >
                <Bot className="h-3.5 w-3.5" /> Reactivar IA
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {permission === "default" && (
        <button
          onClick={() =>
            void Notification.requestPermission().then((p) => setPermission(p))
          }
          className="w-full border-t border-border bg-muted/40 px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
        >
          Activar avisos en el escritorio para enterarte aunque estés en otra ventana
        </button>
      )}
    </div>
  );
}
