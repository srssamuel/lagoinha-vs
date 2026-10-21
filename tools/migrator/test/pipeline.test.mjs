import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { runClassify } from '../src/classify.mjs';
import { runInventory } from '../src/inventory.mjs';
import { MigrationAborted, pickPilot, runMigrate } from '../src/migrate.mjs';
import { runReconcile } from '../src/reconcile.mjs';
import { LocalRegistry } from '../src/targets/registry-local.mjs';
import { LocalStorage } from '../src/targets/storage-local.mjs';
import { buildZip, makeFixture, makeWav, md5, standardFiles } from './helpers.mjs';

async function prepare(files = standardFiles(), name = 'p') {
  const fx = makeFixture(files, { name });
  const inv = await runInventory({ cfg: fx.cfg, db: fx.db });
  const cls = await runClassify({ cfg: fx.cfg, db: fx.db });
  const targets = () => ({ storage: new LocalStorage(fx.cfg.r2LocalDir), registry: new LocalRegistry(fx.cfg.firestoreLocalDir) });
  return { fx, inv, cls, targets };
}
const q = (db, sql, ...a) => db.prepare(sql).all(...a);
const one = (db, sql, ...a) => db.prepare(sql).get(...a);
const run = (ctx, extra = {}) => runMigrate({ cfg: ctx.fx.cfg, db: ctx.fx.db, ...ctx.targets(), ...extra });

test('inventory: totais, cruzamento com o disco, formato real e divergencias', async () => {
  const { fx, inv } = await prepare();
  try {
    const t = inv.totals;
    const files = standardFiles();
    assert.equal(t.cloud.filesTotal, files.length);
    assert.equal(t.cloud.filesTrashed, 1);
    assert.equal(t.cloud.filesActive, files.length - 1);
    assert.equal(t.disk.cloudOnlyFiles, 0);
    assert.equal(t.disk.localOnlyFiles, 0);
    assert.equal(t.cloud.bytesTotal, files.reduce((s, f) => s + f.data.length, 0));
    const fmt = Object.fromEntries(t.byRealFormat.map((r) => [r.f, r.c]));
    assert.equal(fmt.wav, 10);
    assert.ok(fmt.zip >= 2 && fmt.mp3 === 1 && fmt.gzip === 1);
    assert.equal(t.archives.withoutExtension, 1, 'zip sem extensao detectado pelos bytes');
    assert.ok(t.mismatches.byKind.mime >= 1, 'asd com mime msword');
    assert.equal(t.audio.byRealFormat, 11);
    // reexecucao idempotente: nenhuma linha nova
    const before = one(fx.db, 'SELECT COUNT(*) c FROM files').c;
    const again = await runInventory({ cfg: fx.cfg, db: fx.db });
    assert.equal(one(fx.db, 'SELECT COUNT(*) c FROM files').c, before);
    assert.equal(again.counters.newFiles, 0);
    assert.equal(again.counters.unchanged, files.length);
  } finally {
    fx.cleanup();
  }
});

test('inventory: mesmo id com md5 novo vira nova linha de versao; a antiga fica preservada', async () => {
  const { fx } = await prepare();
  try {
    const target = one(fx.db, `SELECT * FROM files WHERE name = 'LEIAME.txt'`);
    const novo = Buffer.from('conteudo novo do leiame');
    fs.writeFileSync(path.join(fx.srcRoot, 'LEIAME.txt'), novo);
    const meta = new DatabaseSync(fx.dbPath);
    meta.prepare(`UPDATE items SET proto = ?, file_size = ?, modified_date = 9999 WHERE id = ?`).run(Buffer.concat([Buffer.from([0xda, 0x03, 0x20]), Buffer.from(md5(novo))]), novo.length, target.drive_id);
    meta.close();
    const r = await runInventory({ cfg: fx.cfg, db: fx.db });
    assert.equal(r.counters.newVersions, 1);
    const rows = q(fx.db, `SELECT is_current, md5 FROM files WHERE drive_id = ? ORDER BY key`, target.drive_id);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((x) => x.is_current), [0, 1]);
    assert.equal(rows[1].md5, md5(novo));
  } finally {
    fx.cleanup();
  }
});

