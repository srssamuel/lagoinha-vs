// Leitura dos metadados do Drive para desktop. NUNCA abre o original: copia db e -wal para uma pasta
// temporaria e abre a copia somente leitura. Nao toca em nenhum outro arquivo da pasta DriveFS.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Copia o SQLite (e o -wal, se houver) para um diretorio temporario novo. */
export function copyMetadataDb(srcDb) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lvs-drivefs-'));
  const dst = path.join(dir, 'metadata_sqlite_db');
  fs.copyFileSync(srcDb, dst);
  if (fs.existsSync(`${srcDb}-wal`)) fs.copyFileSync(`${srcDb}-wal`, `${dst}-wal`);
  return { dir, dbPath: dst };
}

export function removeTemp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const MD5_RE = /\x03\x20([0-9a-f]{32})(?![0-9a-f])/;

export function extractMd5(protoBytes) {
  if (!protoBytes) return '';
  const m = MD5_RE.exec(Buffer.from(protoBytes).toString('latin1'));
  return m ? m[1] : '';
}

/**
 * Le a arvore sob rootId.
 * @returns {{ root: object, items: object[] }} items em ordem pai-antes-de-filho; cada item tem
 *   id, parentId, isFolder, title, path (relativo a raiz, '/'), mime, size, modifiedMs, md5, trashed (efetivo), ownTrashed
 */
export function readDriveTree(dbPath, rootId) {
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    db.prepare('SELECT 1 FROM items LIMIT 1').get();
  } catch {
    // WAL sem -shm: a copia descartavel pode ser aberta normalmente (nunca o original)
    db = new DatabaseSync(dbPath);
  }
  try {
    const rootRow = db.prepare('SELECT stable_id FROM items WHERE id = ?').get(rootId);
    if (!rootRow) throw new Error('pasta raiz nao encontrada no SQLite de metadados do Drive');
    const kids = new Map();
    for (const r of db.prepare('SELECT item_stable_id a, parent_stable_id b FROM stable_parents').all()) {
      if (!kids.has(r.b)) kids.set(r.b, []);
      kids.get(r.b).push(r.a);
    }
    const rows = new Map();
    for (const r of db
      .prepare('SELECT stable_id, id, trashed, is_folder, is_tombstone, mime_type, file_size, modified_date, local_title, CAST(proto AS BLOB) AS proto FROM items')
      .all()) {
      rows.set(r.stable_id, r);
    }
    const root = rows.get(rootRow.stable_id);
    const items = [];
    const seen = new Set([rootRow.stable_id]);
    const queue = [{ sid: rootRow.stable_id, pathPrefix: '', parentId: null, parentTrashed: false }];
    while (queue.length) {
      const { sid, pathPrefix, parentId, parentTrashed } = queue.shift();
      const self = rows.get(sid);
      for (const kid of kids.get(sid) ?? []) {
        if (seen.has(kid)) continue;
        seen.add(kid);
        const r = rows.get(kid);
        if (!r || r.is_tombstone) continue;
        const title = r.local_title ?? r.id;
        const p = pathPrefix ? `${pathPrefix}/${title}` : title;
        const ownTrashed = !!r.trashed;
        const trashed = ownTrashed || parentTrashed;
        items.push({
          id: r.id,
          parentId: self.id,
          isFolder: !!r.is_folder,
          title,
          path: p,
          mime: r.mime_type,
          size: r.is_folder ? 0 : Number(r.file_size ?? 0),
          modifiedMs: Number(r.modified_date ?? 0),
          md5: r.is_folder ? '' : extractMd5(r.proto),
          trashed,
          ownTrashed,
        });
        if (r.is_folder) queue.push({ sid: kid, pathPrefix: p, parentId: r.id, parentTrashed: trashed });
      }
    }
    return { root: { id: root.id, title: root.local_title }, items };
  } finally {
    db.close();
  }
}
