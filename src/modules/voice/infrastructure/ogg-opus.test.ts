import { test } from "node:test";
import assert from "node:assert/strict";
import OpusScript from "opusscript";
import { encodeOggOpus, oggCrc, parseWav, pcmSeconds } from "./ogg-opus";

/** Un tono de 440 Hz para tener audio real que codificar. */
function tone(seconds: number, rate = 24_000): Buffer {
  const pcm = Buffer.alloc(seconds * rate * 2);
  for (let i = 0; i < seconds * rate; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
  return pcm;
}

function wav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Separa las páginas OGG y sus paquetes, validando el CRC de cada página. */
function readOgg(ogg: Buffer) {
  const pages: { flags: number; granule: bigint; packets: Buffer[] }[] = [];
  let offset = 0;
  while (offset < ogg.length) {
    assert.equal(ogg.toString("ascii", offset, offset + 4), "OggS");
    const segments = ogg.readUInt8(offset + 26);
    const lacing = [...ogg.subarray(offset + 27, offset + 27 + segments)];
    const bodyLength = lacing.reduce((a, b) => a + b, 0);
    const page = Buffer.from(ogg.subarray(offset, offset + 27 + segments + bodyLength));
    const crc = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    assert.equal(oggCrc(page), crc, "CRC de la página");
    const packets: Buffer[] = [];
    let cursor = offset + 27 + segments;
    let current: Buffer[] = [];
    for (const l of lacing) {
      current.push(ogg.subarray(cursor, cursor + l));
      cursor += l;
      if (l < 255) {
        packets.push(Buffer.concat(current));
        current = [];
      }
    }
    pages.push({ flags: ogg.readUInt8(offset + 5), granule: ogg.readBigUInt64LE(offset + 6), packets });
    offset = cursor;
  }
  return pages;
}

test("lee un WAV de 24 kHz", () => {
  const audio = parseWav(wav(tone(1), 24_000));
  assert.equal(audio.sampleRate, 24_000);
  assert.equal(pcmSeconds(audio), 1);
});

test("codifica una nota de voz OGG/Opus válida y decodificable", () => {
  const ogg = encodeOggOpus({ pcm: tone(3), sampleRate: 24_000 });
  const pages = readOgg(ogg);
  assert.equal(pages[0]!.flags, 0x02, "primera página marcada como inicio");
  assert.equal(pages[0]!.packets[0]!.toString("ascii", 0, 8), "OpusHead");
  assert.equal(pages[1]!.packets[0]!.toString("ascii", 0, 8), "OpusTags");
  assert.equal(pages.at(-1)!.flags, 0x04, "última página marcada como fin");
  // 3 s a 48 kHz más el pre-skip
  assert.equal(pages.at(-1)!.granule, BigInt(312 + 3 * 48_000));

  const decoder = new OpusScript(24_000, 1);
  const audioPackets = pages.slice(2).flatMap((p) => p.packets);
  assert.equal(audioPackets.length, 150);
  const decoded = audioPackets.reduce((n, p) => n + decoder.decode(p).length, 0);
  decoder.delete();
  assert.equal(decoded, 3 * 24_000 * 2);
  // 24 kbps: unos 9 KB, muy por debajo de los 512 KB que permite WhatsApp para reproducir en línea
  assert.ok(ogg.length < 15_000, `tamaño ${ogg.length}`);
});