test('classify: categorias, estados com motivo, musicas candidatas e mapeamento de stems', async () => {
  const { fx, cls } = await prepare();
  try {
    const st = (name) => one(fx.db, `SELECT * FROM files WHERE name = ? AND is_current = 1`, name);
    assert.equal(st('x.wav.asd').state, 'excluded');
    assert.match(st('x.wav.asd').reason, /^excluded: /);
    assert.equal(st('Cancao Teste.als').category, 'project');
    assert.equal(st('Album.jpg').category, 'auxiliary');
    assert.equal(st('set.txt').category, 'backup');
    assert.equal(st('velho.wav').state, 'excluded');
    assert.equal(st('Pacote_Teste_100BPM_Tom_G.zip').category, 'song_zip');
    assert.equal(st('Outro Pacote Sem Extensao').category, 'song_zip');
    assert.equal(st('Pad_Teste_Tom_G.mp3').category, 'pad');
    assert.equal(one(fx.db, `SELECT COUNT(*) c FROM files WHERE reason IS NULL AND state IN ('pending','excluded') AND is_current = 1`).c, 0, 'nada sem motivo');

    const songs = q(fx.db, `SELECT * FROM songs WHERE kind = 'song' ORDER BY title`);
    assert.equal(songs.length, 4);
    const byTitle = Object.fromEntries(songs.map((s) => [s.title, s]));
    assert.equal(byTitle['Cancao Teste'].bpm, 72);
    assert.equal(byTitle['Cancao Teste'].original_key, 'D');
    assert.equal(byTitle['Pacote Teste'].bpm, 100);
    assert.match(byTitle['Sem Metadados'].pending_reason, /sem bpm/);
    assert.match(byTitle['Sem Metadados'].pending_reason, /sem compasso/);
    const types = Object.fromEntries(q(fx.db, `SELECT name, stem_type FROM files WHERE song_id = ?`, byTitle['Cancao Teste'].song_id).map((r) => [r.name, r.stem_type]));
    assert.deepEqual(types, { 'Click.wav': 'click', 'Guide.wav': 'guide', 'Drums.wav': 'drums', 'Bass.wav': 'bass', 'Keys.wav': 'keys' });
    // zip: entradas de audio viram stems com source_id driveId!/caminho; dir e pdf tratados
    const entries = q(fx.db, `SELECT source_id, category, name FROM files WHERE kind = 'zip-entry' AND container_key = ?`, st('Pacote_Teste_100BPM_Tom_G.zip').key);
    assert.equal(entries.length, 4);
    assert.ok(entries.every((e) => e.source_id.startsWith(`${st('Pacote_Teste_100BPM_Tom_G.zip').drive_id}!/Pacote/`)));
    assert.equal(entries.filter((e) => e.category === 'song_stem').length, 3);
    assert.equal(cls.zipDirs, 1);
    assert.equal(st('Pacote_Teste_100BPM_Tom_G.zip').state, 'pending');
  } finally {
    fx.cleanup();
  }
});

