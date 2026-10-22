// add-local: registra um arquivo do disco (fora do Drive) no manifesto, como o inventario faria com um item do Drive.
// Depois disso classify e migrate tratam o item igual aos demais (hash, upload, verificacao, registro).
// Use um MIGRATION_HOME proprio: o item nao pertence ao inventario do Drive e quebraria a prova de soma do reconcile.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './db.mjs';
import { describeMismatch, detectFormat } from './magic.mjs';
import { extOf, readHead } from './util.mjs';

async function md5File(filePath) {
  const h = crypto.createHash('md5');
  for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 1 << 20 })) h.update(chunk);
  return h.digest('hex');
}

/** @returns {Promise<{key:number, created:boolean, md5:string}>} */
export async function registerLocalFile({ cfg, db, filePath }) {
  const full = path.resolve(filePath);
  const st = fs.statSync(full);
  if (!st.isFile()) throw new Error(`nao e arquivo: ${full}`);
  const md5 = await md5File(full);
  const sourceId = `local:${md5}`;
  const cur = db.prepare('SELECT key FROM files WHERE source_id = ? AND is_current = 1').get(sourceId);
  if (cur) return { key: cur.key, created: false, md5 };

  const name = path.basename(full);
  const ext = extOf(name);
  const real = detectFormat(await readHead(full, 64), { ext });
  const now = nowIso();
  const res = db
    .prepare(
      `INSERT INTO files (kind, source_id, drive_id, md5, modified_ms, name, path, ext, size, trashed, local_present, local_size, local_rel,
         real_format, real_mime, real_kind, mismatch, church_id, scope, state, discovered_at, updated_at)
       VALUES ('file', @sid, @sid, @md5, @mod, @name, @name, @ext, @size, 0, 1, @size, @rel, @fmt, @mime, @kind, @mismatch, @church, @scope, 'discovered', @now, @now)`,
    )
    .run({
      sid: sourceId, md5, mod: Math.trunc(st.mtimeMs), name, ext, size: st.size, rel: full,
      fmt: real.format, mime: real.mime, kind: real.kind, mismatch: describeMismatch({ ext, mimeSource: null, real }).join(';') || null,
      church: cfg.churchId, scope: `church:${cfg.churchId}`, now,
    });
  return { key: Number(res.lastInsertRowid), created: true, md5 };
}
