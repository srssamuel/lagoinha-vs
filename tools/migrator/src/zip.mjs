// Leitor ZIP proprio (sem dependencias): diretorio central -> entradas; entrada -> stream (inflate raw) com CRC32.
// Nao extrai o arquivo inteiro: le so o fim do arquivo (EOCD + diretorio central) e, por entrada, o intervalo dela.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';

const EOCD_SIG = 0x06054b50;
const EOCD64_LOC_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

function decodeName(buf, utf8Flag) {
  if (utf8Flag) return buf.toString('utf8');
  const asUtf8 = buf.toString('utf8');
  // UTF-8 valido sem U+FFFD => provavelmente UTF-8 (muitos compactadores nao ligam o flag)
  if (!asUtf8.includes('�')) return asUtf8;
  return buf.toString('latin1');
}

function readAt(fd, position, length) {
  const buf = Buffer.alloc(length);
  const n = fs.readSync(fd, buf, 0, length, position);
  return buf.subarray(0, n);
}

/**
 * @returns {{ entries: Array<{name:string,isDir:boolean,method:number,encrypted:boolean,crc32:number,compressedSize:number,size:number,localHeaderOffset:number}>, fileSize:number }}
 */
export function listZipEntries(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const fileSize = fs.fstatSync(fd).size;
    const tailLen = Math.min(fileSize, 65557 + 22);
    const tail = readAt(fd, fileSize - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('zip: fim do diretorio central nao encontrado');
    let total = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      const locPos = eocd - 20;
      if (locPos < 0 || tail.readUInt32LE(locPos) !== EOCD64_LOC_SIG) throw new Error('zip64: localizador ausente');
      const eocd64Off = Number(tail.readBigUInt64LE(locPos + 8));
      const e64 = readAt(fd, eocd64Off, 56);
      if (e64.readUInt32LE(0) !== EOCD64_SIG) throw new Error('zip64: registro invalido');
      total = Number(e64.readBigUInt64LE(32));
      cdSize = Number(e64.readBigUInt64LE(40));
      cdOffset = Number(e64.readBigUInt64LE(48));
    }
    const cd = readAt(fd, cdOffset, cdSize);
    const entries = [];
    let p = 0;
    for (let i = 0; i < total; i++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== CEN_SIG) throw new Error('zip: diretorio central corrompido');
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      const crc32 = cd.readUInt32LE(p + 16);
      let compressedSize = cd.readUInt32LE(p + 20);
      let size = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      let localHeaderOffset = cd.readUInt32LE(p + 42);
      const name = decodeName(cd.subarray(p + 46, p + 46 + nameLen), !!(flags & 0x800));
      // extra zip64
      let ep = p + 46 + nameLen;
      const eEnd = ep + extraLen;
      while (ep + 4 <= eEnd) {
        const id = cd.readUInt16LE(ep);
        const sz = cd.readUInt16LE(ep + 2);
        if (id === 0x0001) {
          let q = ep + 4;
          if (size === 0xffffffff) { size = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (compressedSize === 0xffffffff) { compressedSize = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (localHeaderOffset === 0xffffffff) { localHeaderOffset = Number(cd.readBigUInt64LE(q)); q += 8; }
        }
        ep += 4 + sz;
      }
      entries.push({
        name: name.replace(/\\/g, '/'),
        isDir: name.endsWith('/'),
        method, encrypted: !!(flags & 1), crc32, compressedSize, size, localHeaderOffset,
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return { entries, fileSize };
  } finally {
    fs.closeSync(fd);
  }
}

/** Stream com os bytes descompactados de uma entrada; erro no fim se o CRC32 nao bater. */
export function openZipEntryStream(filePath, entry) {
  if (entry.encrypted) throw new Error('zip: entrada criptografada');
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`zip: metodo de compressao ${entry.method} nao suportado`);
  const fd = fs.openSync(filePath, 'r');
  let dataStart;
  try {
    const lh = readAt(fd, entry.localHeaderOffset, 30);
    if (lh.length < 30 || lh.readUInt32LE(0) !== LOC_SIG) throw new Error('zip: cabecalho local invalido');
    dataStart = entry.localHeaderOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  } finally {
    fs.closeSync(fd);
  }
  const raw = fs.createReadStream(filePath, { start: dataStart, end: dataStart + entry.compressedSize - 1, highWaterMark: 1 << 20 });
  const source = entry.method === 8 ? raw.pipe(zlib.createInflateRaw()) : raw;
  raw.on('error', (e) => source.destroy(e));
  let crc = 0;
  let seen = 0;
  return Readable.from(
    (async function* () {
      for await (const chunk of source) {
        crc = zlib.crc32(chunk, crc);
        seen += chunk.length;
        yield chunk;
      }
      if (seen !== entry.size) throw new Error(`zip: tamanho ${seen} != ${entry.size}`);
      if ((crc >>> 0) !== entry.crc32) throw new Error('zip: CRC32 divergente');
    })(),
  );
}

export const crcHex = (n) => (n >>> 0).toString(16).padStart(8, '0');
