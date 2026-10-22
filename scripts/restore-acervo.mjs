// Restaura um backup da biblioteca (feito por backup-acervo.mjs) num Worker LOCAL e confere arquivo por arquivo.
//   node scripts/restore-acervo.mjs --from <pasta-do-backup> --para <persist-local-novo>
// Prova que o backup basta para reconstruir o que a biblioteca serve: D1 (registro, publicacoes) + R2 (audio).
// Restaurar em PRODUCAO e decisao do Samuel e segue docs/operacao/backup-acervo.md (mesmos passos com --remote).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WDIR = path.join(ROOT, 'workers', 'stems');
const WRANGLER = path.join(WDIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DB = 'lagoinha-vs-stems-registry';
const BUCKET = 'lagoinha-vs-stems';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const FROM = arg('--from');
const TO = arg('--para');
if (!FROM || !TO) {
  console.error('uso: node scripts/restore-acervo.mjs --from <backup> --para <persist-local-novo>');
  process.exit(2);
}
if (fs.existsSync(TO) && fs.readdirSync(TO).length > 0) {
  console.error(`destino ${TO} nao esta vazio: a restauracao de teste parte de um Worker local novo`);
  process.exit(2);
}

function wrangler(args, json = false) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], { cwd: WDIR, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(' ')} falhou: ${(r.stderr || r.stdout).slice(-600)}`);
  return json ? JSON.parse(r.stdout.slice(r.stdout.indexOf('['))) : r.stdout;
}
const local = ['--local', '--persist-to', TO];
const latest = (dir, re) =>
  fs
    .readdirSync(dir)
    .filter((f) => re.test(f))
    .sort()
    .at(-1);
const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const meta = path.join(FROM, 'metadados');
const sqlName = latest(meta, /^d1-.*\.sql$/);
if (!sqlName) throw new Error('backup sem export do D1');
fs.mkdirSync(TO, { recursive: true });

console.log(`1/3 D1 <- ${sqlName}`);
wrangler(['d1', 'execute', DB, ...local, '--file', path.join(meta, sqlName)]);
const blobs = wrangler(['d1', 'execute', DB, ...local, '--json', '--command', 'SELECT scope, sha256, size, content_type FROM blobs'], true)[0].results;
const published = wrangler(['d1', 'execute', DB, ...local, '--json', '--command', "SELECT song_id, version_id, manifest FROM publications WHERE status = 'published'"], true)[0].results;

console.log(`2/3 R2 <- audio (${blobs.length} registros)`);
const report = { d1: sqlName, registros: blobs.length, restaurados: 0, semArquivoNoBackup: [], publicadas: published.length, publicadasCompletas: 0 };
const restored = new Set();
for (const b of blobs) {
  const prefix = b.scope === 'catalog' ? 'catalog' : `churches/${b.scope.replace(/^church:/, '')}`;
  const file = path.join(FROM, 'audio', ...prefix.split('/'), b.sha256);
  if (!fs.existsSync(file)) {
    report.semArquivoNoBackup.push(`${b.scope}/${b.sha256}`);
    continue;
  }
  if (sha256File(file) !== b.sha256) throw new Error(`arquivo do backup corrompido: ${file}`);
  wrangler(['r2', 'object', 'put', `${BUCKET}/${prefix}/blobs/${b.sha256}`, ...local, '--file', file, '--content-type', b.content_type || 'application/octet-stream']);
  restored.add(`${b.scope}/${b.sha256}`);
  report.restaurados++;
}

console.log('3/3 conferencia: toda musica publicada tem todos os arquivos restaurados');
for (const p of published) {
  const manifest = JSON.parse(p.manifest);
  if (manifest.every((s) => restored.has(`catalog/${s.sha256}`))) report.publicadasCompletas++;
}
const catName = latest(meta, /^catalogo-.*\.json$/);
if (catName) {
  const catalog = JSON.parse(fs.readFileSync(path.join(meta, catName), 'utf8'));
  report.catalogoFirestore = { arquivo: catName, musicas: catalog.length, batemComD1: catalog.every((c) => published.some((p) => p.song_id === c.id && p.version_id === c.versionId)) };
}
console.log(JSON.stringify(report, null, 2));
const ok = report.publicadasCompletas === report.publicadas && (!report.catalogoFirestore || report.catalogoFirestore.batemComD1);
console.log(ok ? `RESTAURACAO OK em ${TO}` : 'RESTAURACAO INCOMPLETA');
process.exit(ok ? 0 : 1);
