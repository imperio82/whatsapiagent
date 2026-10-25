"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FlaskConical,
  Headset,
  MessageSquarePlus,
  Mic,
  Route,
  SendHorizontal,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useConversation, useConversationAction } from "@hooks/use-conversations";
import { useSendSimulatedMessage, useSimulatorStatus, useSimulatorTrace } from "@hooks/use-simulator";
import { cn } from "@lib/utils";
import type { SimulatorTurnDto } from "@modules/simulator/application/use-cases";
import { VoiceNote } from "@components/features/chats/voice-note";
import { VoiceRecorder } from "@components/features/simulator/voice-recorder";

/** Cliente de prueba de este navegador: se recuerda para seguir el mismo chat al volver. */
const SESSION_KEY = "simulator-session";
/** Margen sobre la espera configurada antes de dar por perdida una respuesta. */
const REPLY_TIMEOUT_MS = 120_000;

interface Session {
  phone: string;
  name: string;
  conversationId: string | null;
}

function newSession(): Session {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
  return { phone: `573${digits}`, name: "Cliente de prueba", conversationId: null };
}

function loadSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Session>;
      if (typeof parsed.phone === "string") {
        return { phone: parsed.phone, name: parsed.name ?? "", conversationId: parsed.conversationId ?? null };
      }
    }
  } catch {
    // Sin almacenamiento: chat nuevo
  }
  return newSession();
}

function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Igual funciona, solo no se recuerda
  }
}

