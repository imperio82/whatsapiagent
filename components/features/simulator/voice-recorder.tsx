"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@components/ui/button";

/** Un minuto como máximo, igual que una nota de voz corta de WhatsApp. */
const MAX_SECONDS = 60;
const SAMPLE_RATE = 16_000;

/**
 * Graba una nota de voz con el micrófono y la entrega como WAV mono de 16 kHz en base64.
 * El navegador graba en WebM, que no todos los modelos aceptan; por eso se convierte aquí.
 */
export function VoiceRecorder({ disabled, onRecorded }: { disabled?: boolean; onRecorded: (wavBase64: string) => void }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => stop(), []);

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("No hay permiso para usar el micrófono");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      try {
        onRecorded(await toWavBase64(new Blob(chunks, { type: rec.mimeType })));
      } catch {
        toast.error("No se pudo procesar la grabación");
      }
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    const started = Date.now();
    timer.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) stop();
    }, 250);
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    setSeconds(null);
  }

  if (seconds !== null) {
    return (
      <Button type="button" variant="destructive" size="sm" onClick={stop} aria-label="Detener y enviar la nota de voz">
        <Square className="h-3.5 w-3.5 fill-current" /> {`0:${String(seconds).padStart(2, "0")}`}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={disabled}
      onClick={() => void start()}
      aria-label="Grabar una nota de voz"
      title="Grabar una nota de voz"
    >
      <Mic className="h-4 w-4" />
    </Button>
  );
}

async function toWavBase64(blob: Blob): Promise<string> {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const samples = audio.getChannelData(0);
    const wav = new DataView(new ArrayBuffer(44 + samples.length * 2));
    const write = (offset: number, text: string) => [...text].forEach((c, i) => wav.setUint8(offset + i, c.charCodeAt(0)));
    write(0, "RIFF");
    wav.setUint32(4, 36 + samples.length * 2, true);
    write(8, "WAVE");
    write(12, "fmt ");
    wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true);
    wav.setUint16(22, 1, true);
    wav.setUint32(24, SAMPLE_RATE, true);
    wav.setUint32(28, SAMPLE_RATE * 2, true);
    wav.setUint16(32, 2, true);
    wav.setUint16(34, 16, true);
    write(36, "data");
    wav.setUint32(40, samples.length * 2, true);
    samples.forEach((v, i) => wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));

    const bytes = new Uint8Array(wav.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  } finally {
    await ctx.close();
  }
}
