"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, AudioLines, Check, Loader2, Mic, Play, Plus, Trash2, Upload, X } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import {
  useCloneVoice,
  useDeleteClonedVoice,
  usePreviewVoice,
  useUpdateVoiceSettings,
  useVoiceSettings,
} from "@hooks/use-voice";
import type { VoiceOptionDto } from "@modules/voice/application/voice-settings.use-cases";
import type { VoiceSettings } from "@modules/voice/application/voice-runtime";
import { cn } from "@lib/utils";

const usd = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });

const INTENT_LABEL: Record<string, string> = {
  ventas: "Ventas",
  pedido: "Pedidos",
  info: "Información",
  comprador: "Compradores",
  vendedor: "Vendedores",
};

const MODES: { value: VoiceSettings["mode"]; title: string; text: string; recommended?: boolean }[] = [
  {
    value: "MIRROR",
    title: "Cuando el cliente manda un audio",
    text: "Si te hablan, el agente responde hablando; si te escriben, escribe. Se siente natural y controla el gasto.",
    recommended: true,
  },
  {
    value: "RULES",
    title: "Según tus reglas",
    text: "Tú escribes cuándo usar la voz y el agente lo decide en cada mensaje, sin costo extra de IA.",
  },
  {
    value: "ALWAYS",
    title: "Siempre",
    text: "Todas las respuestas cortas van con voz. Es lo que más gasta: cada nota cuesta mucho más que un texto.",
  },
];

const RULE_EXAMPLES = [
  "Al dar la bienvenida a un cliente nuevo",
  "Cuando el cliente pide que le expliquen cómo funciona algo",
  "Cuando el cliente dice que prefiere audios",
];

