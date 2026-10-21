import fs from 'node:fs';
import path from 'node:path';

/** Executa fn para cada item com no maximo `n` em paralelo; para ao primeiro erro nao tratado. */
export async function pool(items, n, fn) {
  let i = 0;
  let failed = null;
  const worker = async () => {
    while (!failed) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        await fn(items[idx], idx);
      } catch (e) {
        failed = e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  if (failed) throw failed;
}

/** Bytes livres no volume que contem `p`. */
export function freeBytes(p) {
  const s = fs.statfsSync(p);
  return Number(s.bavail) * Number(s.bsize);
}

export function extOf(name) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name ?? '');
  return m ? m[1].toLowerCase() : '';
}

/** Chave de comparacao entre nome do Drive e nome local (o Drive para desktop troca caracteres invalidos no Windows). */
export function normKey(rel) {
  return rel
    .split('/')
    .map((s) => s.normalize('NFC').toLowerCase().replace(/[<>:"\\|?*]/g, '_').replace(/[. ]+$/, ''))
    .join('/');
}

/** Percorre uma pasta local (somente leitura). */
export function walkLocal(root) {
  const out = [];
  const rec = (dir, relPrefix) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        out.push({ rel, isDir: true, size: 0 });
        rec(full, rel);
      } else if (e.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          /* arquivo sumiu durante a varredura */
        }
        out.push({ rel, isDir: false, size });
      }
    }
  };
  rec(root, '');
  return out;
}

export async function readHead(filePath, n = 64) {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
