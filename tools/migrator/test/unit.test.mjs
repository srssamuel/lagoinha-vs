import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import zlib from 'node:zlib';
import { categorize } from '../src/classify.mjs';
import { hashStream, wavDurationSec } from '../src/hash.mjs';
import { describeMismatch, detectFormat } from '../src/magic.mjs';
import { classifyStemName, parseSongName } from '../src/naming.mjs';
import { LocalStorage } from '../src/targets/storage-local.mjs';
import { WorkerStorage } from '../src/targets/storage-worker.mjs';
import { toFields, fromFields } from '../src/targets/registry-firestore.mjs';
import { r2Key, routeScope } from '../src/targets/keys.mjs';
import { listZipEntries, openZipEntryStream } from '../src/zip.mjs';
import { buildZip, makeMp3, makeWav, sha256 } from './helpers.mjs';

const B = (...a) => Buffer.from(a);
const pad = (b, n = 64) => Buffer.concat([b, Buffer.alloc(Math.max(0, n - b.length))]);

test('detectFormat: formatos reais pelos bytes iniciais', () => {
  const cases = [
    ['wav', makeWav(1)], ['mp3', makeMp3()], ['mp3', pad(B(0xff, 0xfb, 0x90, 0x00))],
    ['flac', pad(Buffer.from('fLaC'))], ['ogg', pad(Buffer.from('OggS'))],
    ['aiff', pad(Buffer.concat([Buffer.from('FORM'), B(0, 0, 0, 8), Buffer.from('AIFF')]))],
    ['m4a', pad(Buffer.concat([B(0, 0, 0, 0x20), Buffer.from('ftypM4A ')]))],
    ['mp4', pad(Buffer.concat([B(0, 0, 0, 0x20), Buffer.from('ftypisom')]))],
    ['zip', pad(B(0x50, 0x4b, 3, 4))], ['pdf', pad(Buffer.from('%PDF-1.7'))], ['gzip', pad(B(0x1f, 0x8b, 8))],
    ['png', pad(B(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))], ['jpeg', pad(B(0xff, 0xd8, 0xff, 0xe0))],
    ['ico', pad(B(0, 0, 1, 0))], ['text', Buffer.from('so texto simples\r\n')], ['binary', Buffer.from([0, 1, 2, 3, 250, 251, 0, 0])],
    ['empty', Buffer.alloc(0)], ['rar', pad(Buffer.from('Rar!\x1a\x07\x01\x00'))],
  ];
  for (const [fmt, buf] of cases) assert.equal(detectFormat(buf).format, fmt, `esperado ${fmt}`);
});

test('describeMismatch: mime/extensao divergentes sao detectados e os coerentes nao', () => {
  assert.deepEqual(describeMismatch({ ext: 'wav', mimeSource: 'audio/wav', real: detectFormat(makeWav(1)) }), []);
  assert.ok(describeMismatch({ ext: 'asd', mimeSource: 'application/msword', real: detectFormat(B(0, 1, 2, 3, 0, 0, 0, 0)) }).some((t) => t.startsWith('mime:')));
  assert.ok(describeMismatch({ ext: 'wav', mimeSource: 'audio/wav', real: detectFormat(makeMp3()) }).some((t) => t.startsWith('ext:wav')));
  assert.ok(describeMismatch({ ext: '', mimeSource: 'application/octet-stream', real: detectFormat(pad(B(0x50, 0x4b, 3, 4))) }).some((t) => t.startsWith('sem-extensao')));
});

