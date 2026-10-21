// inventory: arvore real (SQLite do Drive) x disco (G:) x bytes iniciais -> manifesto.
import fs from 'node:fs';
import path from 'node:path';
import { sourcePath } from './config.mjs';
import { copyMetadataDb, removeTemp, readDriveTree } from './drivefs.mjs';
import { detectFormat, describeMismatch } from './magic.mjs';
import { finishRun, nowIso, startRun, tx } from './db.mjs';
import { extOf, freeBytes, normKey, pool, readHead, walkLocal } from './util.mjs';

const AUDIO_EXT = new Set(['wav', 'wave', 'mp3', 'm4a', 'flac', 'ogg', 'aif', 'aiff', 'wma']);
const ARCHIVE_FORMATS = new Set(['zip', 'rar', '7z']);

export async function runInventory({ cfg, db, log = () => {}, readHeaders = true, headerConcurrency = 4, prior = null }) {
  if (!cfg.driveFsDb) throw new Error('driveFsDb nao configurado');
  const runId = startRun(db, 'inventory');
  const tmp = copyMetadataDb(cfg.driveFsDb);
  let tree;
  try {
    tree = readDriveTree(tmp.dbPath, cfg.rootId);
  } finally {
    removeTemp(tmp.dir);
  }
  log(`arvore do Drive: ${tree.items.length} itens sob a raiz`);

  const local = walkLocal(cfg.sourceRoot);
  // casamento: caminho exato primeiro; depois chave normalizada (o Drive troca caracteres invalidos e pode haver nomes que so diferem na caixa)
  const localExact = new Map(local.map((e) => [e.rel, e]));
  const localByKey = new Map();
  for (const e of local) {
    const k = normKey(e.rel);
    if (!localByKey.has(k)) localByKey.set(k, []);
    localByKey.get(k).push(e);
  }
  const matchedLocal = new Set();
  const matchLocal = (it) => {
    const ex = localExact.get(it.path);
    if (ex && ex.isDir === it.isFolder && !matchedLocal.has(ex.rel)) return ex;
    return (localByKey.get(normKey(it.path)) ?? []).find((e) => e.isDir === it.isFolder && !matchedLocal.has(e.rel)) ?? null;
  };
  const now = nowIso();

  const upsertFolder = db.prepare(`INSERT INTO folders (drive_id, parent_id, name, path, trashed, local_present, last_seen_run)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(drive_id) DO UPDATE SET parent_id = excluded.parent_id, name = excluded.name, path = excluded.path,
      trashed = excluded.trashed, local_present = excluded.local_present, last_seen_run = excluded.last_seen_run`);
  const findCurrent = db.prepare('SELECT key, md5, modified_ms, state, reason FROM files WHERE source_id = ? AND is_current = 1');
  const retire = db.prepare('UPDATE files SET is_current = 0, updated_at = ? WHERE key = ?');
  const insertFile = db.prepare(`INSERT INTO files (kind, source_id, drive_id, md5, modified_ms, parent_id, name, path, ext, mime_source, size,
      trashed, local_present, local_size, local_rel, church_id, scope, state, reason, last_seen_run, discovered_at, updated_at)
    VALUES ('file', @id, @id, @md5, @modified, @parent, @name, @path, @ext, @mime, @size, @trashed, @lp, @ls, @lrel, @church, @scope, @state, @reason, @run, @now, @now)`);
  const updateFile = db.prepare(`UPDATE files SET parent_id = @parent, name = @name, path = @path, ext = @ext, mime_source = @mime, size = @size,
      trashed = @trashed, local_present = @lp, local_size = @ls, local_rel = @lrel, last_seen_run = @run, updated_at = @now WHERE key = @key`);
  const setStateRow = db.prepare('UPDATE files SET state = ?, reason = ?, updated_at = ? WHERE key = ?');

  const counters = { newFiles: 0, newVersions: 0, unchanged: 0 };
  tx(db, () => {
    for (const it of tree.items) {
      const le = matchLocal(it);
      if (le) matchedLocal.add(le.rel);
      const present = le ? 1 : 0;
      if (it.isFolder) {
        upsertFolder.run(it.id, it.parentId, it.title, it.path, it.trashed ? 1 : 0, present, runId);
        continue;
      }
      const base = {
        id: it.id, md5: it.md5, modified: it.modifiedMs, parent: it.parentId, name: it.title, path: it.path, ext: extOf(it.title),
        mime: it.mime, size: it.size, trashed: it.trashed ? 1 : 0, lp: present, ls: present ? le.size : null, lrel: present ? le.rel : null,
        church: cfg.churchId, scope: `church:${cfg.churchId}`, run: runId, now,
        state: it.trashed ? 'excluded' : 'discovered', reason: it.trashed ? 'excluded: na lixeira do Drive' : null,
      };
      const cur = findCurrent.get(it.id);
      if (!cur) {
        insertFile.run(base);
        counters.newFiles++;
      } else if (cur.md5 !== it.md5 || Number(cur.modified_ms) !== it.modifiedMs) {
        retire.run(now, cur.key);
        db.prepare("UPDATE files SET is_current = 0, updated_at = ? WHERE kind = 'zip-entry' AND container_key = ?").run(now, cur.key);
        insertFile.run(base);
        counters.newVersions++;
      } else {
        updateFile.run({
          key: cur.key, parent: base.parent, name: base.name, path: base.path, ext: base.ext, mime: base.mime, size: base.size,
          trashed: base.trashed, lp: base.lp, ls: base.ls, lrel: base.lrel, run: base.run, now: base.now,
        });
        counters.unchanged++;
        // lixeira <-> ativo: so mexe no estado quando ele ainda e o inicial/derivado da lixeira
        if (it.trashed && cur.state === 'discovered') setStateRow.run('excluded', base.reason, now, cur.key);
        if (!it.trashed && cur.state === 'excluded' && cur.reason === 'excluded: na lixeira do Drive') setStateRow.run('discovered', null, now, cur.key);
      }
    }
    // so no disco
    const upLocal = db.prepare(`INSERT INTO local_only (rel, size, is_dir, last_seen_run, note) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(rel) DO UPDATE SET size = excluded.size, last_seen_run = excluded.last_seen_run`);
    for (const e of local) {
      if (matchedLocal.has(e.rel)) continue;
      const base = e.rel.split('/').pop().toLowerCase();
      upLocal.run(e.rel, e.size, e.isDir ? 1 : 0, runId, base === 'desktop.ini' ? 'desktop.ini (gerado pelo Windows/Drive, nao e do acervo)' : null);
    }
  });

  // bytes iniciais (somente os 64 primeiros; o Drive pode materializar o arquivo, entao ha guarda de disco)
  let headersRead = 0;
  let headerErrors = 0;
  if (readHeaders) {
    const todo = db
      .prepare(`SELECT key, local_rel, ext, mime_source, size, local_size FROM files
        WHERE kind = 'file' AND is_current = 1 AND trashed = 0 AND local_present = 1 AND real_format IS NULL`)
      .all();
    log(`lendo cabecalhos de ${todo.length} arquivos`);
    const setHead = db.prepare(`UPDATE files SET real_format = ?, real_mime = ?, real_kind = ?, header_hex = ?, mismatch = ?, updated_at = ? WHERE key = ?`);
    const cacheVolume = path.parse(cfg.driveFsDb).root || cfg.driveFsDb;
    await pool(todo, headerConcurrency, async (row, idx) => {
      if (idx % 100 === 0) {
        const free = freeBytes(cacheVolume);
        if (free < cfg.minFreeBytes) throw new Error(`espaco livre abaixo do minimo (${free} bytes) - leitura interrompida; reexecute apos liberar disco`);
        if (idx > 0) log(`  ${idx}/${todo.length}`);
      }
      const full = sourcePath(cfg, row.local_rel);
      let head;
      try {
        head = await readHead(full, 64);
      } catch (e) {
        headerErrors++;
        setHead.run('unreadable', null, null, null, `leitura:${e.code ?? 'erro'}`, nowIso(), row.key);
        return;
      }
      const real = detectFormat(head, { ext: row.ext });
      const tags = describeMismatch({ ext: row.ext, mimeSource: row.mime_source, real });
      if (Number(row.size) !== Number(row.local_size)) tags.push(`tamanho:nuvem=${row.size}!=local=${row.local_size}`);
      setHead.run(real.format, real.mime, real.kind, head.subarray(0, 16).toString('hex'), tags.join(';') || null, nowIso(), row.key);
      headersRead++;
    });
  }

  const totals = computeTotals(db, runId, cfg, prior);
  tx(db, () => db.prepare('INSERT OR REPLACE INTO inventory_runs (run_id, totals) VALUES (?, ?)').run(runId, JSON.stringify(totals)));
  finishRun(db, runId, { ...counters, headersRead, headerErrors });
  return { runId, totals, counters, headersRead, headerErrors };
}

