// Manifesto retomavel (SQLite via node:sqlite). Fica FORA do git (MIGRATION_HOME).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const STATES = ['discovered', 'hashed', 'uploaded', 'verified', 'associated', 'published', 'pending', 'failed', 'excluded'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, summary TEXT
);
CREATE TABLE IF NOT EXISTS folders (
  drive_id TEXT PRIMARY KEY, parent_id TEXT, name TEXT, path TEXT, trashed INTEGER NOT NULL DEFAULT 0,
  local_present INTEGER, last_seen_run INTEGER
);
CREATE TABLE IF NOT EXISTS files (
  key INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'file',            -- 'file' | 'zip-entry'
  source_id TEXT NOT NULL,                      -- id do Drive, ou 'driveId!/caminho/no/zip'
  drive_id TEXT NOT NULL,                       -- id do Drive do arquivo (ou do zip, nas entradas)
  container_key INTEGER,                        -- files.key do zip (entradas)
  entry_path TEXT,
  md5 TEXT NOT NULL DEFAULT '',                 -- md5 do Drive (entradas: 'crc32:xxxxxxxx')
  modified_ms INTEGER NOT NULL DEFAULT 0,
  is_current INTEGER NOT NULL DEFAULT 1,
  last_seen_run INTEGER,
  parent_id TEXT, name TEXT, path TEXT, ext TEXT,
  mime_source TEXT, size INTEGER NOT NULL DEFAULT 0, trashed INTEGER NOT NULL DEFAULT 0,
  local_present INTEGER, local_size INTEGER, local_rel TEXT,
  real_format TEXT, real_mime TEXT, real_kind TEXT, header_hex TEXT, mismatch TEXT,
  category TEXT, stem_type TEXT, type_source TEXT, song_id TEXT,
  church_id TEXT, scope TEXT,
  sha256 TEXT, md5_local TEXT, r2_key TEXT, existed INTEGER NOT NULL DEFAULT 0, duration_sec REAL,
  firebase_song_id TEXT, firebase_version_id TEXT,
  state TEXT NOT NULL DEFAULT 'discovered', reason TEXT,
  discovered_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (source_id, md5, modified_ms)
);
CREATE INDEX IF NOT EXISTS files_state ON files (state);
CREATE INDEX IF NOT EXISTS files_song ON files (song_id);
CREATE INDEX IF NOT EXISTS files_drive ON files (drive_id, is_current);
CREATE TABLE IF NOT EXISTS local_only (
  rel TEXT PRIMARY KEY, size INTEGER NOT NULL, is_dir INTEGER NOT NULL DEFAULT 0, last_seen_run INTEGER, note TEXT
);
CREATE TABLE IF NOT EXISTS songs (
  song_id TEXT PRIMARY KEY,                     -- id do documento no Firestore (deterministico)
  kind TEXT NOT NULL,                           -- 'song' | 'pad'
  group_key TEXT NOT NULL UNIQUE,               -- pasta da musica / zip!dir / arquivo do pad
  church_id TEXT NOT NULL,
  title TEXT, artist TEXT, bpm REAL, original_key TEXT, time_signature TEXT,
  source_id TEXT, source_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending', pending_reason TEXT,
  current_version_id TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory_runs (
  run_id INTEGER PRIMARY KEY, totals TEXT NOT NULL
);
`;

export const nowIso = () => new Date().toISOString();

export function openManifest(manifestPath) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const db = new DatabaseSync(manifestPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  ensureColumn(db, 'files', 'upload_started_at', 'TEXT');
  return db;
}

function ensureColumn(db, table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export function startRun(db, kind) {
  const r = db.prepare('INSERT INTO runs (kind, started_at) VALUES (?, ?)').run(kind, nowIso());
  return Number(r.lastInsertRowid);
}

export function finishRun(db, runId, summary) {
  db.prepare('UPDATE runs SET finished_at = ?, summary = ? WHERE id = ?').run(nowIso(), JSON.stringify(summary ?? {}), runId);
}

/** Executa fn dentro de uma transacao (commit no sucesso, rollback no erro). */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function setFileState(db, key, state, reason = null, extra = {}) {
  const cols = ['state = ?', 'reason = ?', 'updated_at = ?'];
  const vals = [state, reason, nowIso()];
  for (const [k, v] of Object.entries(extra)) {
    if (!/^[a-z0-9_]+$/.test(k)) throw new Error(`coluna invalida: ${k}`);
    cols.push(`${k} = ?`);
    vals.push(v ?? null);
  }
  db.prepare(`UPDATE files SET ${cols.join(', ')} WHERE key = ?`).run(...vals, key);
}