export default function AgentVoicePage(): React.ReactElement {
  const { data, isLoading } = useVoiceSettings();
  const update = useUpdateVoiceSettings();
  const [form, setForm] = useState<VoiceSettings | null>(null);

  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  if (isLoading || !data || !form) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Cargando…</div>;
  }

  const set = <K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) => setForm({ ...form, [key]: value });
  const dirty = JSON.stringify(form) !== JSON.stringify(data.settings);
  const { status } = data;
  const voices = data.voices.filter((v) => v.provider === form.provider);
  const ruleInvalid = form.enabled && form.mode === "RULES" && form.rules.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <AudioLines className="h-6 w-6 text-wa" /> Voz del agente
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Tu agente puede escuchar las notas de voz de tus clientes y responderles con su propia voz por WhatsApp. Elige la
          voz, cómo suena y cuándo debe hablar en vez de escribir.
        </p>
      </div>

      {!status.geminiConfigured && (
        <Warning text="El servidor no tiene clave de Gemini (GEMINI_API_KEY): sin ella no se transcriben audios ni se genera la voz." />
      )}
      {!status.whatsappSendsVoice && (
        <Warning
          text={`Tu conexión de WhatsApp (${status.whatsappProvider}) todavía no envía notas de voz: el agente seguirá respondiendo por texto.`}
        />
      )}

      <Card>
        <CardContent className="flex items-start gap-4 p-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-wa/10 text-wa">
            <Mic className="h-5 w-5" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="font-semibold">Entender las notas de voz</div>
            <p className="text-sm text-muted-foreground">
              Cuando un cliente manda un audio, el agente lo escucha, lo pasa a texto y le responde. En Conversaciones verás el
              audio y lo que dijo. Cuesta menos de un centavo de dólar por audio.
            </p>
          </div>
          <Switch
            checked={form.transcribeInbound}
            onCheckedChange={(v) => set("transcribeInbound", v)}
            aria-label="Entender las notas de voz de los clientes"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-wa/10 text-wa">
              <AudioLines className="h-5 w-5" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="font-semibold">Responder con voz</div>
              <p className="text-sm text-muted-foreground">
                El agente manda notas de voz con la voz que elijas. Cada nota de unos 30 segundos cuesta cerca de{" "}
                {usd.format(data.costPerNoteUsd[form.provider])} y se descuenta del presupuesto de IA del mes.
              </p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} aria-label="Responder con voz" />
          </div>

          <div className={cn("space-y-5", !form.enabled && "pointer-events-none opacity-50")} aria-disabled={!form.enabled}>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">La voz</h2>
              <div className="inline-flex rounded-md border border-border p-0.5 text-sm">
                {(["GEMINI", "ELEVENLABS"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={p === "ELEVENLABS" && !status.elevenLabsConfigured}
                    onClick={() => {
                      const first = data.voices.find((v) => v.provider === p);
                      setForm({ ...form, provider: p, voiceId: first?.voiceId ?? form.voiceId, voiceName: first?.name ?? null });
                    }}
                    className={cn(
                      "rounded px-3 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      form.provider === p ? "bg-wa text-wa-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p === "GEMINI" ? "Voces incluidas" : "Premium y clonadas (ElevenLabs)"}
                  </button>
                ))}
              </div>
              {!status.elevenLabsConfigured && (
                <p className="text-xs text-muted-foreground">
                  Las voces premium y la clonación de voz se activan cuando la plataforma conecte ElevenLabs.
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {voices.map((v) => (
                  <VoiceOption
                    key={v.voiceId}
                    voice={v}
                    selected={form.voiceId === v.voiceId}
                    style={form.provider === "GEMINI" ? form.style : null}
                    onSelect={() => setForm({ ...form, voiceId: v.voiceId, voiceName: v.name })}
                  />
                ))}
              </div>

              {form.provider === "GEMINI" && (
                <div className="max-w-xl space-y-1.5">
                  <Label htmlFor="voice-style">Cómo suena (tono y acento)</Label>
                  <Input
                    id="voice-style"
                    value={form.style ?? ""}
                    maxLength={200}
                    onChange={(e) => set("style", e.target.value || null)}
                    placeholder={data.defaultStyle}
                  />
                  <p className="text-xs text-muted-foreground">
                    Por ejemplo: «alegre y con energía», «calmado y profesional», «paisa, cercano». Pruébalo con el botón de
                    escuchar.
                  </p>
                </div>
              )}

              {form.provider === "ELEVENLABS" && status.elevenLabsConfigured && <CloneVoice />}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Cuándo responder con voz</h2>
              <div className="grid gap-2 lg:grid-cols-3">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => set("mode", m.value)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      form.mode === m.value ? "border-wa bg-wa/5 ring-1 ring-wa" : "border-border hover:bg-accent/50",
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {m.title}
                      {m.recommended && <Badge variant="wa">Recomendado</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{m.text}</p>
                  </button>
                ))}
              </div>

              {form.mode === "RULES" && (
                <RulesEditor rules={form.rules} onChange={(rules) => set("rules", rules)} invalid={ruleInvalid} />
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Toggle
                  label="Precios, enlaces y códigos también por escrito"
                  text="Si la respuesta trae un precio, un enlace o un número de pedido, se manda el audio y además el texto, para que el cliente lo pueda leer."
                  checked={form.textForData}
                  onChange={(v) => set("textForData", v)}
                />
                <Toggle
                  label="Mandar siempre el texto debajo del audio"
                  text="Para que el cliente pueda leer la respuesta si no puede escuchar en ese momento."
                  checked={form.alsoSendText}
                  onChange={(v) => set("alsoSendText", v)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="max-seconds">Duración máxima de un audio: {form.maxSeconds} s</Label>
                  <input
                    id="max-seconds"
                    type="range"
                    min={10}
                    max={120}
                    step={5}
                    value={form.maxSeconds}
                    onChange={(e) => set("maxSeconds", Number(e.target.value))}
                    className="w-full accent-[var(--wa)]"
                  />
                  <p className="text-xs text-muted-foreground">Las respuestas más largas van por texto.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Quiénes pueden hablar</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {data.intents.map((intent) => {
                      const on = form.intents.length === 0 || form.intents.includes(intent);
                      return (
                        <button
                          key={intent}
                          type="button"
                          onClick={() => {
                            const current = form.intents.length === 0 ? data.intents : form.intents;
                            const next = on ? current.filter((i) => i !== intent) : [...current, intent];
                            set("intents", next.length === data.intents.length ? [] : next);
                          }}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs transition-colors",
                            on ? "border-wa bg-wa/10 text-foreground" : "border-border text-muted-foreground",
                          )}
                        >
                          {on && <Check className="mr-1 inline h-3 w-3" />}
                          {INTENT_LABEL[intent] ?? intent}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Los especialistas del agente que pueden responder con voz. Por ejemplo, deja los pedidos por escrito.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </CardContent>
      </Card>

      {/* Fija al fondo del área de contenido, con o sin menú lateral */}
      <div className="sticky bottom-0 z-20 -mx-6 -mb-6 border-t border-border bg-background/90 backdrop-blur">
        <div className="flex items-center justify-end gap-2 px-6 py-3">
          {dirty && <span className="mr-auto text-xs text-muted-foreground">Tienes cambios sin guardar</span>}
          <Button variant="ghost" disabled={!dirty || update.isPending} onClick={() => setForm(data.settings)}>
            Descartar
          </Button>
          <Button variant="wa" disabled={!dirty || ruleInvalid || update.isPending} onClick={() => update.mutate(form)}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
      <span>{text}</span>
    </div>
  );
}

function Toggle({ label, text, checked, onChange }: { label: string; text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

/** Una voz para elegir, con su botón para escucharla (gasta un poco del presupuesto). */
function VoiceOption({
  voice,
  selected,
  style,
  onSelect,
}: {
  voice: VoiceOptionDto;
  selected: boolean;
  style: string | null;
  onSelect: () => void;
}) {
  const preview = usePreviewVoice();
  const remove = useDeleteClonedVoice();
  const audio = useRef<HTMLAudioElement | null>(null);

  async function play() {
    audio.current?.pause();
    if (voice.previewUrl) {
      audio.current = new Audio(voice.previewUrl);
    } else {
      const result = await preview.mutateAsync({ provider: voice.provider, voiceId: voice.voiceId, style });
      audio.current = new Audio(`data:audio/ogg;base64,${result.audio}`);
    }
    void audio.current.play();
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border p-2.5 transition-colors",
        selected ? "border-wa bg-wa/5 ring-1 ring-wa" : "border-border hover:bg-accent/50",
      )}
    >
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {selected && <Check className="h-3.5 w-3.5 text-wa" />}
          <span className="truncate">{voice.name}</span>
          {voice.cloned && <Badge variant="wa">Clonada</Badge>}
        </div>
        <div className="truncate text-xs text-muted-foreground">{voice.description}</div>
      </button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        onClick={() => void play()}
        disabled={preview.isPending}
        aria-label={`Escuchar la voz ${voice.name}`}
        title="Escuchar"
      >
        {preview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      </Button>
      {voice.cloned && voice.clonedId && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => remove.mutate(voice.clonedId!)}
          disabled={remove.isPending}
          aria-label={`Eliminar la voz clonada ${voice.name}`}
          title="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function RulesEditor({ rules, onChange, invalid }: { rules: string[]; onChange: (rules: string[]) => void; invalid: boolean }) {
  const [draft, setDraft] = useState("");
  const add = (rule: string) => {
    const r = rule.trim();
    if (r.length < 3 || rules.includes(r) || rules.length >= 10) return;
    onChange([...rules, r]);
    setDraft("");
  };
  return (
    <div className={cn("space-y-2 rounded-md border p-3", invalid ? "border-destructive/60" : "border-border")}>
      <div className="text-sm font-medium">Responde con voz cuando…</div>
      {rules.length > 0 && (
        <ul className="space-y-1">
          {rules.map((r) => (
            <li key={r} className="flex items-center gap-2 rounded bg-muted/50 px-2.5 py-1.5 text-sm">
              <span className="flex-1">{r}</span>
              <button type="button" onClick={() => onChange(rules.filter((x) => x !== r))} aria-label={`Quitar la regla ${r}`}>
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
      >
        <Input value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} placeholder="Escribe una regla" />
        <Button type="submit" variant="outline" disabled={draft.trim().length < 3}>
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {RULE_EXAMPLES.filter((e) => !rules.includes(e)).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => add(e)}
            className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            + {e}
          </button>
        ))}
      </div>
      {invalid && <p className="text-xs text-destructive">Agrega al menos una regla o elige otro modo.</p>}
    </div>
  );
}

/** Clonar una voz con ElevenLabs: audios limpios de la persona y su autorización. */
function CloneVoice() {
  const clone = useCloneVoice();
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const valid = name.trim().length >= 2 && files.length > 0 && consent;

  return (
    <div className="max-w-xl space-y-3 rounded-md border border-dashed border-border p-4">
      <div>
        <div className="text-sm font-semibold">Clonar una voz</div>
        <p className="text-xs text-muted-foreground">
          Sube de 1 a 5 audios de la persona hablando sola y sin ruido de fondo; lo ideal es 1 a 3 minutos en total. Puedes
          tener hasta 3 voces clonadas.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="clone-name">Nombre de la voz</Label>
        <Input id="clone-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ej: Voz de Laura" />
      </div>
      <div className="space-y-1.5">
        <input
          ref={input}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          <Upload className="h-4 w-4" /> {files.length ? `${files.length} audio(s) elegidos` : "Elegir audios"}
        </Button>
        {files.length > 0 && <p className="text-xs text-muted-foreground">{files.map((f) => f.name).join(", ")}</p>}
      </div>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>
          Confirmo que la persona dueña de esta voz me autorizó a clonarla y a usarla para atender a los clientes del negocio.
        </span>
      </label>
      <Button
        type="button"
        variant="wa"
        size="sm"
        disabled={!valid || clone.isPending}
        onClick={() =>
          clone.mutate(
            { name: name.trim(), consent, files },
            {
              onSuccess: () => {
                setName("");
                setFiles([]);
                setConsent(false);
              },
            },
          )
        }
      >
        {clone.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />} Clonar voz
      </Button>
    </div>
  );
}