export function computeTotals(db, runId, cfg, prior) {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const cur = `kind = 'file' AND is_current = 1 AND last_seen_run = ?`;
  const folders = one('SELECT COUNT(*) c FROM folders WHERE last_seen_run = ?', runId).c;
  const foldersActive = one('SELECT COUNT(*) c FROM folders WHERE last_seen_run = ? AND trashed = 0', runId).c;
  const foldersLocal = one('SELECT COUNT(*) c FROM folders WHERE last_seen_run = ? AND trashed = 0 AND local_present = 1', runId).c;
  const tot = one(`SELECT COUNT(*) c, COALESCE(SUM(size),0) b FROM files WHERE ${cur}`, runId);
  const trashed = one(`SELECT COUNT(*) c, COALESCE(SUM(size),0) b FROM files WHERE ${cur} AND trashed = 1`, runId);
  const active = one(`SELECT COUNT(*) c, COALESCE(SUM(size),0) b FROM files WHERE ${cur} AND trashed = 0`, runId);
  const cloudOnly = one(`SELECT COUNT(*) c, COALESCE(SUM(size),0) b FROM files WHERE ${cur} AND trashed = 0 AND local_present = 0`, runId);
  const onDisk = one(`SELECT COUNT(*) c, COALESCE(SUM(local_size),0) b FROM files WHERE ${cur} AND trashed = 0 AND local_present = 1`, runId);
  const sizeDiff = one(`SELECT COUNT(*) c FROM files WHERE ${cur} AND trashed = 0 AND local_present = 1 AND size != local_size`, runId).c;
  const localOnlyFiles = all('SELECT rel, size, note FROM local_only WHERE last_seen_run = ? AND is_dir = 0', runId);
  const localOnlyDirs = one('SELECT COUNT(*) c FROM local_only WHERE last_seen_run = ? AND is_dir = 1', runId).c;
  const localOnlyIni = localOnlyFiles.filter((f) => f.note?.startsWith('desktop.ini'));
  const localOnlyOther = localOnlyFiles.filter((f) => !f.note?.startsWith('desktop.ini'));
  const byFormat = all(
    `SELECT COALESCE(real_format,'(sem leitura)') f, COUNT(*) c, COALESCE(SUM(size),0) b FROM files WHERE ${cur} AND trashed = 0 GROUP BY 1 ORDER BY c DESC`,
    runId,
  );
  const bySourceMime = all(
    `SELECT mime_source m, COUNT(*) c FROM files WHERE ${cur} AND trashed = 0 GROUP BY 1 ORDER BY c DESC`,
    runId,
  );
  const rows = all(`SELECT ext, mime_source, real_format, real_kind, mismatch FROM files WHERE ${cur} AND trashed = 0`, runId);
  const audioByRealFormat = rows.filter((r) => r.real_kind === 'audio').length;
  const audioBySourceMime = rows.filter((r) => /^audio\//i.test(r.mime_source)).length;
  const audioByExt = rows.filter((r) => AUDIO_EXT.has(r.ext)).length;
  const archivesByReal = rows.filter((r) => ARCHIVE_FORMATS.has(r.real_format)).length;
  const archivesBySourceMime = rows.filter((r) => /zip|rar|7z|compressed/i.test(r.mime_source)).length;
  const archivesByExt = rows.filter((r) => ['zip', 'rar', '7z'].includes(r.ext)).length;
  const mismatchKinds = {};
  for (const r of rows) {
    for (const t of (r.mismatch ?? '').split(';').filter(Boolean)) {
      const kind = t.split(':')[0];
      mismatchKinds[kind] = (mismatchKinds[kind] ?? 0) + 1;
    }
  }
  const mismatchTotal = rows.filter((r) => r.mismatch).length;
  const sansExtZip = rows.filter((r) => !r.ext && r.real_kind === 'archive').length;
  const totals = {
    generatedAt: nowIso(),
    cloud: {
      foldersIncludingRoot: folders + 1,
      foldersActiveIncludingRoot: foldersActive + 1,
      filesTotal: tot.c,
      bytesTotal: tot.b,
      filesTrashed: trashed.c,
      bytesTrashed: trashed.b,
      filesActive: active.c,
      bytesActive: active.b,
    },
    disk: {
      subfoldersMatched: foldersLocal,
      filesMatched: onDisk.c,
      bytesMatched: onDisk.b,
      cloudOnlyFiles: cloudOnly.c,
      cloudOnlyBytes: cloudOnly.b,
      sizeDifferences: sizeDiff,
      localOnlyFiles: localOnlyFiles.length,
      localOnlyBytes: localOnlyFiles.reduce((s, f) => s + f.size, 0),
      localOnlyDesktopIni: { files: localOnlyIni.length, bytes: localOnlyIni.reduce((s, f) => s + f.size, 0) },
      localOnlyOther: { files: localOnlyOther.length, bytes: localOnlyOther.reduce((s, f) => s + f.size, 0) },
      localOnlyDirs,
    },
    audio: { byRealFormat: audioByRealFormat, bySourceMime: audioBySourceMime, byExtension: audioByExt },
    archives: { byRealFormat: archivesByReal, bySourceMime: archivesBySourceMime, byExtension: archivesByExt, withoutExtension: sansExtZip },
    byRealFormat: byFormat,
    bySourceMime,
    mismatches: { filesWithAny: mismatchTotal, byKind: mismatchKinds },
    prior: prior ?? null,
  };
  return totals;
}