test('parseSongName: bpm, tom e titulo quando existem; vazio quando nao', () => {
  assert.deepEqual(pick(parseSongName('Algo Novo-Algo Novo-D-60.00bpm')), { title: 'Algo Novo', bpm: 60, key: 'D' });
  assert.deepEqual(pick(parseSongName('A_Casa_E_Sua_130BPM_Tom_G.zip')), { title: 'A Casa E Sua', bpm: 130, key: 'G' });
  assert.deepEqual(pick(parseSongName('Rei do meu Coração - G - 68 BPM')), { title: 'Rei do meu Coração', bpm: 68, key: 'G' });
  assert.deepEqual(pick(parseSongName('Clamo Jesus-E Clamo Jesus-E-74.00bpm')), { title: 'Clamo Jesus', bpm: 74, key: 'E' });
  assert.deepEqual(pick(parseSongName('A Benção')), { title: 'A Benção', bpm: null, key: null });
  assert.deepEqual(pick(parseSongName('01 - Livre')), { title: 'Livre', bpm: null, key: null });
  assert.deepEqual(pick(parseSongName('Multitrack - Tudo é Perda - Felipe Rodrigues - C# - 126 bpm')), { title: 'Tudo é Perda', bpm: 126, key: 'C#' });
  assert.equal(parseSongName('Qualquer Coisa 5 bpm').bpm, null, 'bpm fora de 40-240 e ignorado');
  assert.deepEqual(pick(parseSongName('Festa - Key A - 132bpm')), { title: 'Festa', bpm: 132, key: 'A' });
  assert.deepEqual(pick(parseSongName('Dançar na chuva - 154 Bpm')), { title: 'Dançar na chuva', bpm: 154, key: null });
  assert.deepEqual(pick(parseSongName('Aline Barros - Vou Te Alegrar')), { title: 'Aline Barros - Vou Te Alegrar', bpm: null, key: null });
  assert.deepEqual(pick(parseSongName('Diz (Gabriela Rocha) - MultiTracks')), { title: 'Diz (Gabriela Rocha)', bpm: null, key: null });
  assert.deepEqual(pick(parseSongName("God_I'm_Just_Grateful_Live_Elevation_Worship_D_72bpm")), { title: "God I'm Just Grateful Live Elevation Worship", bpm: 72, key: 'D' });
  assert.deepEqual(pick(parseSongName('MULTITRACKS ALIANCA DE AMOR BPM 100 F')), { title: 'ALIANCA DE AMOR', bpm: 100, key: 'F' });
});
const pick = ({ title, bpm, key }) => ({ title, bpm, key });

test('classifyStemName: mapeia para StemType do app e marca o que e chute', () => {
  const t = (n) => classifyStemName(n);
  assert.equal(t('Click Track.m4a').type, 'click');
  assert.equal(t('Guide.wav').type, 'guide');
  assert.equal(t('guia.wav').type, 'guide');
  assert.equal(t('Drums (Live).wav').type, 'drums');
  assert.equal(t('Bateria.wav').type, 'drums');
  assert.equal(t('Synth Bass.wav').type, 'bass');
  assert.equal(t('AG Group.wav').type, 'violao');
  assert.equal(t('EG 1.wav').type, 'guitars');
  assert.equal(t('Keys 2.wav').type, 'keys');
  assert.equal(t('Piano.wav').type, 'keys');
  assert.equal(t('Pad Warm.wav').type, 'pad');
  assert.equal(t('BGVS.wav').type, 'vocals');
  assert.equal(t('Strings.wav').type, 'strings');
  assert.equal(t('Perc.wav').type, 'loop');
  assert.equal(t('Synth Loop.wav').type, 'keys');
  assert.equal(t('Synth FX.wav').type, 'fx');
  assert.deepEqual(t('Coisa Estranha.wav'), { type: 'fx', source: 'fallback' });
  assert.equal(t('Click Track.m4a').source, 'name');
  for (const [n, want] of [['EG1.wav', 'guitars'], ['Click110bpm.wav', 'click'], ['GT2_1.wav', 'guitars'], ['Tambores.wav', 'loop'], ['Soprano.wav', 'vocals'], ['Hammond_bip_140bpm_x.wav', 'keys'], ['Drumm_bip_162bpm.wav', 'drums'], ['AC.wav', 'violao'], ['MuteVoz.wav', 'vocals'], ['#Guide 1.wav', 'guide']]) assert.equal(t(n).type, want, n);
});

