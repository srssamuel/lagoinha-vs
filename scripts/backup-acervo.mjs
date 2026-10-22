// Backup da biblioteca publica (sem custo: grava neste computador ou num disco externo).
//   node scripts/backup-acervo.mjs                         producao: D1 remoto + audio do R2 + catalogo publicado do Firestore
//   node scripts/backup-acervo.mjs --dest E:\backup-vs      outro destino (ex.: HD externo)
//   node scripts/backup-acervo.mjs --escopo tudo            inclui o audio das igrejas (nao so o catalogo)
//   node scripts/backup-acervo.mjs --local <persist> --firestore <url> --dest <dir>   teste contra wrangler/emulador locais
// O que guarda:
//   metadados/d1-<data>.sql      export completo do D1 (blobs, procedencia, publicacoes, eventos)
//   metadados/catalogo-<data>.json  musicas publicadas + versao publicada (leitura publica do Firestore, sem login)
//   audio/<prefixo>/<sha256>     cada arquivo, conferido pelo sha256 antes de entrar (incremental: o que ja tem nao baixa)
//   backup-<data>.json           resumo: contagens, bytes, faltas e o sha256 do proprio .sql
// Restaurar: node scripts/restore-acervo.mjs --from <dest> (ver docs/operacao/backup-acervo.md).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WDIR = path.join(ROOT, 'workers', 'stems');
const WRANGLER = path.join(WDIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DB = 'lagoinha-vs-stems-registry';
const BUCKET = 'lagoinha-vs-stems';
const LOCAL = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const DEST = path.resolve(arg('--dest', path.join(LOCAL, 'lagoinha-vs', 'backup-acervo')));
const SCOPE = arg('--escopo', 'catalog');
const PERSIST = arg('--local');
const FIRESTORE = arg('--firestore', 'https://firestore.googleapis.com/v1/projects/lagoinha-joao-pessoa/databases/(default)/documents');
const where = PERSIST ? ['--local', '--persist-to', PERSIST] : ['--remote'];
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const log = (m) => console.log(m);

function wrangler(args, { json = false } = {}) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], {
    cwd: WDIR,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  });
  if (r.status !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(' ')} falhou: ${(r.stderr || r.stdout).slice(-600)}`);
  return json ? JSON.parse(r.stdout.slice(r.stdout.indexOf('['))) : r.stdout;
}
const sql = (command) => wrangler(['d1', 'execute', DB, ...where, '--json', '--command', command], { json: true })[0].results;

function sha256File(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(8 * 1024 * 1024);
  try {
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

/**
 * Modo local (teste): `wrangler d1 export --local` nao aceita --persist-to, entao o dump sai direto do SQLite
 * do miniflare, no mesmo formato (CREATE + INSERT) que o restore aplica.
 */
async function dumpLocalD1(persist, outFile) {
  const { DatabaseSync } = await import('node:sqlite');
  const dir = path.join(persist, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (!file) throw new Error(`D1 local nao encontrado em ${dir}`);
  const db = new DatabaseSync(path.join(dir, file), { readOnly: true });
  const lit = (v) =>
    v === null || v === undefined
      ? 'NULL'
      : typeof v === 'number' || typeof v === 'bigint'
        ? String(v)
        : v instanceof Uint8Array
          ? `X'${Buffer.from(v).toString('hex')}'`
          : `'${String(v).replace(/'/g, "''")}'`;
  const lines = ['PRAGMA defer_foreign_keys=TRUE;'];
  const objects = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type = 'index', rowid").all();
  for (const o of objects) {
    lines.push(`${o.sql};`);
    if (o.type !== 'table') continue;
    for (const row of db.prepare(`SELECT * FROM "${o.name}"`).all()) {
      const cols = Object.keys(row);
      lines.push(`INSERT INTO "${o.name}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES(${cols.map((c) => lit(row[c])).join(',')});`);
    }
  }
  db.close();
  fs.writeFileSync(outFile, `${lines.join('\n')}\n`);
}

