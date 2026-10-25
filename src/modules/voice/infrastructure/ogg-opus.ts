import OpusScript from "opusscript";

/**
 * WhatsApp solo muestra un audio como nota de voz si es OGG con códec Opus. Los proveedores de voz
 * entregan PCM (o WAV), así que aquí se codifica con libopus (WASM, sin ffmpeg) y se arma el
 * contenedor OGG a mano (RFC 3533 y RFC 7845).
 */

type SampleRate = 8000 | 12000 | 16000 | 24000 | 48000;

const FRAME_MS = 20;
/** Retardo del codificador que el reproductor descarta, en muestras a 48 kHz */
const PRE_SKIP = 312;
const BITRATE = 24_000;
/** Paquetes por página: un segundo de audio */
const PACKETS_PER_PAGE = 50;

export interface PcmAudio {
  pcm: Buffer; // 16 bits, little endian, mono
  sampleRate: SampleRate;
}

/** Lee un WAV PCM de 16 bits mono (lo que devuelven algunos modelos de voz de Gemini). */
export function parseWav(wav: Buffer): PcmAudio {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("El audio no es un WAV válido");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      channels = wav.readUInt16LE(body + 2);
      sampleRate = wav.readUInt32LE(body + 4);
      bits = wav.readUInt16LE(body + 14);
    } else if (id === "data") {
      if (channels !== 1 || bits !== 16) throw new Error(`WAV no soportado: ${channels} canales, ${bits} bits`);
      return { pcm: wav.subarray(body, Math.min(body + size, wav.length)), sampleRate: assertRate(sampleRate) };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("El WAV no tiene datos de audio");
}

function assertRate(rate: number): SampleRate {
  if (![8000, 12000, 16000, 24000, 48000].includes(rate)) throw new Error(`Frecuencia no soportada por Opus: ${rate} Hz`);
  return rate as SampleRate;
}

export function pcmSeconds({ pcm, sampleRate }: PcmAudio): number {
  return pcm.length / 2 / sampleRate;
}

/** Codifica PCM mono de 16 bits a una nota de voz OGG/Opus. */
export function encodeOggOpus({ pcm, sampleRate }: PcmAudio): Buffer {
  const encoder = new OpusScript(assertRate(sampleRate), 1, OpusScript.Application.VOIP);
  try {
    encoder.setBitrate(BITRATE);
    const frameSamples = (sampleRate * FRAME_MS) / 1000;
    const frameBytes = frameSamples * 2;
    const samples48PerFrame = (48_000 * FRAME_MS) / 1000;

    const packets: Buffer[] = [];
    for (let offset = 0; offset < pcm.length; offset += frameBytes) {
      let frame = pcm.subarray(offset, offset + frameBytes);
      // El último cuadro se completa con silencio
      if (frame.length < frameBytes) frame = Buffer.concat([frame, Buffer.alloc(frameBytes - frame.length)]);
      packets.push(Buffer.from(encoder.encode(frame, frameSamples)));
    }

    const serial = Math.floor(Math.random() * 0xffffffff);
    const pages: Buffer[] = [
      oggPage({ serial, sequence: 0, granule: 0n, flags: 0x02, packets: [opusHead(sampleRate)] }),
      oggPage({ serial, sequence: 1, granule: 0n, flags: 0, packets: [opusTags()] }),
    ];
    let sequence = 2;
    for (let i = 0; i < packets.length; i += PACKETS_PER_PAGE) {
      const chunk = packets.slice(i, i + PACKETS_PER_PAGE);
      const isLast = i + PACKETS_PER_PAGE >= packets.length;
      const granule = BigInt(PRE_SKIP + (i + chunk.length) * samples48PerFrame);
      pages.push(oggPage({ serial, sequence: sequence++, granule, flags: isLast ? 0x04 : 0, packets: chunk }));
    }
    return Buffer.concat(pages);
  } finally {
    encoder.delete();
  }
}

function opusHead(inputRate: number): Buffer {
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "ascii");
  head.writeUInt8(1, 8); // versión
  head.writeUInt8(1, 9); // canales
  head.writeUInt16LE(PRE_SKIP, 10);
  head.writeUInt32LE(inputRate, 12);
  head.writeInt16LE(0, 16); // ganancia
  head.writeUInt8(0, 18); // mapeo de canales: mono/estéreo
  return head;
}

function opusTags(): Buffer {
  const vendor = Buffer.from("whatsAppia", "utf8");
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write("OpusTags", 0, "ascii");
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length); // sin comentarios
  return tags;
}

function oggPage(page: { serial: number; sequence: number; granule: bigint; flags: number; packets: Buffer[] }): Buffer {
  // Tabla de segmentos: cada paquete en trozos de 255 bytes y uno final menor a 255
  const lacing: number[] = [];
  for (const p of page.packets) {
    let remaining = p.length;
    while (remaining >= 255) {
      lacing.push(255);
      remaining -= 255;
    }
    lacing.push(remaining);
  }
  if (lacing.length > 255) throw new Error("Página OGG con demasiados segmentos");

  const header = Buffer.alloc(27 + lacing.length);
  header.write("OggS", 0, "ascii");
  header.writeUInt8(0, 4);
  header.writeUInt8(page.flags, 5);
  header.writeBigUInt64LE(page.granule, 6);
  header.writeUInt32LE(page.serial >>> 0, 14);
  header.writeUInt32LE(page.sequence, 18);
  header.writeUInt32LE(0, 22); // CRC, se calcula abajo
  header.writeUInt8(lacing.length, 26);
  lacing.forEach((v, i) => header.writeUInt8(v, 27 + i));

  const out = Buffer.concat([header, ...page.packets]);
  out.writeUInt32LE(oggCrc(out), 22);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

export function oggCrc(data: Buffer): number {
  let crc = 0;
  for (const byte of data) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!) >>> 0;
  return crc >>> 0;
}
