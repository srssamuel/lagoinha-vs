// classify: categoria por item, musicas candidatas, inspecao de ZIPs. Nada e descartado: todo item fica com estado e motivo.
import crypto from 'node:crypto';
import path from 'node:path';
import { finishRun, nowIso, startRun, tx } from './db.mjs';
import { classifyStemName, isGenericDir, parseSongName } from './naming.mjs';
import { crcHex, listZipEntries } from './zip.mjs';
import { extOf } from './util.mjs';

const AUDIO_EXT = new Set(['wav', 'wave', 'mp3', 'm4a', 'flac', 'ogg', 'aif', 'aiff', 'wma']);
const JUNK_NAMES = new Set(['.ds_store', 'desktop.ini', 'thumbs.db']);
const CACHE_EXT = new Set(['asd', 'reapeaks']);
const PROJECT_EXT = new Set(['als', 'rpp', 'nki', 'nkc', 'cfg', 'logicx', 'ptx', 'flp', 'cpr']);
const AUX_EXT = new Set(['pdf', 'txt', 'rtf', 'jpg', 'jpeg', 'png', 'gif', 'ico', 'icns', 'xmp', 'url', 'json', 'doc', 'docx', 'md']);
const EARLY = new Set(['discovered', 'pending', 'excluded']);
const MIN_STEMS = 3; // abaixo disso a pasta de audio nao e tratada como pacote de stems
const MIN_RECOGNIZED = 0.5; // fracao de nomes de stem reconhecidos para valer como pacote de stems

export const MAX_STEMS = 64; // firestore.rules: validVersion
export const PENDING = 'pending: ';
export const EXCLUDED = 'excluded: ';

export const groupId = (groupKey) => `s${crypto.createHash('sha256').update(groupKey).digest('hex').slice(0, 24)}`;
const dirOf = (p) => p.split('/').slice(0, -1).join('/');
const isArchiveKind = (f) => ['zip', 'rar', '7z'].includes(f);
const baseNoExt = (n) => n.replace(/\.[A-Za-z0-9]{1,5}$/, '').toLowerCase();

/** Valido como pacote de stems: 3+ arquivos de audio e boa parte com nome de stem reconhecido. */
export function looksLikeStemSet(names) {
  if (names.length < MIN_STEMS) return false;
  const recognized = names.filter((n) => classifyStemName(n).source === 'name').length;
  return recognized / names.length >= MIN_RECOGNIZED;
}

/**
 * Categoria de um item que NAO e audio de pasta de musica (esse depende do agrupamento).
 * @returns {{category:string, state:string, reason:string|null, audio?:boolean}}
 */
export function categorize({ path: p, ext, realFormat, realKind, localPresent }) {
  const segs = p.split('/');
  const name = segs[segs.length - 1].toLowerCase();
  const top = segs[0];
  const e = ext ?? '';
  if (JUNK_NAMES.has(name) || name.startsWith('._')) return { category: 'auxiliary', state: 'excluded', reason: `${EXCLUDED}arquivo de sistema do SO (.DS_Store/desktop.ini/Thumbs.db/resource fork)` };
  if (!localPresent) return { category: 'unknown', state: 'pending', reason: `${PENDING}ausente em G: (so na nuvem)` };
  if (top === '03_BACKUPS_SETLISTS') return { category: 'backup', state: 'pending', reason: `${PENDING}backup de setlist: destino ainda nao previsto no contrato` };
  if (realFormat === 'unreadable') return { category: 'unknown', state: 'pending', reason: `${PENDING}cabecalho ilegivel em G:` };
  if (realFormat === 'appledouble') return { category: 'auxiliary', state: 'excluded', reason: `${EXCLUDED}metadado AppleDouble (resource fork do macOS) com extensao .${e}` };
  if (isArchiveKind(realFormat)) return { category: 'song_zip', state: 'discovered', reason: null };
  if (e === 'zip' || e === 'rar' || e === '7z') return { category: 'unknown', state: 'pending', reason: `${PENDING}extensao de compactado, mas os bytes sao ${realFormat ?? 'desconhecidos'}` };
  if (realKind === 'audio') return { category: top === '02_PADS_AMBIENTE' ? 'pad' : 'song_stem', state: 'discovered', reason: null, audio: true };
  if (AUDIO_EXT.has(e)) return { category: 'unknown', state: 'pending', reason: `${PENDING}extensao de audio, mas os bytes sao ${realFormat ?? 'desconhecidos'}` };
  if (CACHE_EXT.has(e)) return { category: 'project', state: 'excluded', reason: `${EXCLUDED}cache regeneravel do DAW (.${e}); o Drive e preservado` };
  if (PROJECT_EXT.has(e)) return { category: 'project', state: 'pending', reason: `${PENDING}projeto/configuracao de DAW fora do escopo de stems` };
  if (AUX_EXT.has(e) || ['image', 'document', 'text'].includes(realKind)) return { category: 'auxiliary', state: 'pending', reason: `${PENDING}auxiliar (capa/texto/cifra/imagem) fora do escopo de stems` };
  return { category: 'unknown', state: 'pending', reason: `${PENDING}tipo nao reconhecido (${realFormat ?? 'sem leitura'})` };
}