/** Catalogo publicado pela mesma leitura que o visitante faz: so status == published e a versao publicada. */
async function exportPublicCatalog() {
  const base = FIRESTORE.replace(/\/documents$/, '');
  const res = await fetch(`${base}/documents:runQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: 'catalog' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'published' } } } }
    })
  });
  if (!res.ok) throw new Error(`Firestore runQuery: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()).filter((r) => r.document);
  const songs = [];
  for (const { document } of rows) {
    const id = document.name.split('/').pop();
    const versionId = document.fields.currentVersionId?.stringValue;
    let version = null;
    if (versionId) {
      const v = await fetch(`${FIRESTORE}/catalog/${id}/versions/${versionId}`);
      if (v.ok) version = await v.json();
    }
    songs.push({ id, song: document, versionId, version });
  }
  return songs;
}

async function main() {
  fs.mkdirSync(path.join(DEST, 'metadados'), { recursive: true });
  const summary = { data: new Date().toISOString(), origem: PERSIST ? `local:${PERSIST}` : 'producao', escopo: SCOPE, destino: DEST };

  log('1/3 D1: export completo');
  const sqlFile = path.join(DEST, 'metadados', `d1-${stamp}.sql`);
  if (PERSIST) await dumpLocalD1(PERSIST, sqlFile);
  else wrangler(['d1', 'export', DB, '--remote', '--output', sqlFile]);
  summary.d1 = { arquivo: path.relative(DEST, sqlFile), bytes: fs.statSync(sqlFile).size, sha256: sha256File(sqlFile) };
  const counts = sql(
    "SELECT (SELECT COUNT(*) FROM blobs) AS blobs, (SELECT COUNT(*) FROM publications WHERE status='published') AS publicadas, (SELECT COUNT(*) FROM publication_events) AS eventos"
  )[0];
  summary.d1.contagens = counts;

  log('2/3 Firestore: catalogo publicado (leitura publica)');
  const catalog = await exportPublicCatalog();
  const catFile = path.join(DEST, 'metadados', `catalogo-${stamp}.json`);
  fs.writeFileSync(catFile, JSON.stringify(catalog, null, 2));
  summary.catalogo = { arquivo: path.relative(DEST, catFile), musicasPublicadas: catalog.length, versoes: catalog.filter((c) => c.version).length };

  log('3/3 R2: audio conferido por sha256');
  const filter = SCOPE === 'tudo' ? '' : "WHERE scope = 'catalog'";
  const blobs = sql(`SELECT scope, sha256, size FROM blobs ${filter} ORDER BY scope, sha256`);
  const audio = { arquivos: blobs.length, baixados: 0, jaNoBackup: 0, bytes: 0, falhas: [] };
  const tmp = path.join(DEST, 'audio', '.parcial');
  fs.mkdirSync(tmp, { recursive: true });
  for (const [i, b] of blobs.entries()) {
    const prefix = b.scope === 'catalog' ? 'catalog' : `churches/${b.scope.replace(/^church:/, '')}`;
    const target = path.join(DEST, 'audio', ...prefix.split('/'), b.sha256);
    audio.bytes += b.size;
    if (fs.existsSync(target) && fs.statSync(target).size === b.size) {
      audio.jaNoBackup++;
      continue;
    }
    const part = path.join(tmp, b.sha256);
    try {
      wrangler(['r2', 'object', 'get', `${BUCKET}/${prefix}/blobs/${b.sha256}`, ...where, '--file', part]);
      const got = sha256File(part);
      if (got !== b.sha256 || fs.statSync(part).size !== b.size) throw new Error(`conteudo nao confere (sha ${got.slice(0, 12)}…)`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(part, target);
      audio.baixados++;
    } catch (e) {
      fs.rmSync(part, { force: true });
      audio.falhas.push({ sha256: b.sha256, scope: b.scope, erro: String(e.message).slice(0, 200) });
    }
    if ((i + 1) % 20 === 0) log(`   ${i + 1}/${blobs.length}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  summary.audio = audio;

  const out = path.join(DEST, `backup-${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  log(JSON.stringify(summary, null, 2));
  if (audio.falhas.length) {
    console.error(`BACKUP INCOMPLETO: ${audio.falhas.length} arquivo(s) nao conferiram; rode de novo (o que ja esta no backup nao baixa outra vez).`);
    process.exit(1);
  }
  log(`BACKUP OK: ${out}`);
}

main().catch((e) => {
  console.error(`BACKUP FALHOU: ${e.message}`);
  process.exit(1);
});