export default function AgentSimulatorPage(): React.ReactElement {
  const [session, setSession] = useState<Session | null>(null);
  const [text, setText] = useState("");
  /** Mientras se espera la respuesta: desde cuándo y cuántas respuestas había al enviar. */
  const [waiting, setWaiting] = useState<{ since: number; repliesBefore: number } | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: status } = useSimulatorStatus();
  const { data: conversation } = useConversation(session?.conversationId ?? null);
  const { data: turns } = useSimulatorTrace(session?.conversationId ?? null);
  const send = useSendSimulatedMessage();
  const convAction = useConversationAction();

  useEffect(() => setSession(loadSession()), []);

  function update(next: Session) {
    setSession(next);
    saveSession(next);
  }

  const messages = conversation?.messages ?? [];
  const replies = messages.filter((m) => m.direction === "OUTBOUND").length;
  const answered = waiting !== null && replies > waiting.repliesBefore;
  const paused = !!conversation?.aiPausedUntil;

  // Deja de mostrar "escribiendo…" cuando llega la respuesta, cuando pasa a una persona o si tarda demasiado
  useEffect(() => {
    if (waiting === null) return;
    if (answered || paused) {
      setWaiting(null);
      return;
    }
    const limit = (status?.replyDelayMs ?? 6000) + REPLY_TIMEOUT_MS;
    const timer = setTimeout(() => {
      setWaiting(null);
      setTimedOut(true);
    }, Math.max(0, waiting.since + limit - Date.now()));
    return () => clearTimeout(timer);
  }, [waiting, answered, paused, status?.replyDelayMs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, waiting]);

  /** Texto escrito o una nota de voz grabada (WAV en base64), que entra como una de WhatsApp. */
  async function submit(audio?: string) {
    if (!session || send.isPending || (!audio && !text.trim())) return;
    const result = await send.mutateAsync({
      phone: session.phone,
      name: session.name.trim() || undefined,
      text: audio ? "" : text.trim(),
      ...(audio ? { audio: { data: audio, mimeType: "audio/wav" as const } } : {}),
    });
    if (!audio) setText("");
    setTimedOut(false);
    setWaiting((current) => current ?? { since: Date.now(), repliesBefore: replies });
    if (result.conversationId !== session.conversationId) update({ ...session, conversationId: result.conversationId });
  }

  function restart() {
    setWaiting(null);
    setTimedOut(false);
    update(newSession());
  }

  const aiBlocked = status && (!status.aiConfigured || !status.aiAutoReply || status.aiBudgetExhausted);
  const started = !!session?.conversationId;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FlaskConical className="h-6 w-6 text-wa" /> Simulador del agente
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Escríbele al agente como si fueras un cliente por WhatsApp y mira cómo responde. Usa todo lo que tiene conectado:
          tu catálogo o inventario, tus habilidades, el calendario y los avisos al equipo.
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex gap-3 p-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-wa" />
          <p>
            Es una prueba real: los pedidos, compradores, citas y avisos que haga el agente se crean de verdad, y la
            conversación aparece en <Link href="/chats" className="font-medium text-foreground underline-offset-2 hover:underline">Conversaciones</Link>{" "}
            marcada como «simulador». Lo único que cambia es que las respuestas se quedan aquí y no se envían por WhatsApp.
          </p>
        </CardContent>
      </Card>

      {aiBlocked && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="flex-1">
            {!status.aiConfigured
              ? "El servidor no tiene clave de IA (OpenAI o Gemini): el agente no va a responder."
              : !status.aiAutoReply
                ? "Las respuestas automáticas están apagadas: el agente no va a responder."
                : "Se gastó el presupuesto de IA de este mes: el agente no va a responder hasta que se recargue."}
          </span>
          {status.aiConfigured && !status.aiAutoReply && (
            <Button asChild size="sm" variant="outline">
              <Link href="/configuracion/ia">Activarlas</Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Chat */}
        <Card className="flex h-[calc(100vh-15rem)] min-h-[28rem] flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-wa/15 text-wa">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Tu agente</div>
              <div className="truncate text-xs text-muted-foreground">
                {waiting !== null ? "escribiendo…" : `Hablas como ${session?.name || "cliente"} · +${session?.phone ?? ""}`}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={restart} title="Empieza otra conversación con un cliente nuevo">
              <MessageSquarePlus className="h-3.5 w-3.5" /> Nuevo chat
            </Button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto bg-muted/30 px-4 py-4">
            {!started && (
              <div className="mx-auto mt-10 max-w-sm text-center text-sm text-muted-foreground">
                Escribe el primer mensaje como lo haría un cliente, o graba una nota de voz con el micrófono. Por ejemplo:
                «Hola, ¿qué tienen disponible?»
              </div>
            )}
            {messages.map((m) => {
              const mine = m.direction === "INBOUND";
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm",
                      mine ? "rounded-br-none bg-wa text-wa-foreground" : "rounded-bl-none bg-card",
                    )}
                  >
                    {!mine && m.authoredBy !== "AI" && (
                      <div className="mb-0.5 text-[11px] font-medium text-amber-600">
                        {m.authoredBy === "AGENT" ? "Persona del equipo" : "Sistema"}
                      </div>
                    )}
                    {m.type === "AUDIO" ? (
                      <VoiceNote
                        src={m.mediaUrl}
                        transcript={m.content || (mine ? "Transcribiendo…" : "")}
                        outbound={mine}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    )}
                    <div className={cn("mt-0.5 text-right text-[10px]", mine ? "text-wa-foreground/80" : "text-muted-foreground")}>
                      {format(new Date(m.sentAt), "HH:mm", { locale: es })}
                    </div>
                  </div>
                </div>
              );
            })}
            {waiting !== null && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-lg rounded-bl-none bg-card px-3 py-3 shadow-sm" aria-label="El agente está escribiendo">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {paused && conversation && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border bg-amber-500/10 px-4 py-2 text-xs">
              <Headset className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="flex-1">
                El agente pasó la conversación a una persona y no responde hasta las{" "}
                {format(new Date(conversation.aiPausedUntil!), "HH:mm", { locale: es })}. Así lo vería el cliente.
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={convAction.isPending}
                onClick={() => convAction.mutate({ id: conversation.id, action: "resume-ai" })}
              >
                <Bot className="h-3.5 w-3.5" /> Reactivar IA
              </Button>
            </div>
          )}
          {timedOut && (
            <div className="flex items-center gap-2 border-t border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              El agente no respondió. Revisa la clave de IA y los registros del servidor.
            </div>
          )}

          <form
            className="flex items-end gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <textarea
              rows={1}
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Escribe como cliente…"
              aria-label="Mensaje del cliente de prueba"
              className="max-h-32 min-h-9 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <VoiceRecorder disabled={send.isPending || !session} onRecorded={(wav) => void submit(wav)} />
            <Button type="submit" variant="wa" size="icon" disabled={!text.trim() || send.isPending || !session} aria-label="Enviar">
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </form>
        </Card>

        {/* Cliente de prueba y lo que hizo el agente */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <div className="text-sm font-semibold">Cliente de prueba</div>
                <p className="text-xs text-muted-foreground">
                  {started
                    ? "Para cambiar de cliente empieza un chat nuevo."
                    : "Con el número de un cliente que ya existe, el agente lo reconoce y recuerda lo que sabe de él."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-name">Nombre</Label>
                <Input
                  id="sim-name"
                  value={session?.name ?? ""}
                  maxLength={80}
                  disabled={!session || started}
                  onChange={(e) => session && update({ ...session, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-phone">Teléfono con indicativo</Label>
                <Input
                  id="sim-phone"
                  inputMode="numeric"
                  value={session?.phone ?? ""}
                  maxLength={15}
                  disabled={!session || started}
                  onChange={(e) => session && update({ ...session, phone: e.target.value.replace(/\D/g, "") })}
                />
              </div>
              {status && (
                <p className="text-[11px] text-muted-foreground">
                  Como en WhatsApp, el agente espera {Math.round(status.replyDelayMs / 1000)} s sin mensajes nuevos antes de
                  responder, para contestar varios mensajes seguidos de una vez.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <div className="text-sm font-semibold">Qué hizo el agente</div>
                <p className="text-xs text-muted-foreground">
                  Cada respuesta: a qué especialista la envió, qué herramientas usó y si pasó la revisión.
                </p>
              </div>
              {!turns?.length ? (
                <p className="rounded-md bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
                  Aquí verás los pasos cuando el agente responda.
                </p>
              ) : (
                <ol className="max-h-[28rem] space-y-3 overflow-y-auto">
                  {turns
                    // Los audios (transcripción y nota de voz) no cuentan como respuestas
                    .reduce<{ turn: SimulatorTurnDto; n: number }[]>((acc, turn) => {
                      const replies = acc.filter((t) => t.turn.intent !== "voz" && t.turn.intent !== "transcripcion").length;
                      return [...acc, { turn, n: replies + 1 }];
                    }, [])
                    .reverse()
                    .map(({ turn, n }) => (
                      <TurnCard key={turn.id} turn={turn} n={n} />
                    ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TurnCard({ turn, n }: { turn: SimulatorTurnDto; n: number }): React.ReactElement {
  return (
    <li className="rounded-md border border-border p-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium">
          {turn.intent === "voz" ? "Nota de voz" : turn.intent === "transcripcion" ? "Audio del cliente" : `Respuesta ${n}`}
          {turn.intent && turn.intent !== "voz" && turn.intent !== "transcripcion" && (
            <span className="ml-1 rounded bg-wa/15 px-1.5 py-0.5 text-[10px] text-wa">{turn.intent}</span>
          )}
        </span>
        <span className="text-muted-foreground">{format(new Date(turn.createdAt), "HH:mm:ss", { locale: es })}</span>
      </div>
      {turn.trace.length === 0 ? (
        <p className="text-muted-foreground">
          {turn.toolCalls > 0 ? `Usó ${turn.toolCalls} herramienta(s).` : "Respondió sin usar herramientas."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {turn.trace.map((step, i) => {
            const Icon =
              step.type === "herramienta"
                ? Wrench
                : step.type === "ruta"
                  ? Route
                  : step.type === "humano"
                    ? Headset
                    : step.type === "voz"
                      ? Mic
                    : step.type === "verificacion"
                      ? step.ok === false
                        ? XCircle
                        : CheckCircle2
                      : Bot;
            return (
              <li key={i} className="flex gap-2">
                <Icon
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    step.ok === false ? "text-destructive" : step.type === "herramienta" ? "text-wa" : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-medium">{step.tool ?? step.node}</span>
                    {step.detail && <span className="text-muted-foreground"> — {step.detail}</span>}
                    {step.ms !== undefined && <span className="text-muted-foreground"> · {step.ms} ms</span>}
                  </div>
                  {(step.args !== undefined || step.result) && (
                    <details className="mt-0.5">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver datos</summary>
                      {step.args !== undefined && (
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/60 p-2 text-[10px]">
                          {JSON.stringify(step.args, null, 2)}
                        </pre>
                      )}
                      {step.result && (
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/60 p-2 text-[10px]">
                          {step.result}
                        </pre>
                      )}
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
        {turn.model} · {turn.tokensIn + turn.tokensOut} tokens · ≈ US$ {(turn.costMicroUsd / 1_000_000).toFixed(4)}
      </div>
    </li>
  );
}
