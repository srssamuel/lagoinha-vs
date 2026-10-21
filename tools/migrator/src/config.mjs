// Configuracao do migrador. Nada que identifique o acervo (ids, nomes, caminhos) vive no repositorio:
// o id da pasta raiz e o caminho de origem vem de config.json em MIGRATION_HOME ou de variaveis de ambiente.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CHURCH_ID_DEFAULT = 'lagoinha-jp';

export function defaultHome(env = process.env) {
  const local = env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  return env.LAGOINHA_MIGRATION_HOME ?? path.join(local, 'lagoinha-vs', 'migracao');
}

/** Procura o SQLite de metadados do Drive para desktop sem ler nada alem do nome das pastas. */
export function discoverDriveFsDbs(env = process.env) {
  const local = env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  const base = path.join(local, 'Google', 'DriveFS');
  const out = [];
  try {
    for (const d of fs.readdirSync(base, { withFileTypes: true })) {
      if (!d.isDirectory() || !/^\d+$/.test(d.name)) continue;
      const db = path.join(base, d.name, 'metadata_sqlite_db');
      if (fs.existsSync(db)) out.push(db);
    }
  } catch {
    /* sem Drive para desktop */
  }
  return out;
}

export function loadConfig(env = process.env, overrides = {}) {
  const home = overrides.home ?? defaultHome(env);
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8'));
  } catch {
    /* config.json e opcional */
  }
  const pick = (k, envName, fallback) => overrides[k] ?? env[envName] ?? file[k] ?? fallback;
  return {
    home,
    manifestPath: overrides.manifestPath ?? path.join(home, 'manifest.db'),
    r2LocalDir: overrides.r2LocalDir ?? path.join(home, 'r2-local'),
    firestoreLocalDir: overrides.firestoreLocalDir ?? path.join(home, 'firestore-local'),
    reportsDir: overrides.reportsDir ?? path.join(home, 'relatorios'),
    rootId: pick('rootId', 'MIGRATOR_DRIVE_ROOT_ID', null),
    sourceRoot: pick('sourceRoot', 'MIGRATOR_SOURCE_ROOT', null),
    // Pasta de primeiro nivel movida no Drive depois do inventario: { "<pasta>": "<novo caminho absoluto>" }.
    // So leitura no novo local; o md5 do Drive continua conferido antes de cada upload.
    relocations: overrides.relocations ?? file.relocations ?? {},
    driveFsDb: pick('driveFsDb', 'MIGRATOR_DRIVEFS_DB', null),
    prior: file.prior ?? null,
    churchId: pick('churchId', 'MIGRATOR_CHURCH_ID', CHURCH_ID_DEFAULT),
    // alvos remotos (opcionais)
    workerUrl: pick('workerUrl', 'MIGRATOR_WORKER_URL', null),
    tokenFile: overrides.tokenFile ?? env.MIGRATOR_ID_TOKEN_FILE ?? null,
    firebaseProjectId: pick('firebaseProjectId', 'MIGRATOR_FIREBASE_PROJECT_ID', 'lagoinha-joao-pessoa'),
    // Emulador do Firestore (ex.: http://127.0.0.1:8080); vazio = firestore.googleapis.com
    firestoreBaseUrl: pick('firestoreBaseUrl', 'MIGRATOR_FIRESTORE_BASE', null),
    // guarda de disco (bytes livres minimos no volume do cache do Drive)
    minFreeBytes: overrides.minFreeBytes ?? 8 * 1024 ** 3,
    ...(overrides.extra ?? {}),
  };
}

/** Caminho local de um item do manifesto, respeitando pastas de primeiro nivel realocadas. */
export function sourcePath(cfg, localRel) {
  const [top, ...rest] = localRel.split('/');
  const moved = cfg.relocations?.[top];
  return moved ? path.join(moved, ...rest) : path.join(cfg.sourceRoot, top, ...rest);
}

export function requireSource(cfg) {
  if (!cfg.rootId || !cfg.sourceRoot) {
    throw new Error(
      `Configure rootId e sourceRoot em ${path.join(cfg.home, 'config.json')} ou via MIGRATOR_DRIVE_ROOT_ID / MIGRATOR_SOURCE_ROOT.`,
    );
  }
}