test('migrate completo (local): publica so com bpm+compasso+stem de banda; o resto fica pendente com motivo', async () => {
  const ctx = await prepare();
  const { fx } = ctx;
  try {
    const res = await run(ctx, { assumeTimeSignature: '4/4' });
    assert.equal(res.failed, 0);
    assert.equal(res.aborted, false);
    const songs = Object.fromEntries(q(fx.db, `SELECT title, status, pending_reason FROM songs`).map((s) => [s.title, s]));
    assert.equal(songs['Cancao Teste'].status, 'ready');
    assert.equal(songs['Pacote Teste'].status, 'ready');
    assert.equal(one(fx.db, `SELECT status FROM songs WHERE kind = 'pad'`).status, 'ready');
    assert.equal(songs['Sem Metadados'].status, 'pending');
    assert.match(songs['Sem Metadados'].pending_reason, /sem bpm/);
    // Firestore local: documentos conforme a secao 7 do contrato
    const reg = new LocalRegistry(fx.cfg.firestoreLocalDir);
    const row = one(fx.db, `SELECT * FROM songs WHERE title = 'Cancao Teste'`);
    const doc = await reg.getSong('igreja-teste', row.song_id);
    assert.equal(doc.status, 'ready');
    assert.ok(doc.currentVersionId);
    assert.deepEqual(doc.timeSignature, { beats: 4, value: 4 });
    assert.equal(doc.rightsClass, 'unknown');
    assert.equal(doc.source.kind, 'drive_migration');
    assert.equal(doc.durationSec, 1);
    const ver = await reg.getVersion('igreja-teste', row.song_id, doc.currentVersionId);
    assert.deepEqual(Object.keys(ver).sort(), ['changelog', 'createdAt', 'createdBy', 'sections', 'stems']);
    assert.equal(ver.stems.length, 5);
    assert.ok(ver.stems.every((s) => /^[0-9a-f]{64}$/.test(s.sha256) && s.contentType === 'audio/wav'));
    const pend = one(fx.db, `SELECT * FROM songs WHERE title = 'Sem Metadados'`);
    const pdoc = await reg.getSong('igreja-teste', pend.song_id);
    assert.equal(pdoc.status, 'pending');
    assert.match(pdoc.pendingReason, /sem bpm/);
    assert.equal(pdoc.currentVersionId, undefined, 'currentVersionId so depois de conferir os stems');
    // chave do R2 = churches/{igreja}/blobs/{sha256}
    const f = one(fx.db, `SELECT * FROM files WHERE name = 'Bass.wav' AND song_id = ?`, row.song_id);
    assert.equal(f.r2_key, `churches/igreja-teste/blobs/${f.sha256}`);
    assert.ok(fs.existsSync(path.join(fx.cfg.r2LocalDir, ...f.r2_key.split('/'))));
    assert.equal(f.state, 'published');
    // origem registrada (entrada de zip com driveId!/caminho)
    const e = one(fx.db, `SELECT * FROM files WHERE kind = 'zip-entry' AND name = 'Bass.wav' AND song_id IS NOT NULL AND source_id LIKE '%!/Pacote/%'`);
    const d1 = JSON.parse(fs.readFileSync(new LocalStorage(fx.cfg.r2LocalDir).registryPath(e.scope, e.sha256), 'utf8'));
    assert.equal(d1.sources[0].kind, 'zip-entry');
    assert.equal(d1.sources[0].sourceId, e.source_id);
    assert.equal(one(fx.db, `SELECT state FROM files WHERE name = 'Pacote_Teste_100BPM_Tom_G.zip'`).state, 'associated');
    // reconcile fecha
    const rec = runReconcile({ cfg: fx.cfg, db: fx.db, docDir: path.join(fx.tmp, 'docs'), date: '2026-01-01' });
    assert.equal(rec.ok, true, JSON.stringify(rec.summary.checks));
    assert.equal(rec.summary.sum.files, standardFiles().length);
    assert.equal(rec.summary.sum.bytes, standardFiles().reduce((s, x) => s + x.data.length, 0));
    const md = fs.readFileSync(rec.docPath, 'utf8');
    assert.ok(!md.includes('Cancao'), 'documento agregado sem nomes');
  } finally {
    fx.cleanup();
  }
});

test('sem compasso assumido a musica nunca e publicada (nao inventa dado)', async () => {
  const ctx = await prepare();
  try {
    await run(ctx);
    assert.equal(one(ctx.fx.db, `SELECT COUNT(*) c FROM songs WHERE status = 'ready' AND kind = 'song'`).c, 0);
    assert.match(one(ctx.fx.db, `SELECT pending_reason FROM songs WHERE title = 'Cancao Teste'`).pending_reason, /sem compasso/);
    assert.equal(one(ctx.fx.db, `SELECT status FROM songs WHERE kind = 'pad'`).status, 'ready', 'pad nao exige bpm/compasso');
  } finally {
    ctx.fx.cleanup();
  }
});