test('categorize: caches e lixo do SO excluidos com motivo; resto pendente; nada sem motivo', () => {
  const c = (p, o) => categorize({ path: p, ext: p.split('.').pop(), localPresent: true, ...o });
  assert.equal(c('01_MULTITRACKS/a/b.asd', { realFormat: 'binary', realKind: 'binary' }).state, 'excluded');
  assert.equal(c('01_MULTITRACKS/a/desktop.ini', { realFormat: 'text', realKind: 'text' }).state, 'excluded');
  assert.equal(c('01_MULTITRACKS/a/b.als', { realFormat: 'gzip', realKind: 'archive' }).category, 'project');
  assert.equal(c('03_BACKUPS_SETLISTS/x.txt', { realFormat: 'text', realKind: 'text' }).category, 'backup');
  assert.equal(c('01_MULTITRACKS/a/semext', { ext: '', realFormat: 'zip', realKind: 'archive' }).category, 'song_zip');
  assert.equal(c('01_MULTITRACKS/a/b.wav', { realFormat: 'mp3', realKind: 'audio' }).category, 'song_stem');
  assert.equal(c('01_MULTITRACKS/a/b.wav', { realFormat: 'binary', realKind: 'binary' }).category, 'unknown');
  assert.equal(c('02_PADS_AMBIENTE/p.mp3', { realFormat: 'mp3', realKind: 'audio' }).category, 'pad');
  assert.match(c('01_MULTITRACKS/a/b.jpg', { realFormat: 'jpeg', realKind: 'image' }).reason, /^pending: /);
  assert.equal(categorize({ path: 'a/b.wav', ext: 'wav', localPresent: false }).state, 'pending');
});

