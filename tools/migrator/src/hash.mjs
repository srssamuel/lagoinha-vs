import crypto from 'node:crypto';

/**
 * Hash em streaming (sha256 + md5) guardando os primeiros bytes para deteccao de formato.
 * @param {import('node:stream').Readable} stream
 */
export async function hashStream(stream, { headBytes = 65536 } = {}) {
  const sha = crypto.createHash('sha256');
  const md5 = crypto.createHash('md5');
  let size = 0;
  const heads = [];
  let headLen = 0;
  for await (const chunk of stream) {
    sha.update(chunk);
    md5.update(chunk);
    size += chunk.length;
    if (headLen < headBytes) {
      const part = chunk.subarray(0, headBytes - headLen);
      heads.push(part);
      headLen += part.length;
    }
  }
  return { sha256: sha.digest('hex'), md5: md5.digest('hex'), size, head: Buffer.concat(heads) };
}

/** Duracao (s) de WAV PCM a partir do cabecalho; null quando nao for possivel. */
export function wavDurationSec(head, totalSize) {
  if (head.length < 12 || head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WAVE') return null;
  let p = 12;
  let byteRate = 0;
  while (p + 8 <= head.length) {
    const id = head.toString('latin1', p, p + 4);
    const sz = head.readUInt32LE(p + 4);
    if (id === 'fmt ' && p + 8 + 12 <= head.length) {
      byteRate = head.readUInt32LE(p + 16);
    } else if (id === 'data') {
      if (!byteRate) return null;
      const avail = Math.max(0, totalSize - (p + 8));
      const dataSize = sz === 0 || sz === 0xffffffff || sz > avail ? avail : sz;
      return Math.round((dataSize / byteRate) * 1000) / 1000;
    }
    p += 8 + sz + (sz % 2);
  }
  return null;
}