test('interrupcao e retomada: segunda execucao continua sem refazer nem duplicar', async () => {
  const ctx = await prepare();
  const { fx } = ctx;
  try {
    const storage1 = new LocalStorage(fx.cfg.r2LocalDir);
    const registry = new LocalRegistry(fx.cfg.firestoreLocalDir);
    const r1 = await runMigrate({ cfg: fx.cfg, db: fx.db, storage: storage1, registry, abortAfter: 3, assumeTimeSignature: '4/4' });
    assert.equal(r1.aborted, true);
    assert.equal(r1.processed, 3);
    const done1 = one(fx.db, `SELECT COUNT(*) c FROM files WHERE state IN ('verified','associated','published')`).c;
    assert.equal(done1, 3);
    const rowsBefore = one(fx.db, 'SELECT COUNT(*) c FROM files').c;

    const storage2 = new LocalStorage(fx.cfg.r2LocalDir);
    const r2 = await runMigrate({ cfg: fx.cfg, db: fx.db, storage: storage2, registry, assumeTimeSignature: '4/4' });
    assert.equal(r2.aborted, false);
    assert.equal(one(fx.db, 'SELECT COUNT(*) c FROM files').c, rowsBefore, 'nenhuma linha nova');
    const uniqueBlobs = one(fx.db, `SELECT COUNT(DISTINCT sha256) c FROM files WHERE sha256 IS NOT NULL`).c;
    assert.equal(storage1.stats.puts + storage2.stats.puts, uniqueBlobs, 'cada blob enviado exatamente uma vez no total');
    assert.equal(r2.processed + r1.processed, one(fx.db, `SELECT COUNT(*) c FROM files WHERE sha256 IS NOT NULL`).c);
    assert.equal(one(fx.db, `SELECT COUNT(*) c FROM files WHERE existed = 1`).c, 0, 'nada contado como ja existente por causa da retomada');
    const blobs = fs.readdirSync(path.join(fx.cfg.r2LocalDir, 'churches', 'igreja-teste', 'blobs'));
    assert.equal(blobs.length, uniqueBlobs);

    // terceira execucao: nada a fazer
    const storage3 = new LocalStorage(fx.cfg.r2LocalDir);
    const r3 = await runMigrate({ cfg: fx.cfg, db: fx.db, storage: storage3, registry, assumeTimeSignature: '4/4' });
    assert.equal(r3.processed, 0);
    assert.equal(storage3.stats.puts, 0);
    const rec = runReconcile({ cfg: fx.cfg, db: fx.db, docDir: path.join(fx.tmp, 'docs'), date: '2026-01-01' });
    assert.equal(rec.ok, true);
  } finally {
    fx.cleanup();
  }
});

test('envio paralelo: mesmo resultado do sequencial; interrupcao com itens em voo continua retomavel', async () => {
  const seq = await prepare(standardFiles(), 'seq');
  const par = await prepare(standardFiles(), 'par');
  try {
    await run(seq, { assumeTimeSignature: '4/4' });
    const r1 = await run(par, { assumeTimeSignature: '4/4', concurrency: 4, abortAfter: 3 });
    assert.equal(r1.aborted, true);
    assert.ok(r1.processed >= 3 && r1.processed < 3 + 4, `processados ${r1.processed}`);
    const r2 = await run(par, { assumeTimeSignature: '4/4', concurrency: 4 });
    assert.equal(r2.failed, 0);
    const states = (ctx) => q(ctx.fx.db, `SELECT name, state, sha256 FROM files ORDER BY key`);
    assert.deepEqual(states(par), states(seq));
    const songs = (ctx) => q(ctx.fx.db, `SELECT title, status, current_version_id FROM songs ORDER BY title`);
    assert.deepEqual(songs(par), songs(seq));
  } finally {
    seq.fx.cleanup();
    par.fx.cleanup();
  }
});

test('envio paralelo: erro fatal (token) para todos os trabalhadores e propaga', async () => {
  const ctx = await prepare();
  try {
    const { storage, registry } = ctx.targets();
    let calls = 0;
    const put = storage.put.bind(storage);
    storage.put = async (...a) => {
      calls++;
      if (calls === 2) throw Object.assign(new Error('401 nao autenticado'), { fatal: true });
      return put(...a);
    };
    await assert.rejects(runMigrate({ cfg: ctx.fx.cfg, db: ctx.fx.db, storage, registry, concurrency: 3 }), /401/);
    assert.equal(one(ctx.fx.db, `SELECT COUNT(*) c FROM files WHERE state = 'failed'`).c, 0, 'fatal nao marca item como falho');
  } finally {
    ctx.fx.cleanup();
  }
});