test('zip: lista o diretorio central sem extrair e le entradas (deflate e stored) com CRC', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lvs-zip-'));
  try {
    const w1 = makeWav(1, 8000, 1);
    const w2 = makeWav(1, 8000, 2);
    const file = path.join(dir, 'p.bin');
    fs.writeFileSync(file, buildZip([{ name: 'd/', data: Buffer.alloc(0) }, { name: 'd/um.wav', data: w1 }, { name: 'd/dois.wav', data: w2, store: true }]));
    const { entries } = listZipEntries(file);
    assert.deepEqual(entries.map((e) => [e.name, e.isDir]), [['d/', true], ['d/um.wav', false], ['d/dois.wav', false]]);
    for (const [name, want] of [['d/um.wav', w1], ['d/dois.wav', w2]]) {
      const e = entries.find((x) => x.name === name);
      const h = await hashStream(openZipEntryStream(file, e));
      assert.equal(h.sha256, sha256(want));
    }
    // CRC corrompido => erro no fim do stream
    const bad = Buffer.from(fs.readFileSync(file));
    const e1 = entries[1];
    const dataStart = e1.localHeaderOffset + 30 + 'd/um.wav'.length;
    bad[dataStart + 10] ^= 0xff;
    fs.writeFileSync(file, bad);
    await assert.rejects(() => hashStream(openZipEntryStream(file, listZipEntries(file).entries[1])), /CRC32|inflate|invalid|incorrect/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('hash: sha256+md5 em streaming e duracao de WAV pelo cabecalho', async () => {
  const w = makeWav(3, 8000, 4);
  const h = await hashStream(Readable.from([w.subarray(0, 1000), w.subarray(1000)]));
  assert.equal(h.sha256, sha256(w));
  assert.equal(h.size, w.length);
  assert.equal(wavDurationSec(h.head, h.size), 3);
});

test('armazenamento local: grava na chave do contrato, rejeita hash que nao bate e nao deixa lixo', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lvs-r2-'));
  try {
    const st = new LocalStorage(root);
    const data = makeWav(1, 8000, 9);
    const sha = sha256(data);
    const scope = 'church:igreja-teste';
    await assert.rejects(() => st.put(scope, '0'.repeat(64), () => Readable.from([data]), { size: data.length }), /sha256_mismatch/);
    assert.equal((await st.head(scope, '0'.repeat(64))).exists, false);
    assert.deepEqual(fs.readdirSync(path.join(root, '_tmp')), []);
    assert.equal((await st.put(scope, sha, () => Readable.from([data]), { size: data.length })).created, true);
    assert.equal((await st.put(scope, sha, () => Readable.from([data]), { size: data.length })).created, false);
    assert.ok(fs.existsSync(path.join(root, 'churches', 'igreja-teste', 'blobs', sha)));
    assert.equal((await st.verify(scope, sha, { size: data.length })).ok, true);
    fs.appendFileSync(st.objectPath(scope, sha), 'x');
    assert.equal((await st.verify(scope, sha, { size: data.length })).ok, false);
    assert.equal(r2Key('catalog', sha), `catalog/blobs/${sha}`);
    assert.equal(routeScope(scope), 'churches/igreja-teste');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('armazenamento worker (fetch simulado): rotas, cabecalhos, token do arquivo, 401 fatal', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lvs-wk-'));
  try {
    const tokenFile = path.join(dir, 't');
    fs.writeFileSync(tokenFile, 'tok-1\n');
    const calls = [];
    const blobs = new Set();
    const fetchImpl = async (url, init) => {
      calls.push({ url, ...init });
      const sha = /blobs\/([0-9a-f]{64})/.exec(url)?.[1];
      if (init.method === 'HEAD') return new Response(null, { status: blobs.has(sha) ? 200 : 404, headers: { 'content-length': '5', 'x-integrity': 'r2-sha256' } });
      if (init.method === 'PUT') { blobs.add(sha); return new Response(null, { status: 201 }); }
      if (init.method === 'POST' && url.endsWith('/sources')) return new Response(null, { status: 201 });
      return new Response(null, { status: 500 });
    };
    const w = new WorkerStorage({ baseUrl: 'https://w.example.test/', tokenFile, fetchImpl, retries: 0 });
    const sha = 'a'.repeat(64);
    assert.equal((await w.put('church:igreja-teste', sha, () => Readable.from([Buffer.from('12345')]), { size: 5, contentType: 'audio/wav', originalName: 'Sol é lá.wav' })).created, true);
    const put = calls.find((c) => c.method === 'PUT');
    assert.equal(put.url, `https://w.example.test/v1/churches/igreja-teste/blobs/${sha}`);
    assert.equal(put.headers.authorization, 'Bearer tok-1');
    assert.equal(put.headers['x-original-name'], 'Sol _ l_.wav');
    assert.equal((await w.verify('church:igreja-teste', sha, { size: 5 })).ok, true);
    await w.recordSource('church:igreja-teste', sha, { kind: 'zip-entry', sourceId: 'id!/a.wav', path: 'p', name: 'a.wav', modifiedAt: 'x', size: 5, md5: 'm' });
    const src = JSON.parse(calls.at(-1).body);
    assert.equal(src.kind, 'zip-entry');
    assert.equal(src.sourceId, 'id!/a.wav');
    const w401 = new WorkerStorage({ baseUrl: 'https://w.example.test', tokenFile, retries: 0, fetchImpl: async () => new Response(null, { status: 401 }) });
    await assert.rejects(() => w401.head('catalog', sha), (e) => e.fatal === true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('firestore REST: codifica/decodifica valores tipados', () => {
  const d = new Date('2026-10-21T00:00:00Z');
  const f = toFields({ a: 'x', n: 3, f: 1.5, b: true, z: null, t: d, arr: [{ s: 'y' }], m: { k: 1 }, u: undefined });
  assert.deepEqual(f.n, { integerValue: '3' });
  assert.deepEqual(f.f, { doubleValue: 1.5 });
  assert.equal(f.u, undefined);
  assert.deepEqual(fromFields(f), { a: 'x', n: 3, f: 1.5, b: true, z: null, t: d, arr: [{ s: 'y' }], m: { k: 1 } });
});

test('gzip de ALS e sniff: gzip nao e confundido com audio', () => {
  assert.equal(detectFormat(zlib.gzipSync(Buffer.from('x'))).kind, 'archive');
});
