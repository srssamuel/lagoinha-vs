import { describe, it, expect } from 'vitest';
import { ZipMultitrackExtractor, ZipExtractionLimits } from '../../../src/infrastructure/audio/ZipMultitrackExtractor';

interface FakeEntry {
  name: string;
  data: Uint8Array;
  method: 0 | 8;
  /** Tamanho descomprimido declarado no cabeçalho (um zip bomb mente aqui). */
  declaredSize?: number;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Monta um .ZIP mínimo (sem CRC, que o extrator não confere). */
async function buildZip(entries: FakeEntry[]): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = enc.encode(entry.name);
    const payload = entry.method === 8 ? await deflateRaw(entry.data) : entry.data;
    const declared = entry.declaredSize ?? entry.data.byteLength;

    const local = new Uint8Array(30 + name.length + payload.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, entry.method, true);
    lv.setUint32(18, payload.length, true);
    lv.setUint32(22, declared, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(payload, 30 + name.length);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, entry.method, true);
    cv.setUint32(20, payload.length, true);
    cv.setUint32(24, declared, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

const tiny: ZipExtractionLimits = { maxAudioEntries: 3, maxStemBytes: 1000, maxTotalBytes: 1500 };
const bytes = (n: number) => new Uint8Array(n);

describe('ZipMultitrackExtractor — limites contra zip bomb', () => {
  it('extrai um pacote dentro dos limites (blob e buffer)', async () => {
    const zip = await buildZip([
      { name: 'Click.wav', data: bytes(400), method: 0 },
      { name: 'Bateria.wav', data: bytes(500), method: 8 }
    ]);
    const fromBlob = await ZipMultitrackExtractor.extractFromZipBlob(new Blob([zip]), undefined, tiny);
    expect(fromBlob.map((e) => [e.filename, e.blob.size])).toEqual([
      ['Click.wav', 400],
      ['Bateria.wav', 500]
    ]);
    const fromBuffer = await ZipMultitrackExtractor.extractAudioFiles(zip.buffer as ArrayBuffer, tiny);
    expect(fromBuffer).toHaveLength(2);
  });

  it('recusa pacote com faixas demais', async () => {
    const zip = await buildZip(
      Array.from({ length: 4 }, (_, i) => ({ name: `Stem${i}.wav`, data: bytes(10), method: 0 as const }))
    );
    await expect(ZipMultitrackExtractor.extractFromZipBlob(new Blob([zip]), undefined, tiny)).rejects.toThrow(/limite de 3/);
    await expect(ZipMultitrackExtractor.extractAudioFiles(zip.buffer as ArrayBuffer, tiny)).rejects.toThrow(/limite de 3/);
  });

  it('corta a descompressão mesmo quando o cabeçalho mente o tamanho (zip bomb)', async () => {
    // 50 KB de zeros comprimem para poucos bytes; o cabeçalho declara só 10 bytes.
    const zip = await buildZip([{ name: 'Guia.wav', data: bytes(50_000), method: 8, declaredSize: 10 }]);
    await expect(ZipMultitrackExtractor.extractFromZipBlob(new Blob([zip]), undefined, tiny)).rejects.toThrow(/excede/);
    await expect(ZipMultitrackExtractor.extractAudioFiles(zip.buffer as ArrayBuffer, tiny)).rejects.toThrow(/excede/);
  });

  it('recusa quando a soma das faixas passa do teto total', async () => {
    const zip = await buildZip([
      { name: 'A.wav', data: bytes(900), method: 0 },
      { name: 'B.wav', data: bytes(900), method: 8 }
    ]);
    await expect(ZipMultitrackExtractor.extractFromZipBlob(new Blob([zip]), undefined, tiny)).rejects.toThrow(/no total/);
    await expect(ZipMultitrackExtractor.extractAudioFiles(zip.buffer as ArrayBuffer, tiny)).rejects.toThrow(/no total/);
  });
});