test('queda no meio do upload (depois do PUT, antes do estado): retomada nao reenvia nem marca como ja existente', async () => {
  const ctx = await prepare();
  const { fx } = ctx;
  try {
    const storage = new LocalStorage(fx.cfg.r2LocalDir);
    const registry = new LocalRegistry(fx.cfg.firestoreLocalDir);
    const realPut = storage.put.bind(storage);
    let crashed = false;
    storage.put = async (...a) => {
      const r = await realPut(...a);
      if (!crashed) {
        crashed = true;
        throw new MigrationAborted('queda simulada apos o PUT');
      }
      return r;
    };
    const r1 = await runMigrate({ cfg: fx.cfg, db: fx.db, storage, registry });
    assert.equal(r1.aborted, true);
    const stuck = one(fx.db, `SELECT * FROM files WHERE state = 'hashed' AND upload_started_at IS NOT NULL`);
    assert.ok(stuck, 'item preso entre PUT e estado');
    const storage2 = new LocalStorage(fx.cfg.r2LocalDir);
    await runMigrate({ cfg: fx.cfg, db: fx.db, storage: storage2, registry });
    const again = one(fx.db, `SELECT * FROM files WHERE key = ?`, stuck.key);
    assert.equal(again.existed, 0);
    assert.equal(again.state === 'verified' || again.state === 'associated' || again.state === 'published', true);
    assert.equal(storage.stats.puts + storage2.stats.puts, one(fx.db, `SELECT COUNT(DISTINCT sha256) c FROM files WHERE sha256 IS NOT NULL`).c);
  } finally {
    fx.cleanup();
  }
});

test('md5 dos bytes diferente do md5 do Drive: item falha com motivo e o restante segue', async () => {
  const ctx = await prepare();
  const { fx } = ctx;
  try {
    const victim = one(fx.db, `SELECT * FROM files WHERE name = 'Drums.wav' AND path LIKE '%Cancao%'`);
    const full = path.join(fx.srcRoot, ...victim.local_rel.split('/'));
    const b = fs.readFileSync(full);
    b[100] ^= 0xff; // mesmo tamanho, conteudo diferente
    fs.writeFileSync(full, b);
    const res = await run(ctx, { assumeTimeSignature: '4/4' });
    assert.equal(res.failed, 1);
    const row = one(fx.db, `SELECT state, reason FROM files WHERE key = ?`, victim.key);
    assert.equal(row.state, 'failed');
    assert.match(row.reason, /md5/);
    assert.equal(one(fx.db, `SELECT status FROM songs WHERE title = 'Cancao Teste'`).status, 'pending', 'musica com stem falho nao e publicada');
    const rec = runReconcile({ cfg: fx.cfg, db: fx.db, docDir: path.join(fx.tmp, 'docs'), date: '2026-01-01' });
    assert.equal(rec.ok, true);
    assert.equal(rec.summary.buckets.failed.files, 1);
  } finally {
    fx.cleanup();
  }
});

test('piloto: 1 musica em pasta, 1 zip, 1 pad e 1 caso especial; retomavel e sem tocar no resto', async () => {
  const ctx = await prepare();
  const { fx } = ctx;
  try {
    const p = pickPilot(fx.db);
    assert.deepEqual(Object.keys(p.picks), ['song_folder', 'zip', 'pad', 'special:zip_sem_extensao']);
    const res = await run(ctx, { pilot: true, assumeTimeSignature: '4/4' });
    assert.equal(res.failed, 0);
    const pilotTitles = q(fx.db, `SELECT title, status FROM songs WHERE status = 'ready' ORDER BY title`).map((s) => s.title);
    assert.equal(pilotTitles.length, 3, 'musica em pasta, zip e pad publicados');
    assert.equal(one(fx.db, `SELECT COUNT(*) c FROM files WHERE state = 'discovered' AND category = 'song_stem'`).c > 0, true, 'resto do acervo intocado');
    assert.equal(one(fx.db, `SELECT status FROM songs WHERE title = 'Sem Metadados'`).status, 'pending');
    // reexecucao do piloto: nada novo
    const again = await run(ctx, { pilot: true, assumeTimeSignature: '4/4' });
    assert.equal(again.processed, 0);
  } finally {
    fx.cleanup();
  }
});

test('piloto sem zip sem extensao: o caso especial e o .asd com mime divergente (forcado, com motivo)', async () => {
  const files = standardFiles().filter((f) => !f.path.endsWith('Sem Extensao'));
  const ctx = await prepare(files, 'asd');
  const { fx } = ctx;
  try {
    const p = pickPilot(fx.db);
    assert.ok(p.picks['special:asd_mime_divergente']);
    await run(ctx, { pilot: true, assumeTimeSignature: '4/4' });
    const asd = one(fx.db, `SELECT * FROM files WHERE name = 'x.wav.asd'`);
    assert.equal(asd.state, 'verified');
    assert.equal(asd.mime_source, 'application/msword');
    assert.match(asd.reason, /pilot/);
    assert.equal(asd.real_format, 'binary');
  } finally {
    fx.cleanup();
  }
});

