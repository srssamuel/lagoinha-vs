// Fixtures sinteticas: arvore de mentira em pasta temporaria + SQLite de metadados no formato do Drive para desktop.
// Nada de rede, nada do acervo real.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../src/config.mjs';
import { openManifest } from '../src/db.mjs';

export const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

export function makeWav(seconds = 1, sampleRate = 8000, seed = 0) {
  const data = Buffer.alloc(sampleRate * 2 * seconds);
  for (let i = 0; i < data.length; i += 2) data.writeInt16LE(((i * 7 + seed * 131) % 2000) - 1000, i);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

export const makeMp3 = (seed = 1) => Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00'), crypto.createHash('sha256').update(String(seed)).digest(), Buffer.alloc(2000, seed)]);

/** ZIP minimo valido: entries = [{name, data, store?}] */
export function buildZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const isDir = e.name.endsWith('/');
    const data = isDir ? Buffer.alloc(0) : e.data;
    const comp = e.store || isDir ? data : zlib.deflateRawSync(data);
    const method = e.store || isDir ? 0 : 8;
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

/**
 * Cria a arvore de arquivos, o SQLite de metadados (formato DriveFS) e a configuracao.
 * @param {{path:string, data:Buffer, mime?:string, trashed?:boolean}[]} files
 */
export function makeFixture(files, { name = 'fx' } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `lvs-${name}-`));
  const srcRoot = path.join(tmp, 'G', 'Acervo');
  const home = path.join(tmp, 'home');
  fs.mkdirSync(srcRoot, { recursive: true });
  const drivefsDir = path.join(tmp, 'drivefs');
  fs.mkdirSync(drivefsDir, { recursive: true });
  const dbPath = path.join(drivefsDir, 'metadata_sqlite_db');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE items (stable_id INTEGER PRIMARY KEY NOT NULL, id TEXT UNIQUE NOT NULL, proto BLOB, trashed BOOLEAN NOT NULL, starred BOOLEAN NOT NULL DEFAULT 0,
    is_owner BOOLEAN NOT NULL DEFAULT 1, mime_type TEXT NOT NULL, is_folder BOOLEAN NOT NULL, modified_date INTEGER, shared_with_me_date INTEGER, viewed_by_me_date INTEGER,
    file_size INTEGER, is_tombstone BOOLEAN NOT NULL DEFAULT 0, local_title TEXT, subscribed BOOLEAN NOT NULL DEFAULT 1, team_drive_stable_id INTEGER, inaccessible_inheritance_broken BOOLEAN NOT NULL DEFAULT 0);
    CREATE TABLE stable_parents (item_stable_id INTEGER NOT NULL, parent_stable_id INTEGER NOT NULL, local_title_hash INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (item_stable_id, parent_stable_id));`);
  let next = 1;
  const rootSid = next++;
  const insItem = db.prepare(`INSERT INTO items (stable_id, id, proto, trashed, mime_type, is_folder, modified_date, file_size, local_title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insPar = db.prepare('INSERT INTO stable_parents (item_stable_id, parent_stable_id) VALUES (?, ?)');
  insItem.run(rootSid, 'ROOT_ID', Buffer.from('root'), 0, 'application/vnd.google-apps.folder', 1, 1000, 0, 'Acervo');
  const folders = new Map([['', rootSid]]);
  const folderId = (rel) => {
    if (folders.has(rel)) return folders.get(rel);
    const parent = folderId(rel.split('/').slice(0, -1).join('/'));
    const sid = next++;
    insItem.run(sid, `FOLDER_${sid}`, Buffer.from('f'), 0, 'application/vnd.google-apps.folder', 1, 1000, 0, rel.split('/').pop());
    insPar.run(sid, parent);
    folders.set(rel, sid);
    return sid;
  };
  const rows = [];
  for (const f of files) {
    const rel = f.path;
    const parent = folderId(rel.split('/').slice(0, -1).join('/'));
    const sid = next++;
    const id = `FILE_${sid}`;
    const proto = Buffer.concat([Buffer.from([0xda, 0x03, 0x20]), Buffer.from(md5(f.data))]);
    insItem.run(sid, id, proto, f.trashed ? 1 : 0, f.mime ?? 'application/octet-stream', 0, f.modified ?? 5000, f.data.length, rel.split('/').pop());
    insPar.run(sid, parent);
    if (!f.trashed) {
      const full = path.join(srcRoot, ...rel.split('/'));
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, f.data);
    }
    rows.push({ ...f, id, sid });
  }
  db.close();
  const cfg = loadConfig({ LOCALAPPDATA: tmp }, {
    home, rootId: 'ROOT_ID', sourceRoot: srcRoot, driveFsDb: dbPath, churchId: 'igreja-teste', minFreeBytes: 0,
  });
  const man = openManifest(cfg.manifestPath);
  return {
    tmp, cfg, db: man, rows, srcRoot, dbPath,
    cleanup() {
      try { man.close(); } catch { /* ja fechado */ }
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

/** Acervo de teste padrao. */
export function standardFiles() {
  const stems = (seed, secs = 1) => ['Click.wav', 'Guide.wav', 'Drums.wav', 'Bass.wav', 'Keys.wav'].map((n, i) => ({ n, d: makeWav(secs, 8000, seed + i) }));
  const out = [];
  for (const s of stems(10)) out.push({ path: `01_MULTITRACKS/Cancao Teste-Cancao Teste-D-72.00bpm/MultiTracks/${s.n}`, data: s.d, mime: 'audio/wav' });
  out.push({ path: '01_MULTITRACKS/Cancao Teste-Cancao Teste-D-72.00bpm/Cancao Teste.als', data: zlib.gzipSync(Buffer.from('<Ableton/>')), mime: 'application/x-gzip' });
  out.push({ path: '01_MULTITRACKS/Cancao Teste-Cancao Teste-D-72.00bpm/Album.jpg', data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]), mime: 'image/jpeg' });
  for (const s of stems(50, 2)) out.push({ path: `01_MULTITRACKS/Sem Metadados/Stems/${s.n}`, data: s.d, mime: 'audio/wav' });
  const zipEntries = [
    { name: 'Pacote/', data: Buffer.alloc(0) },
    { name: 'Pacote/Click.wav', data: makeWav(1, 6000, 90) },
    { name: 'Pacote/Bass.wav', data: makeWav(1, 6000, 91), store: true },
    { name: 'Pacote/Keys.wav', data: makeWav(1, 6000, 92) },
    { name: 'Pacote/cifra.pdf', data: Buffer.from('%PDF-1.4 teste') },
  ];
  out.push({ path: '01_MULTITRACKS/Pacote_Teste_100BPM_Tom_G.zip', data: buildZip(zipEntries), mime: 'application/zip' });
  out.push({ path: '01_MULTITRACKS/Outro Pacote Sem Extensao', data: buildZip([
    { name: 'a/Click.wav', data: makeWav(1, 7000, 70) }, { name: 'a/Bass.wav', data: makeWav(1, 7000, 71) }, { name: 'a/Keys.wav', data: makeWav(1, 7000, 72) },
  ]), mime: 'application/octet-stream' });
  out.push({ path: '01_MULTITRACKS/Cancao Teste-Cancao Teste-D-72.00bpm/WAV/x.wav.asd', data: Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0, 0, 0]), mime: 'application/msword' });
  out.push({ path: '02_PADS_AMBIENTE/Pad_Teste_Tom_G.mp3', data: makeMp3(3), mime: 'audio/mpeg' });
  out.push({ path: '03_BACKUPS_SETLISTS/set.txt', data: Buffer.from('culto 1\nculto 2\n'), mime: 'text/plain' });
  out.push({ path: '01_MULTITRACKS/Lixo/velho.wav', data: makeWav(1, 8000, 5), mime: 'audio/wav', trashed: true });
  out.push({ path: 'LEIAME.txt', data: Buffer.from('leia-me de teste'), mime: 'text/plain' });
  return out;
}
