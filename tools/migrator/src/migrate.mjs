// migrate: hash -> upload -> verificacao -> registro de origem -> Firestore -> publicacao (so com recursos obrigatorios).
// Retomavel por arquivo: o estado de cada item no manifesto decide o proximo passo; reexecutar nunca refaz nem duplica.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { finishRun, nowIso, startRun, tx } from './db.mjs';
import { hashStream, wavDurationSec } from './hash.mjs';
import { detectFormat } from './magic.mjs';
import { MAX_STEMS, PENDING, refreshSongReasons, songPendingReasons } from './classify.mjs';
import { freeBytes } from './util.mjs';
import { listZipEntries, openZipEntryStream } from './zip.mjs';

export class MigrationAborted extends Error {
  constructor(msg = 'migracao interrompida') {
    super(msg);
    this.name = 'MigrationAborted';
  }
}

export const DEFAULT_CATEGORIES = ['song_stem', 'pad'];
const OK_STATES = new Set(['verified', 'associated', 'published']);

const get = (db, key) => db.prepare('SELECT * FROM files WHERE key = ?').get(key);
function upd(db, key, fields) {
  const cols = Object.keys(fields);
  for (const c of cols) if (!/^[a-z0-9_]+$/.test(c)) throw new Error(`coluna invalida ${c}`);
  db.prepare(`UPDATE files SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE key = ?`).run(...cols.map((c) => fields[c] ?? null), nowIso(), key);
}

/** Abre os bytes de um item: arquivo em G: ou entrada de zip (streaming, sem extrair para disco). */
export function makeContentOpener(cfg) {
  const listings = new Map();
  return function openContent(row) {
    const full = path.join(cfg.sourceRoot, ...row.local_rel.split('/'));
    if (row.kind === 'file') return fs.createReadStream(full, { highWaterMark: 1 << 20 });
    let map = listings.get(full);
    if (!map) {
      map = new Map(listZipEntries(full).entries.map((e) => [e.name, e]));
      listings.set(full, map);
    }
    const entry = map.get(row.entry_path);
    if (!entry) throw new Error('entrada nao encontrada no zip');
    return openZipEntryStream(full, entry);
  };
}

/**
 * Piloto: 1 musica com stems em pasta, 1 zip, 1 pad e 1 caso especial de formato/metadados.
 * @returns {{keys:number[], picks:object, notes:string[]}}
 */