test('reconcile falha quando a soma nao bate (item sumiu do manifesto)', async () => {
  const ctx = await prepare();
  const { fx } = ctx;
  try {
    const k = one(fx.db, `SELECT key FROM files WHERE name = 'set.txt'`).key;
    fx.db.prepare('DELETE FROM files WHERE key = ?').run(k);
    const rec = runReconcile({ cfg: fx.cfg, db: fx.db, docDir: path.join(fx.tmp, 'docs'), date: '2026-01-01' });
    assert.equal(rec.ok, false);
    assert.equal(rec.summary.checks.filesSumMatchesInventory, false);
  } finally {
    fx.cleanup();
  }
});

test('stems por zip acima de 64: musica fica pendente com motivo (limite das regras)', async () => {
  const many = Array.from({ length: 66 }, (_, i) => ({ path: `01_MULTITRACKS/Gigante-Gigante-C-80.00bpm/MultiTracks/Keys ${i}.wav`, data: makeWav(1, 8000, 200 + i), mime: 'audio/wav' }));
  const ctx = await prepare(many, 'big');
  try {
    await run(ctx, { assumeTimeSignature: '4/4' });
    const s = one(ctx.fx.db, `SELECT * FROM songs`);
    assert.equal(s.status, 'pending');
    assert.match(s.pending_reason, /64/);
  } finally {
    ctx.fx.cleanup();
  }
});

test('duplicatas: zip com as mesmas stems da pasta e copia em outro formato nao criam segunda musica; os bytes deduplicam', async () => {
  const stems = ['Click', 'Guide', 'Drums', 'Bass', 'Keys'].map((n, i) => ({ n: `${n}.wav`, d: makeWav(1, 8000, 300 + i) }));
  const base = '01_MULTITRACKS/Louvor X-Louvor X-D-80.00bpm';
  const files = [
    ...stems.map((s) => ({ path: `${base}/MultiTracks/${s.n}`, data: s.d, mime: 'audio/wav' })),
    { path: `${base}/Bass.zip`, data: buildZip(stems.map((s) => ({ name: s.n, data: s.d }))), mime: 'application/zip' },
    ...stems.map((s, i) => ({ path: `${base}/Multitracks em WAV/${s.n}`, data: makeWav(2, 8000, 400 + i), mime: 'audio/wav' })),
  ];
  const ctx = await prepare(files, 'dup');
  const { fx } = ctx;
  try {
    const st = Object.fromEntries(q(fx.db, `SELECT group_key gk, status, pending_reason r FROM songs`).map((s) => [s.gk.slice(0, 2) + s.status, s.r]));
    assert.deepEqual(Object.keys(st).sort(), ['d:duplicate', 'd:pending', 'z:duplicate']);
    assert.match(st['z:duplicate'], /copia identica/);
    assert.match(st['d:duplicate'], /outro formato/);
    const res = await run(ctx, { assumeTimeSignature: '4/4' });
    assert.equal(res.failed, 0);
    const uniq = one(fx.db, `SELECT COUNT(DISTINCT sha256) c FROM files WHERE sha256 IS NOT NULL`).c;
    assert.equal(uniq, 10, '5 stems + 5 da copia em outro formato; a copia identica nao gera blob novo');
    assert.equal(res.storageStats.puts, 10);
    assert.equal(one(fx.db, `SELECT COUNT(*) c FROM files WHERE existed = 1`).c, 5, 'as 5 entradas do zip ja existiam no destino');
    assert.equal(fs.readdirSync(path.join(fx.cfg.firestoreLocalDir, 'churches', 'igreja-teste', 'library')).filter((x) => x.endsWith('.json')).length, 1, 'uma unica musica no banco');
    assert.equal(one(fx.db, `SELECT COUNT(*) c FROM files WHERE state = 'published'`).c, 5);
    const rec = runReconcile({ cfg: fx.cfg, db: fx.db, docDir: path.join(fx.tmp, 'docs'), date: '2026-01-01' });
    assert.equal(rec.ok, true);
    assert.equal(rec.summary.zipEntries.buckets.existingVerified.files, 5);
  } finally {
    fx.cleanup();
  }
});