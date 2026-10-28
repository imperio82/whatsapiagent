"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Bot,
  Headset,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@components/ui/button";
import { cn } from "@lib/utils";
import {
  useConversation,
  useConversationAction,
  useSendMessage,
} from "@hooks/use-conversations";
import { useWhatsappStatus } from "@hooks/use-whatsapp";
import { VoiceNote } from "./voice-note";

interface Props {
  conversationId: string | null;
}

export function MessageThread({ conversationId }: Props): React.ReactElement {
  const { data, isLoading } = useConversation(conversationId);
  const { data: wpp } = useWhatsappStatus(5000);
  const [draft, setDraft] = useState("");
  const send = useSendMessage(conversationId);
  const convAction = useConversationAction();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  if (!conversationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="rounded-full bg-accent/50 p-4">
          <Sparkles className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Selecciona una conversación para empezar a responder.
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {data.client.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-semibold">{data.client.name}</div>
            <div className="text-xs text-muted-foreground">{data.client.label}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                data.status === "OPEN" && "bg-emerald-500",
                data.status === "PENDING_REVIEW" && "animate-pulse bg-destructive",
                data.status !== "OPEN" &&
                  data.status !== "PENDING_REVIEW" &&
                  "bg-muted-foreground/50",
              )}
            />
            {data.status === "OPEN"
              ? "Activa"
              : data.status === "PENDING_REVIEW"
                ? "Pide una persona"
                : data.status === "ARCHIVED"
                  ? "Archivada"
                  : data.status}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={convAction.isPending}
            onClick={() =>
              convAction.mutate({
                id: data.id,
                action: data.status === "ARCHIVED" ? "unarchive" : "archive",
              })
            }
          >
            {data.status === "ARCHIVED" ? (
              <>
                <ArchiveRestore className="h-3.5 w-3.5" /> Desarchivar
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5" /> Archivar
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 px-6 py-5">
        {data.messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Aún no hay mensajes.</p>
        ) : (
          data.messages.map((m) => {
            const isOut = m.direction === "OUTBOUND";
            return (
              <div
                key={m.id}
                className={cn("flex flex-col", isOut ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                    isOut
                      ? "bg-wa text-wa-foreground rounded-br-md"
                      : "bg-background border border-border rounded-bl-md",
                  )}
                >
                  {m.authoredBy === "AI" && (
                    <div className="mb-1 flex items-center gap-1 text-[10px] opacity-80">
                      <Bot className="h-3 w-3" /> Respondido por IA
                    </div>
                  )}
                  {m.type === "AUDIO" ? (
                    <VoiceNote src={m.mediaUrl} transcript={m.content} outbound={isOut} />
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  )}
                </div>
                <span className="mt-1 text-[10px] text-muted-foreground">
                  {format(new Date(m.sentAt), "HH:mm", { locale: es })}
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {data.aiPausedUntil && (
        <div
          className={cn(
            "flex items-center gap-2 border-t border-border px-4 py-2 text-xs",
            data.status === "PENDING_REVIEW" ? "bg-destructive/10" : "bg-amber-500/10",
          )}
        >
          <Headset
            className={cn(
              "h-4 w-4 shrink-0",
              data.status === "PENDING_REVIEW" ? "text-destructive" : "text-amber-600",
            )}
          />
          <span className="flex-1">
            {data.status === "PENDING_REVIEW"
              ? "El cliente pidió hablar con una persona. La IA no responde hasta las "
              : "La atiende una persona. La IA no responde hasta las "}
            {format(new Date(data.aiPausedUntil), "HH:mm", { locale: es })}. Respondele desde acá.
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={convAction.isPending}
            onClick={() => convAction.mutate({ id: data.id, action: "resume-ai" })}
          >
            <Bot className="h-3.5 w-3.5" /> Reactivar IA
          </Button>
        </div>
      )}

      {wpp?.state.kind === "error" && (
        <div className="flex items-center gap-2 border-t border-border bg-destructive/10 px-4 py-2 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="flex-1 text-destructive">
            WhatsApp con error: {wpp.state.reason}
          </span>
          <Button asChild size="sm" variant="outline">
            <Link href="/configuracion/whatsapp">Arreglar</Link>
          </Button>
        </div>
      )}

      {data.client.isLid && (
        <div className="flex items-start gap-2 border-t border-border bg-amber-500/10 px-4 py-2 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="flex-1 text-amber-700 dark:text-amber-400">
            Este cliente escribe con identificador interno de WhatsApp (LID), no
            con un número visible. Las respuestas pueden no entregarse. Pedile
            su número o que te agregue como contacto para asegurar la entrega.
          </span>
        </div>
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setDraft("");
          await send.mutateAsync(text);
        }}
        className="flex items-center gap-2 border-t border-border bg-background px-4 py-3"
      >
        <textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
          placeholder="Escribe un mensaje… (Enter para enviar)"
          className="max-h-32 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          type="submit"
          variant="wa"
          size="icon"
          disabled={send.isPending || !draft.trim()}
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