export function pickPilot(db, { maxSongBytes = 1.5e9, maxZipBytes = 2e9 } = {}) {
  const notes = [];
  const picks = {};
  const keys = new Set();
  const take = (label, rows) => {
    picks[label] = { items: rows.length, bytes: rows.reduce((s, r) => s + r.size, 0) };
    rows.forEach((r) => keys.add(r.key));
  };

  const song = db
    .prepare(
      `SELECT s.song_id, s.bpm, COUNT(f.key) n, SUM(f.size) b FROM songs s JOIN files f ON f.song_id = s.song_id AND f.is_current = 1 AND f.kind = 'file' AND f.state = 'discovered' AND f.local_present = 1
       WHERE s.kind = 'song' AND s.status = 'pending' AND s.group_key LIKE 'd:%' GROUP BY s.song_id
       HAVING n >= 3 AND n = (SELECT COUNT(*) FROM files x WHERE x.song_id = s.song_id AND x.is_current = 1)
         AND SUM(CASE WHEN f.stem_type NOT IN ('click','guide') THEN 1 ELSE 0 END) > 0 AND b < ?
       ORDER BY (s.bpm IS NULL), b ASC LIMIT 1`,
    )
    .get(maxSongBytes);
  if (song) take('song_folder', db.prepare(`SELECT key, size FROM files WHERE song_id = ? AND is_current = 1`).all(song.song_id));
  else notes.push('nenhuma musica com stems em pasta elegivel');

  const zipRows = (extFilter) =>
    db
      .prepare(
        `SELECT c.key ck, c.size csize, c.ext cext FROM files c WHERE c.kind = 'file' AND c.is_current = 1 AND c.trashed = 0 AND c.category = 'song_zip' AND c.real_format = 'zip' AND c.size < ?
         AND (SELECT COUNT(*) FROM files e JOIN songs sg ON sg.song_id = e.song_id AND sg.status = 'pending' WHERE e.container_key = c.key AND e.is_current = 1 AND e.category = 'song_stem' AND e.state = 'discovered') >= 3
         ${extFilter} ORDER BY c.size ASC LIMIT 1`,
      )
      .get(maxZipBytes);
  const zip = zipRows(`AND c.ext = 'zip'`);
  if (zip) take('zip', db.prepare(`SELECT e.key, e.size FROM files e JOIN songs sg ON sg.song_id = e.song_id AND sg.status = 'pending' WHERE e.container_key = ? AND e.is_current = 1 AND e.category = 'song_stem' AND e.state = 'discovered'`).all(zip.ck));
  else notes.push('nenhum zip elegivel');

  const pad = db
    .prepare(`SELECT key, size FROM files WHERE kind = 'file' AND category = 'pad' AND is_current = 1 AND state = 'discovered' AND local_present = 1 ORDER BY size ASC LIMIT 1`)
    .get();
  if (pad) take('pad', [pad]);
  else notes.push('nenhum pad elegivel');

  // caso especial: zip sem extensao .zip > .asd com mime de origem divergente (forcado) > audio com formato divergente
  const noExtZip = zipRows(`AND c.ext != 'zip'`);
  let special = null;
  if (noExtZip) {
    special = { label: 'zip_sem_extensao', rows: db.prepare(`SELECT key, size FROM files WHERE container_key = ? AND is_current = 1 AND category = 'song_stem' AND state = 'discovered'`).all(noExtZip.ck) };
  }
  if (!special) {
    const asd = db
      .prepare(`SELECT key, size FROM files WHERE kind = 'file' AND is_current = 1 AND trashed = 0 AND ext = 'asd' AND mismatch LIKE 'mime:%' AND local_present = 1 AND state IN ('excluded','pending','discovered') ORDER BY size ASC LIMIT 1`)
      .get();
    if (asd) {
      special = { label: 'asd_mime_divergente', rows: [asd], force: true };
    }
  }
  if (!special) {
    const mm = db
      .prepare(`SELECT key, size FROM files WHERE kind = 'file' AND is_current = 1 AND trashed = 0 AND category IN ('song_stem','pad') AND mismatch IS NOT NULL AND state = 'discovered' ORDER BY size ASC LIMIT 1`)
      .get();
    if (mm) special = { label: 'audio_formato_divergente', rows: [mm] };
  }
  if (special) {
    if (special.force) {
      for (const r of special.rows) {
        upd(db, r.key, { state: 'discovered', reason: 'pilot: caso especial forcado para validar o pipeline (categoria normalmente fora do escopo)' });
      }
    }
    take(`special:${special.label}`, special.rows);
  } else notes.push('nenhum caso especial encontrado');
  return { keys: [...keys], picks, notes };
}