function songNameFor(dirPath, fallbackName) {
  // dirPath = pasta das stems, relativa a raiz do acervo; sobe ate achar um nome nao generico
  const segs = dirPath.split('/').slice(1); // sem 01_MULTITRACKS
  const chain = [];
  for (let i = segs.length - 1; i >= 0; i--) chain.push(segs[i]);
  const nonGeneric = chain.filter((s) => !isGenericDir(s));
  const names = nonGeneric.length ? nonGeneric : fallbackName ? [fallbackName] : [];
  let title = '';
  let bpm = null;
  let key = null;
  const notes = [];
  names.forEach((n, i) => {
    const r = parseSongName(n);
    if (i === 0) {
      title = r.title;
      notes.push(...r.notes);
    }
    if (bpm === null && r.bpm !== null) bpm = r.bpm;
    if (key === null && r.key) key = r.key;
  });
  return { title, bpm, key, notes };
}

export async function runClassify({ cfg, db, log = () => {}, assumeTimeSignature = null }) {
  const runId = startRun(db, 'classify');
  const now = nowIso();
  const files = db.prepare(`SELECT * FROM files WHERE kind = 'file' AND is_current = 1 AND trashed = 0`).all();

  // pastas de audio que parecem pacote de stems (3+ audios e nomes reconhecidos)
  const audioNamesByDir = new Map();
  for (const f of files) {
    if (f.real_kind === 'audio' && !f.path.startsWith('02_PADS_AMBIENTE/') && f.local_present && !f.name.startsWith('._')) {
      const d = dirOf(f.path);
      if (!audioNamesByDir.has(d)) audioNamesByDir.set(d, []);
      audioNamesByDir.get(d).push(f.name);
    }
  }
  const stemDirs = new Set([...audioNamesByDir].filter(([, names]) => looksLikeStemSet(names)).map(([d]) => d));
  const songFolderHasStems = new Set([...stemDirs].map((d) => d.split('/').slice(0, 2).join('/')));

  const upSong = db.prepare(`INSERT INTO songs (song_id, kind, group_key, church_id, title, artist, bpm, original_key, time_signature, source_id, source_path, status, pending_reason, updated_at)
    VALUES (@id, @kind, @gk, @church, @title, @artist, @bpm, @key, @ts, @sid, @spath, 'pending', @reason, @now)
    ON CONFLICT(group_key) DO UPDATE SET kind = excluded.kind, title = excluded.title, bpm = excluded.bpm, original_key = excluded.original_key,
      source_id = excluded.source_id, source_path = excluded.source_path, updated_at = excluded.updated_at,
      status = CASE WHEN songs.status IN ('ready') THEN songs.status ELSE 'pending' END`);
  const setItem = db.prepare(`UPDATE files SET category = ?, stem_type = ?, type_source = ?, song_id = ?, state = ?, reason = ?, updated_at = ? WHERE key = ?`);
  const counts = { byCategory: {}, songs: 0, pads: 0, zipEntries: 0, zipDirs: 0, zipsInspected: 0, zipsFailed: 0, stemFallback: 0, duplicateGroups: 0 };
  const bump = (c) => (counts.byCategory[c] = (counts.byCategory[c] ?? 0) + 1);
  const groups = new Map(); // group_key -> meta (+ members)

  const place = (f, cat, extra = {}) => {
    if (!EARLY.has(f.state)) return; // ja avancou no pipeline: nao mexe
    setItem.run(cat.category, extra.stemType ?? null, extra.typeSource ?? null, extra.songId ?? null, cat.state, cat.reason, now, f.key);
  };
  const addMember = (gk, name, size) => groups.get(gk).members.push({ name, size });

  tx(db, () => {
    for (const f of files) {
      const base = categorize({ path: f.path, ext: f.ext, realFormat: f.real_format, realKind: f.real_kind, localPresent: !!f.local_present });
      if (base.audio) {
        const dir = dirOf(f.path);
        if (base.category === 'pad') {
          const gk = `p:${f.drive_id}`;
          const stem = f.name.replace(/\.[A-Za-z0-9]+$/, '');
          const parsed = parseSongName(stem);
          const key = parsed.key ?? (/^[A-G](?:#|b)?m?$/.test(stem) ? stem : null);
          groups.set(gk, { id: groupId(gk), kind: 'pad', gk, title: parsed.title || stem, bpm: null, key, sid: f.drive_id, spath: f.path, members: [] });
          addMember(gk, f.name, f.size);
          place(f, base, { stemType: 'pad', typeSource: 'name', songId: groupId(gk) });
          bump('pad');
        } else if (stemDirs.has(dir)) {
          const gk = `d:${f.parent_id}`;
          if (!groups.has(gk)) {
            const nm = songNameFor(dir);
            groups.set(gk, { id: groupId(gk), kind: 'song', gk, title: nm.title, bpm: nm.bpm, key: nm.key, sid: f.parent_id, spath: dir, members: [] });
          }
          addMember(gk, f.name, f.size);
          const st = classifyStemName(f.name);
          if (st.source === 'fallback') counts.stemFallback++;
          place(f, base, { stemType: st.type, typeSource: st.source, songId: groupId(gk) });
          bump('song_stem');
        } else {
          const hasStemsNearby = songFolderHasStems.has(dir.split('/').slice(0, 2).join('/'));
          place(f, {
            category: 'auxiliary', state: 'pending',
            reason: hasStemsNearby ? `${PENDING}mix de referencia ou amostra junto das stems (nao e stem)` : `${PENDING}musica sem stems (apenas mix estereo ou poucos arquivos sem nome de stem)`,
          });
          bump('auxiliary');
        }
      } else {
        place(f, base);
        bump(base.category);
      }
    }
  });

  // ZIPs: listar o diretorio central (sem extrair) e registrar as entradas
  const zips = db
    .prepare(`SELECT * FROM files WHERE kind = 'file' AND is_current = 1 AND trashed = 0 AND category = 'song_zip' AND local_present = 1 AND real_format = 'zip'`)
    .all();
  const rarLike = db.prepare(`SELECT key FROM files WHERE kind = 'file' AND is_current = 1 AND trashed = 0 AND category = 'song_zip' AND real_format != 'zip'`).all();
  const insEntry = db.prepare(`INSERT OR IGNORE INTO files (kind, source_id, drive_id, container_key, entry_path, md5, modified_ms, last_seen_run, parent_id, name, path, ext,
      size, trashed, local_present, local_size, local_rel, church_id, scope, state, discovered_at, updated_at)
    VALUES ('zip-entry', @sid, @did, @ck, @ep, @md5, @mod, @run, @did, @name, @path, @ext, @size, 0, 1, @size, @lrel, @church, @scope, 'discovered', @now, @now)`);
  const findEntry = db.prepare(`SELECT * FROM files WHERE kind = 'zip-entry' AND source_id = ? AND md5 = ? AND modified_ms = ?`);
  const setContainer = db.prepare(`UPDATE files SET state = ?, reason = ?, updated_at = ? WHERE key = ?`);
  const failedZips = [];
  for (const z of zips) {
    const full = path.join(cfg.sourceRoot, ...z.local_rel.split('/'));
    let listing;
    try {
      listing = listZipEntries(full);
    } catch (e) {
      counts.zipsFailed++;
      failedZips.push({ key: z.key, msg: e.message });
      continue;
    }
    counts.zipsInspected++;
    const entryRows = listing.entries.filter((en) => {
      if (en.isDir) counts.zipDirs++;
      return !en.isDir;
    });
    tx(db, () => {
      // titulo do pacote: o nome do zip; se o nome do zip e so o nome de uma stem, vale a pasta onde ele esta
      const zipIsStemName = classifyStemName(z.name).source === 'name' || /^(multi-?tracks?|stems?)$/i.test(z.name.replace(/\.[^.]+$/, ''));
      const zipMeta = zipIsStemName ? songNameFor(dirOf(z.path), '') : parseSongName(z.name);
      const audioByDir = new Map();
      for (const en of entryRows) {
        if (!AUDIO_EXT.has(extOf(en.name)) || en.name.split('/').pop().startsWith('._')) continue;
        const d = en.name.split('/').slice(0, -1).join('/');
        if (!audioByDir.has(d)) audioByDir.set(d, []);
        audioByDir.get(d).push(en.name.split('/').pop());
      }
      const validDirs = new Set([...audioByDir].filter(([, names]) => looksLikeStemSet(names)).map(([d]) => d));
      for (const en of entryRows) {
        const sid = `${z.drive_id}!/${en.name}`;
        const crc = `crc32:${crcHex(en.crc32)}`;
        insEntry.run({
          sid, did: z.drive_id, ck: z.key, ep: en.name, md5: crc, mod: z.modified_ms, run: z.last_seen_run,
          name: en.name.split('/').pop(), path: `${z.path}!/${en.name}`, ext: extOf(en.name), size: en.size, lrel: z.local_rel,
          church: cfg.churchId, scope: `church:${cfg.churchId}`, now,
        });
        const row = findEntry.get(sid, crc, z.modified_ms);
        const early = EARLY.has(row.state);
        counts.zipEntries++;
        const lower = en.name.toLowerCase();
        const base = lower.split('/').pop();
        let cat;
        let extra = {};
        if (lower.startsWith('__macosx/') || JUNK_NAMES.has(base) || base.startsWith('._')) cat = { category: 'auxiliary', state: 'excluded', reason: `${EXCLUDED}arquivo de sistema do SO dentro do zip` };
        else if (en.encrypted) cat = { category: 'unknown', state: 'pending', reason: `${PENDING}entrada criptografada no zip` };
        else if (AUDIO_EXT.has(row.ext)) {
          const edir = en.name.split('/').slice(0, -1).join('/');
          if (en.method !== 0 && en.method !== 8) cat = { category: 'unknown', state: 'pending', reason: `${PENDING}metodo de compressao ${en.method} nao suportado` };
          else if (!validDirs.has(edir)) cat = { category: 'auxiliary', state: 'pending', reason: `${PENDING}audio no zip fora de pacote de stems (mix, amostra ou poucos arquivos)` };
          else {
            const gk = `z:${z.drive_id}!${edir}`;
            if (!groups.has(gk)) {
              // pacote com uma musica so: o nome do zip manda; com varias pastas de stems, cada pasta e uma musica
              const dirName = edir.split('/').pop();
              const fromDir = validDirs.size > 1 && edir && !isGenericDir(dirName) ? parseSongName(dirName) : null;
              groups.set(gk, {
                id: groupId(gk), kind: 'song', gk,
                title: fromDir?.title || zipMeta.title, bpm: fromDir?.bpm ?? zipMeta.bpm, key: fromDir?.key ?? zipMeta.key,
                sid: `${z.drive_id}!/${edir}`, spath: `${z.path}!/${edir}`, members: [],
              });
            }
            addMember(gk, en.name.split('/').pop(), en.size);
            const st = classifyStemName(base);
            if (st.source === 'fallback') counts.stemFallback++;
            cat = { category: 'song_stem', state: 'discovered', reason: null };
            extra = { stemType: st.type, typeSource: st.source, songId: groupId(gk) };
          }
        } else if (CACHE_EXT.has(row.ext)) cat = { category: 'project', state: 'excluded', reason: `${EXCLUDED}cache regeneravel do DAW (.${row.ext}) dentro do zip` };
        else if (PROJECT_EXT.has(row.ext)) cat = { category: 'project', state: 'pending', reason: `${PENDING}projeto de DAW dentro do zip, fora do escopo de stems` };
        else if (AUX_EXT.has(row.ext)) cat = { category: 'auxiliary', state: 'pending', reason: `${PENDING}auxiliar dentro do zip, fora do escopo de stems` };
        else cat = { category: 'unknown', state: 'pending', reason: `${PENDING}tipo nao reconhecido dentro do zip` };
        if (early) setItem.run(cat.category, extra.stemType ?? null, extra.typeSource ?? null, extra.songId ?? null, cat.state, cat.reason, now, row.key);
        bump(`zip-entry:${cat.category}`);
      }
      if (EARLY.has(z.state)) {
        const nAudio = entryRows.filter((en) => AUDIO_EXT.has(extOf(en.name))).length;
        setContainer.run('pending', nAudio
          ? `${PENDING}pacote compactado: o conteudo migra como entradas (${entryRows.length} entradas)`
          : `${PENDING}pacote compactado sem audio (${entryRows.length} entradas)`, now, z.key);
      }
    });
  }
  for (const r of rarLike) setContainer.run('pending', `${PENDING}compactado nao-zip: inspecao ainda nao suportada`, now, r.key);
  for (const fz of failedZips) setContainer.run('pending', `${PENDING}zip ilegivel: ${fz.msg}`, now, fz.key);

  // musicas candidatas + duplicatas + motivos
  const assumed = assumeTimeSignature ?? null;
  const dupInfo = markDuplicates(groups);
  counts.duplicateGroups = dupInfo.size;
  tx(db, () => {
    for (const g of groups.values()) {
      upSong.run({ id: g.id, kind: g.kind, gk: g.gk, church: cfg.churchId, title: (g.title || g.spath.split('/').pop() || 'Sem titulo').slice(0, 200), artist: '', bpm: g.bpm ?? null, key: g.key ?? null, ts: assumed, sid: g.sid, spath: g.spath, reason: null, now });
      const dup = dupInfo.get(g.gk);
      if (dup) {
        db.prepare(`UPDATE songs SET status = 'duplicate', pending_reason = ?, updated_at = ? WHERE group_key = ?`).run(`${PENDING}${dup}`, now, g.gk);
      }
    }
    // grupos que deixaram de existir (reclassificacao) e nao foram publicados
    db.exec(`DELETE FROM songs WHERE status != 'ready' AND song_id NOT IN (SELECT DISTINCT song_id FROM files WHERE song_id IS NOT NULL AND is_current = 1)`);
    refreshSongReasons(db, { assumedTimeSignature: assumed });
  });
  counts.songs = db.prepare(`SELECT COUNT(*) c FROM songs WHERE kind = 'song'`).get().c;
  counts.pads = db.prepare(`SELECT COUNT(*) c FROM songs WHERE kind = 'pad'`).get().c;
  counts.songsDuplicate = db.prepare(`SELECT COUNT(*) c FROM songs WHERE status = 'duplicate'`).get().c;
  counts.byState = Object.fromEntries(db.prepare(`SELECT state, COUNT(*) c FROM files WHERE is_current = 1 AND kind = 'file' GROUP BY 1`).all().map((r) => [r.state, r.c]));
  counts.songsWithBpm = db.prepare(`SELECT COUNT(*) c FROM songs WHERE kind = 'song' AND status != 'duplicate' AND bpm IS NOT NULL`).get().c;
  counts.songsWithKey = db.prepare(`SELECT COUNT(*) c FROM songs WHERE kind = 'song' AND status != 'duplicate' AND original_key IS NOT NULL`).get().c;
  counts.songsWithoutBandStem = db.prepare(`SELECT COUNT(*) c FROM songs WHERE kind = 'song' AND pending_reason LIKE '%sem stem de banda%'`).get().c;
  counts.stemsByTypeSource = Object.fromEntries(db.prepare(`SELECT COALESCE(type_source,'-') s, COUNT(*) c FROM files WHERE is_current = 1 AND category IN ('song_stem','pad') GROUP BY 1`).all().map((r) => [r.s, r.c]));
  finishRun(db, runId, counts);
  return counts;
}

/**
 * Grupos que repetem o conteudo de outro grupo viram 'duplicate' (nao criam musica no banco; os bytes ja deduplicam por sha256).
 * 1) copia identica: todos os (nome, tamanho) do grupo existem em grupos ja aceitos;
 * 2) mesmo conjunto de nomes de stem na mesma pasta de musica, com tamanhos diferentes (outro formato/codificacao).
 * @returns {Map<string,string>} group_key -> motivo (sem prefixo)
 */
export function markDuplicates(groups) {
  const dup = new Map();
  const prio = (g) => (g.kind === 'pad' ? 0 : g.gk.startsWith('d:') ? 1 : 2);
  const bytes = (g) => g.members.reduce((s, m) => s + m.size, 0); // em empate de pasta, o maior (menos comprimido) e o canonico
  const ordered = [...groups.values()].sort((a, b) => prio(a) - prio(b) || bytes(b) - bytes(a) || b.members.length - a.members.length || a.gk.localeCompare(b.gk));
  const exact = new Map(); // "nome|tamanho" -> gk aceito
  const accepted = [];
  const topOf = (g) => g.spath.split('!')[0].split('/').slice(0, 2).join('/');
  for (const g of ordered) {
    const tuples = g.members.map((m) => `${baseNoExt(m.name)}|${m.size}`);
    if (g.kind === 'song' && tuples.length >= MIN_STEMS && tuples.every((t) => exact.has(t))) {
      dup.set(g.gk, 'duplicata: copia identica (mesmos nomes e tamanhos) de stems ja representadas em outro grupo; decidir qual manter');
      continue;
    }
    const names = new Set(g.members.map((m) => baseNoExt(m.name)));
    const twin = g.kind === 'song' && names.size >= MIN_STEMS
      ? accepted.find((a) => a.kind === 'song' && topOf(a) === topOf(g) && [...names].every((n) => a.names.has(n)))
      : null;
    if (twin) {
      dup.set(g.gk, 'duplicata provavel: mesmos nomes de stem em outro formato/codificacao na mesma pasta de musica; decidir qual manter');
      for (const t of tuples) if (!exact.has(t)) exact.set(t, g.gk);
      continue;
    }
    accepted.push({ kind: g.kind, spath: g.spath, names });
    for (const t of tuples) if (!exact.has(t)) exact.set(t, g.gk);
  }
  return dup;
}

/** Por que uma musica ainda nao pode ser publicada (contrato, secao 7). Vazio = pronta do ponto de vista dos metadados. */
export function songPendingReasons(song, stems, { assumedTimeSignature = null } = {}) {
  const r = [];
  if (song.kind === 'song') {
    if (song.bpm == null) r.push('sem bpm');
    if (!song.time_signature && !assumedTimeSignature) r.push('sem compasso');
  }
  const band = stems.filter((s) => s.stem_type !== 'click' && s.stem_type !== 'guide');
  if (band.length === 0) r.push('sem stem de banda');
  if (stems.length > MAX_STEMS) r.push(`mais de ${MAX_STEMS} stems (limite das regras do Firestore)`);
  return r;
}

export function refreshSongReasons(db, opts = {}) {
  const now = nowIso();
  const songs = db.prepare(`SELECT * FROM songs`).all();
  const stemsOf = db.prepare(`SELECT key, stem_type, state, reason FROM files WHERE song_id = ? AND is_current = 1 AND category IN ('song_stem','pad')`);
  const upS = db.prepare(`UPDATE songs SET pending_reason = ?, updated_at = ? WHERE song_id = ? AND status NOT IN ('ready')`);
  const upF = db.prepare(`UPDATE files SET reason = ?, updated_at = ? WHERE key = ? AND state IN ('discovered','hashed','uploaded','verified','associated')`);
  for (const s of songs) {
    if (s.status === 'ready') continue;
    const stems = stemsOf.all(s.song_id);
    const text = s.status === 'duplicate' ? s.pending_reason : (() => {
      const reasons = songPendingReasons(s, stems, opts);
      return reasons.length ? `${PENDING}${reasons.join('; ')}` : null;
    })();
    upS.run(text, now, s.song_id);
    for (const st of stems) upF.run(text, now, st.key);
  }
}