export async function runMigrate({
  cfg, db, storage, registry, log = () => {}, pilot = false, signal, abortAfter, assumeTimeSignature = null,
  categories = DEFAULT_CATEGORIES, hooks = {}, openContent = makeContentOpener(cfg), retryFailed = false, concurrency = 1,
  readRetryMs = 10_000,
}) {
  const runId = startRun(db, pilot ? 'migrate-pilot' : 'migrate');
  const summary = {
    storage: storage.name, registry: registry.name, pilot, processed: 0, hashed: 0, uploaded: 0, alreadyExisted: 0, verified: 0, failed: 0,
    aborted: false, songs: { associated: 0, published: 0, pending: 0, waiting: 0 }, pilotPicks: null,
  };
  let pilotKeys = null;
  if (pilot) {
    const saved = db.prepare(`SELECT value FROM meta WHERE key = 'pilot_keys'`).get();
    if (saved) pilotKeys = JSON.parse(saved.value);
    else {
      const p = pickPilot(db);
      pilotKeys = p.keys;
      db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('pilot_keys', ?)`).run(JSON.stringify(pilotKeys));
      summary.pilotPicks = { ...p.picks, notes: p.notes };
    }
  }
  if (retryFailed) db.exec(`UPDATE files SET state = 'discovered', reason = NULL WHERE state = 'failed' AND is_current = 1`);
  const uid = registry.uid;
  const ctx = { cfg, db, storage, registry, openContent, hooks, uid, assumeTimeSignature, log, summary };

  const cats = categories.map((c) => `'${c}'`).join(',');
  const work = db
    .prepare(
      `SELECT key FROM files WHERE is_current = 1 AND trashed = 0 AND local_present = 1 AND state IN ('discovered','hashed','uploaded')
       ${pilot ? '' : `AND category IN (${cats})`} ORDER BY key`,
    )
    .all()
    .map((r) => r.key)
    .filter((k) => !pilotKeys || pilotKeys.includes(k));
  log(`${work.length} itens na fila${pilot ? ' (piloto)' : ''}`);

  try {
    // Fila compartilhada por N trabalhadores: baixar do Drive e enviar ao R2 se sobrepoem entre itens.
    // Erro fatal ou interrupcao para todos; os itens em andamento terminam e o manifesto continua retomavel.
    const queue = [...work];
    let stop = null;
    const runner = async () => {
      while (!stop && queue.length) {
        const key = queue.shift();
        try {
          checkAbort(signal, summary, abortAfter == null ? undefined : abortAfter - inFlight.size);
          await guardDisk(ctx);
        } catch (e) {
          stop ??= e;
          return;
        }
        inFlight.add(key);
        try {
          await withReadRetry(() => processUnit(ctx, key), { log, key, waitMs: readRetryMs });
          summary.processed++;
          if (summary.processed % 25 === 0) log(`${summary.processed} de ${work.length} itens processados`);
        } catch (e) {
          if (e instanceof MigrationAborted || e.fatal) {
            stop ??= e;
            return;
          }
          summary.failed++;
          const msg = `failed: ${String(e.message ?? e).slice(0, 300)}`;
          log(`falha no item ${key}: ${msg}`);
          upd(db, key, { state: 'failed', reason: msg });
        } finally {
          inFlight.delete(key);
        }
      }
    };
    const inFlight = new Set();
    await Promise.all(Array.from({ length: Math.max(1, Math.floor(concurrency)) }, runner));
    if (stop) throw stop;
    await associateSongs(ctx, pilotKeys);
    containerStates(db);
  } catch (e) {
    if (e instanceof MigrationAborted) {
      summary.aborted = true;
      log(`interrompido: ${e.message}`);
    } else {
      finishRun(db, runId, { ...summary, error: String(e.message ?? e) });
      throw e;
    }
  }
  summary.storageStats = storage.stats;
  summary.registryStats = registry.stats;
  finishRun(db, runId, summary);
  return summary;
}

// Drive para desktop, ao baixar sob demanda, devolve erros passageiros de leitura (visto: EISDIR e ETIMEDOUT em
// arquivos comuns que leem normalmente depois). Esses repetem com espera crescente; o resto falha na hora.
const TRANSIENT_READ = new Set(['EISDIR', 'ETIMEDOUT', 'EIO', 'EBUSY', 'ECONNRESET', 'EAGAIN', 'UNKNOWN']);

export async function withReadRetry(fn, { attempts = 4, waitMs = 10_000, log = () => {}, key, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!TRANSIENT_READ.has(e?.code) || i >= attempts - 1) throw e;
      log(`leitura do item ${key} falhou (${e.code}); nova tentativa ${i + 2} de ${attempts}`);
      await sleep(waitMs * 2 ** i);
    }
  }
}

function checkAbort(signal, summary, abortAfter) {
  if (signal?.aborted) throw new MigrationAborted('sinal de interrupcao');
  if (abortAfter != null && summary.processed >= abortAfter) throw new MigrationAborted(`abort-after ${abortAfter}`);
}

async function guardDisk(ctx) {
  const { cfg, storage } = ctx;
  const probes = [cfg.home];
  if (storage.name === 'local') probes.push(cfg.r2LocalDir);
  for (const p of probes) {
    fs.mkdirSync(p, { recursive: true });
    const free = freeBytes(p);
    if (free < cfg.minFreeBytes) throw Object.assign(new Error(`espaco livre insuficiente (${free} bytes) em ${p}`), { fatal: true });
  }
}

async function processUnit(ctx, key) {
  const { db, hooks } = ctx;
  let r = get(db, key);
  if (r.state === 'discovered') {
    await hooks.beforeStep?.('hash', r);
    await stepHash(ctx, r);
    r = get(db, key);
  }
  if (r.state === 'hashed') {
    await hooks.beforeStep?.('upload', r);
    await stepUpload(ctx, r);
    r = get(db, key);
  }
  if (r.state === 'uploaded') {
    await hooks.beforeStep?.('verify', r);
    await stepVerify(ctx, r);
  }
}

async function stepHash(ctx, r) {
  const { db, summary } = ctx;
  const h = await hashStream(ctx.openContent(r));
  if (h.size !== r.size) throw new Error(`tamanho lido ${h.size} != esperado ${r.size}`);
  if (r.kind === 'file' && r.md5 && h.md5 !== r.md5) throw new Error('md5 dos bytes diverge do md5 do Drive');
  const real = detectFormat(h.head.subarray(0, 64), { ext: r.ext });
  const dur = real.format === 'wav' ? wavDurationSec(h.head, h.size) : null;
  const scope = r.scope ?? `church:${ctx.cfg.churchId}`;
  const base = {
    sha256: h.sha256, md5_local: h.md5, r2_key: `${scope === 'catalog' ? 'catalog' : `churches/${ctx.cfg.churchId}`}/blobs/${h.sha256}`,
    real_format: real.format, real_mime: real.mime, real_kind: real.kind, header_hex: h.head.subarray(0, 16).toString('hex'), duration_sec: dur,
  };
  if (r.kind === 'zip-entry' && r.category === 'song_stem' && real.kind !== 'audio') {
    upd(db, r.key, { ...base, category: 'unknown', song_id: null, state: 'pending', reason: `${PENDING}entrada com extensao de audio, mas os bytes sao ${real.format}` });
    return;
  }
  upd(db, r.key, { ...base, state: 'hashed' });
  summary.hashed++;
}

async function stepUpload(ctx, r) {
  const { db, storage, summary } = ctx;
  const scope = r.scope;
  const head = await storage.head(scope, r.sha256);
  let existed;
  if (head.exists) {
    if (head.size !== r.size) throw new Error('blob ja existente com tamanho diferente do arquivo (hash igual, tamanho diferente)');
    existed = r.upload_started_at ? 0 : 1; // se NOS iniciamos o upload numa execucao interrompida, nao e "ja existente"
  } else {
    if (!r.upload_started_at) upd(db, r.key, { upload_started_at: nowIso() });
    await ctx.hooks.beforeStep?.('put', r);
    await storage.put(scope, r.sha256, () => ctx.openContent(r), { size: r.size, contentType: r.real_mime, originalName: r.name });
    existed = 0;
    summary.uploaded++;
  }
  if (existed) summary.alreadyExisted++;
  upd(db, r.key, { state: 'uploaded', existed });
}

async function stepVerify(ctx, r) {
  const { db, storage, summary } = ctx;
  const v = await storage.verify(r.scope, r.sha256, { size: r.size });
  if (!v.ok) throw new Error(`verificacao falhou: ${v.detail}`);
  await storage.recordSource(r.scope, r.sha256, {
    kind: r.kind === 'zip-entry' ? 'zip-entry' : 'drive',
    sourceId: r.source_id,
    path: r.path,
    name: r.name,
    modifiedAt: new Date(Number(r.modified_ms)).toISOString(),
    size: r.size,
    md5: r.kind === 'file' ? r.md5 || r.md5_local : r.md5_local,
  });
  upd(db, r.key, { state: 'verified' });
  summary.verified++;
}

export const parseTimeSignature = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(s ?? '');
  return m ? { beats: Number(m[1]), value: Number(m[2]) } : null;
};
const stemDisplayName = (name) => name.replace(/\.[A-Za-z0-9]{1,5}$/, '');

/** Cria musica + versao no Firestore e publica so se os recursos obrigatorios existem (contrato, secao 7). */
async function associateSongs(ctx, pilotKeys) {
  const { db, registry, storage, cfg, summary, assumeTimeSignature, log } = ctx;
  const songs = db.prepare(`SELECT * FROM songs WHERE status NOT IN ('ready','duplicate') ORDER BY song_id`).all();
  const membersOf = db.prepare(`SELECT * FROM files WHERE song_id = ? AND is_current = 1 AND category IN ('song_stem','pad') ORDER BY name, key`);
  for (const song of songs) {
    const members = membersOf.all(song.song_id);
    if (members.length === 0) continue;
    if (pilotKeys && !members.every((m) => pilotKeys.includes(m.key))) continue;
    if (!members.every((m) => OK_STATES.has(m.state))) {
      summary.songs.waiting++;
      continue;
    }
    if (members.length > MAX_STEMS) {
      const reason = `${PENDING}mais de ${MAX_STEMS} stems (limite das regras do Firestore)`;
      db.prepare(`UPDATE songs SET pending_reason = ?, updated_at = ? WHERE song_id = ?`).run(reason, nowIso(), song.song_id);
      for (const m of members) upd(db, m.key, { reason });
      summary.songs.pending++;
      continue;
    }
    await ctx.hooks.beforeStep?.('associate', song);
    const stems = members.map((m) => ({ sha256: m.sha256, name: stemDisplayName(m.name), type: m.stem_type ?? 'fx', size: m.size, contentType: m.real_mime ?? 'application/octet-stream' }));
    const versionId = `v${crypto.createHash('sha256').update(JSON.stringify(stems.map((s) => [s.sha256, s.name, s.type]).sort())).digest('hex').slice(0, 20)}`;
    const ts = parseTimeSignature(song.time_signature ?? assumeTimeSignature);
    const reasons = songPendingReasons({ ...song, time_signature: song.time_signature ?? assumeTimeSignature }, members, { assumedTimeSignature: assumeTimeSignature });
    const existing = await registry.getSong(cfg.churchId, song.song_id);
    const now = new Date();
    const doc = {
      title: song.title || 'Sem titulo', artist: song.artist ?? '', kind: song.kind, originalKey: song.original_key ?? null, bpm: song.bpm ?? null,
      timeSignature: ts, durationSec: Math.max(0, ...members.map((m) => m.duration_sec ?? 0)) || null, tags: [], rightsClass: 'unknown',
      currentVersionId: existing?.currentVersionId ?? null, status: existing?.status === 'ready' ? 'ready' : 'pending',
      pendingReason: reasons.length ? reasons.join('; ') : null,
      source: { kind: 'drive_migration', driveFileId: song.source_id, drivePath: song.source_path },
      ...(song.time_signature || !assumeTimeSignature ? {} : { timeSignatureSource: 'assumed' }),
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    if (doc.currentVersionId == null) delete doc.currentVersionId;
    await registry.setSong(cfg.churchId, song.song_id, doc);
    await registry.createVersion(cfg.churchId, song.song_id, versionId, {
      createdAt: now, createdBy: ctx.uid, changelog: 'Migracao do acervo do Google Drive', sections: [], stems,
    });
    let ready = reasons.length === 0;
    if (ready) {
      for (const m of members) {
        const h = await storage.head(m.scope, m.sha256);
        if (!h.exists) {
          ready = false;
          reasons.push(`stem ausente no armazenamento`);
          break;
        }
      }
    }
    tx(db, () => {
      for (const m of members) upd(db, m.key, { firebase_song_id: song.song_id, firebase_version_id: versionId, state: ready ? 'published' : 'associated', reason: ready ? null : reasons.length ? `${PENDING}${reasons.join('; ')}` : null });
    });
    if (ready) {
      await registry.setSong(cfg.churchId, song.song_id, { ...doc, currentVersionId: versionId, status: 'ready', pendingReason: null, updatedAt: new Date() });
      db.prepare(`UPDATE songs SET status = 'ready', pending_reason = NULL, current_version_id = ?, time_signature = COALESCE(time_signature, ?), updated_at = ? WHERE song_id = ?`).run(versionId, assumeTimeSignature, nowIso(), song.song_id);
      summary.songs.published++;
    } else {
      db.prepare(`UPDATE songs SET pending_reason = ?, current_version_id = ?, updated_at = ? WHERE song_id = ?`).run(`${PENDING}${reasons.join('; ')}`, null, nowIso(), song.song_id);
      summary.songs.pending++;
    }
    summary.songs.associated++;
    log(`musica ${song.song_id}: ${ready ? 'publicada' : `pendente (${reasons.join('; ')})`}`);
  }
  refreshSongReasons(db, { assumedTimeSignature: assumeTimeSignature });
}

/** Zip fecha quando todas as entradas de audio terminaram (o conteudo migrou como entradas). */
export function containerStates(db) {
  const zips = db.prepare(`SELECT key, state, reason FROM files WHERE kind = 'file' AND is_current = 1 AND category = 'song_zip' AND state = 'pending'`).all();
  for (const z of zips) {
    const e = db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN state IN ('verified','associated','published') THEN 1 ELSE 0 END) ok,
        SUM(CASE WHEN state IN ('discovered','hashed','uploaded') THEN 1 ELSE 0 END) open, SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) bad
      FROM files WHERE container_key = ? AND is_current = 1 AND category = 'song_stem'`).get(z.key);
    if (e.total > 0 && e.open === 0 && e.bad === 0 && e.ok === e.total) {
      upd(db, z.key, { state: 'associated', reason: `conteudo migrado como ${e.total} entradas de audio (o pacote em si nao e enviado)` });
    }
  }
}
