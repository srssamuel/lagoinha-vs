// E2E da biblioteca publica (painel /admin/acervo + /biblioteca), build de PRODUCAO, 100% local (emuladores; nada de nuvem).
//   npm run e2e:acervo                 fluxo completo
//   npm run e2e:acervo -- --reuse-build reaproveita o build da execucao anterior (mesmas portas)
// Roteiro (os 10 criterios do pedido, com audio GERADO aqui, nada do acervo real):
//  curador entra no painel -> envia 2 ZIPs + 1 arquivo invalido (recusado com motivo) -> revisa direitos/BPM -> salva ->
//  publicacao recusada pelo servidor com BPM pendente -> corrige e publica -> stems avulsos com um arquivo de ~100 MB
//  (multipart) -> recarrega a pagina no meio do envio -> seleciona de novo e o envio continua das partes ja recebidas ->
//  visitante anonimo abre a biblioteca, prepara e toca no player, reabre sem rede e toca -> visitante bloqueado para enviar,
//  alterar, apagar e ler rascunho -> retirar e republicar uma versao de teste -> bytes servidos = bytes enviados (sha256).
// Evidencias em %LOCALAPPDATA%\lagoinha-vs\e2e-acervo\.
import { spawn, spawnSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
const HOME = process.env.LAGOINHA_E2E_HOME ?? path.join(LOCAL, 'lagoinha-vs', 'e2e-acervo');
const REUSE = process.argv.includes('--reuse-build');
const PROJECT = 'demo-lagoinha';
const DIST = path.join(HOME, 'dist');
const MATERIAL = path.join(HOME, 'material');
const SHOTS = path.join(HOME, 'telas');
const PERSIST = path.join(HOME, 'wrangler-state');
const PART_SIZE = 32 * 1024 * 1024;

const results = [];
const children = [];
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => {
  if (!cond) throw new Error(`assercao falhou: ${msg}`);
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
let currentPage = null;
async function check(step, name, fn) {
  try {
    const evidence = (await fn()) ?? {};
    results.push({ step, name, status: 'PASS', evidence });
    log(`PASS ${step} ${name} ${JSON.stringify(evidence).slice(0, 700)}`);
    return evidence;
  } catch (e) {
    if (currentPage) await shot(currentPage, `falha-${step}`).catch(() => undefined);
    results.push({ step, name, status: 'FAIL', error: String(e?.message ?? e) });
    log(`FAIL ${step} ${name} :: ${String(e?.message ?? e).slice(0, 600)}`);
    throw e;
  }
}

// ---------------------------------------------------------------- infraestrutura
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}
function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' }, () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => resolve(false));
  });
}
function start(name, cmd, args, { cwd = ROOT, env = {} } = {}) {
  const out = fs.openSync(path.join(HOME, `${name}.log`), 'w');
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', out, out], windowsHide: true });
  child.on('error', (e) => log(`processo ${name}: ${e.message}`));
  children.push({ name, child });
  return child;
}
/** Mata so os PIDs iniciados por este script (e filhos), nunca por nome. */
function killAll() {
  for (const { child } of children.reverse()) {
    if (child.exitCode === null && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  }
}
async function waitPort(port, label, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await portOpen(port)) return;
    await sleep(500);
  }
  throw new Error(`${label} nao abriu a porta ${port} (veja ${HOME})`);
}
async function waitHttp(url, label, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`${label} nao respondeu em ${url}`);
}
function javaHome() {
  if (spawnSync('java', ['-version']).status === 0) return null;
  const cands = [process.env.JAVA_HOME, path.join(LOCAL, 'Programs', 'jdk21')].filter(Boolean);
  const found = cands.find((h) => fs.existsSync(path.join(h, 'bin', 'java.exe')));
  if (!found) throw new Error('Java 21+ nao encontrado (JAVA_HOME ou %LOCALAPPDATA%\\Programs\\jdk21)');
  return found;
}
async function loadPlaywright() {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return createRequire(path.join(root, 'noop.js'))('playwright');
}

// ---------------------------------------------------------------- servidor estatico com fallback de SPA (como o Hosting)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff' };
let staticSrv = null;
function startStatic(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.join(DIST, rel);
    // firebase.json reescreve tudo para /index.html: /biblioteca/{id} e /admin/acervo caem no app.
    if (!path.extname(rel) && (!fs.existsSync(file) || !fs.statSync(file).isFile())) file = path.join(DIST, 'index.html');
    if (!file.startsWith(DIST) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('404');
    }
    const headers = { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' };
    if (/(^|[\\/])(sw\.js|index\.html)$/.test(file)) headers['cache-control'] = 'no-cache';
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve((staticSrv = server)));
  });
}

// ---------------------------------------------------------------- material sintetico
/** WAV estereo 16-bit com silencio inicial e L diferente de R (prova de que nada e somado nem normalizado). */
function makeWav(freqL, freqR, seconds, { rate = 44100, silence = 0.3 } = {}) {
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  const start = Math.floor(silence * rate);
  for (let i = start; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freqL * i) / rate) * 8000), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freqR * i) / rate) * 5000), 46 + i * 4);
  }
  return buf;
}
/** ZIP com deflate (como os pacotes reais). */
function makeZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---------------------------------------------------------------- Firebase (emuladores) via REST
let AUTH;
let FS_HOST;
let WORKER;
let APP;
const FS_DOCS = () => `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function authCall(op, body) {
  const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${op}?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`auth ${op}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
async function fsOwnerPatch(docPath, fields) {
  const res = await fetch(`${FS_DOCS()}/${docPath}`, { method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(`firestore PATCH ${docPath}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
async function catalogByTitle() {
  const res = await fetch(`${FS_DOCS()}/catalog?pageSize=100`, { headers: { authorization: 'Bearer owner' } });
  const json = await res.json();
  const out = {};
  for (const d of json.documents ?? []) {
    const f = d.fields;
    out[f.title.stringValue] = {
      id: d.name.split('/').pop(),
      status: f.status?.stringValue,
      currentVersionId: f.currentVersionId?.stringValue,
      draftVersionId: f.draftVersionId?.stringValue,
      bpm: Number(f.bpm?.integerValue ?? f.bpm?.doubleValue ?? 0),
      originalKey: f.originalKey?.stringValue ?? ''
    };
  }
  return out;
}
async function versionStems(songId, versionId) {
  const res = await fetch(`${FS_DOCS()}/catalog/${songId}/versions/${versionId}`, { headers: { authorization: 'Bearer owner' } });
  const json = await res.json();
  return json.fields.stems.arrayValue.values.map((v) => {
    const f = v.mapValue.fields;
    return { sha256: f.sha256.stringValue, name: f.name.stringValue, type: f.type.stringValue, size: Number(f.size.integerValue) };
  });
}

// ---------------------------------------------------------------- navegador
const AUDIO_SPY = `(() => {
  const Orig = window.AudioContext;
  window.__acs = [];
  window.AudioContext = class extends Orig { constructor(...a) { super(...a); window.__acs.push(this); } };
})();`;
async function newContext(browserOrPw, opts = {}) {
  const context = await browserOrPw.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  await context.addInitScript(AUDIO_SPY);
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  page.on('dialog', (d) => void d.accept());
  return { context, page, errs };
}
const playBtn = (page) => page.locator('button[title^="Reproduzir"]').first();
async function audioClock(page) {
  return page.evaluate(() => (window.__acs ?? []).map((c) => ({ state: c.state, t: c.currentTime })));
}
async function startAndProveAudio(page) {
  const before = await playBtn(page).innerText();
  await playBtn(page).click();
  const deadline = Date.now() + 20000;
  while ((await playBtn(page).innerText()) === before && Date.now() < deadline) await sleep(300);
  const a = await audioClock(page);
  await sleep(2500);
  const b = await audioClock(page);
  const running = b.filter((c, i) => c.state === 'running' && a[i] && c.t - a[i].t >= 1.5);
  assert(running.length >= 1, `nenhum AudioContext rodando com tempo avancando: ${JSON.stringify(b)}`);
  return { avancoDoRelogio: Number((running[0].t - a[b.indexOf(running[0])].t).toFixed(2)) };
}
async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}
const card = (page, title) => page.locator('li', { has: page.locator('h3', { hasText: title }) }).first();
async function waitCardStatus(page, title, label, timeout = 120000) {
  await card(page, title).locator('span', { hasText: label }).first().waitFor({ timeout });
}
async function fillRights(c) {
  await c.getByLabel(/^Direitos/).selectOption('own');
  await c.getByLabel(/^Titular/).fill('Lagoinha VS (audio gerado para teste)');
  await c.getByLabel(/^Titular/).blur();
  await c.getByLabel(/^Documento/).fill('E2E-ACERVO');
  await c.getByLabel(/^Documento/).blur();
  await sleep(300);
}

// ---------------------------------------------------------------- roteiro
async function main() {
  fs.mkdirSync(HOME, { recursive: true });
  fs.rmSync(SHOTS, { recursive: true, force: true });
  const portsFile = path.join(HOME, 'ports.json');
  let ports;
  if (REUSE && fs.existsSync(portsFile)) ports = JSON.parse(fs.readFileSync(portsFile, 'utf8'));
  else ports = { auth: await freePort(), fs: await freePort(), fsWs: await freePort(), hub: await freePort(), logging: await freePort(), worker: await freePort(), inspector: await freePort(), app: await freePort() };
  for (const p of [ports.auth, ports.fs, ports.worker, ports.app]) assert(!(await portOpen(p)), `porta ${p} ocupada (apague ${portsFile})`);
  fs.writeFileSync(portsFile, JSON.stringify(ports));
  AUTH = `127.0.0.1:${ports.auth}`;
  FS_HOST = `127.0.0.1:${ports.fs}`;
  WORKER = `http://127.0.0.1:${ports.worker}`;
  APP = `http://127.0.0.1:${ports.app}`;
  const password = `E2e-${crypto.randomBytes(9).toString('base64url')}`;
  const users = { curator: { email: 'curador@e2e.local', name: 'Curador E2E' }, member: { email: 'musico@e2e.local', name: 'Musico E2E' } };
  const material = {};

  try {
    await check('0', 'Build de producao (Firebase apontando para os emuladores) e material de audio gerado', async () => {
      if (!(REUSE && fs.existsSync(path.join(DIST, 'index.html')))) {
        fs.rmSync(DIST, { recursive: true, force: true });
        const r = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'e2e', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'], {
          cwd: ROOT,
          env: { ...process.env, LAGOINHA_BUILD_TAG: 'e2e-acervo', VITE_BACKEND: 'firebase', VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_PROJECT_ID: PROJECT, VITE_FIREBASE_AUTH_EMULATOR: AUTH, VITE_FIREBASE_FIRESTORE_EMULATOR: FS_HOST, VITE_STEMS_WORKER_URL: WORKER },
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024
        });
        fs.writeFileSync(path.join(HOME, 'build.log'), `${r.stdout}\n${r.stderr}`);
        assert(r.status === 0, `vite build falhou: ${(r.stderr || r.stdout).slice(-400)}`);
        fs.rmSync(path.join(DIST, 'stems'), { recursive: true, force: true });
      }
      fs.rmSync(MATERIAL, { recursive: true, force: true });
      fs.mkdirSync(path.join(MATERIAL, 'gama'), { recursive: true });
      const alfa = [['Click.wav', 1000, 1000], ['Guia.wav', 440, 440], ['Bateria.wav', 110, 165], ['Baixo.wav', 55, 82]].map(([n, l, r]) => ({ name: n, data: makeWav(l, r, 8) }));
      const beta = [['Click.wav', 1200, 1200], ['Teclado.wav', 262, 330], ['Violao.wav', 196, 247]].map(([n, l, r]) => ({ name: n, data: makeWav(l, r, 6) }));
      material.alfaZip = path.join(MATERIAL, 'E2E Acervo Alfa (Versao Teste) 96Bpm - D.zip');
      material.betaZip = path.join(MATERIAL, 'E2E Acervo Beta.zip');
      material.junk = path.join(MATERIAL, 'leia-me.txt');
      fs.writeFileSync(material.alfaZip, makeZip(alfa));
      fs.writeFileSync(material.betaZip, makeZip(beta));
      fs.writeFileSync(material.junk, 'nao e audio');
      material.alfa = Object.fromEntries(alfa.map((e) => [e.name, sha256(e.data)]));
      material.beta = Object.fromEntries(beta.map((e) => [e.name, sha256(e.data)]));
      // ~101 MB: acima do PUT unico (95 MB), 4 partes de 32 MB no multipart.
      const gama = [['click gama.wav', makeWav(1500, 1500, 5)], ['guia gama.wav', makeWav(500, 500, 5)], ['pad gama grande.wav', makeWav(131, 196, 600)]];
      material.gama = gama.map(([n, d]) => {
        const p = path.join(MATERIAL, 'gama', n);
        fs.writeFileSync(p, d);
        return { path: p, name: n, size: d.length, sha: sha256(d) };
      });
      const big = material.gama[2];
      assert(big.size > 95 * 1024 * 1024, 'arquivo grande menor que o limite do PUT unico');
      return { zips: 2, stemsAlfa: alfa.length, stemsBeta: beta.length, grandeMB: Number((big.size / 1048576).toFixed(1)), partesEsperadas: Math.ceil(big.size / PART_SIZE) };
    });

    await check('1', 'Emuladores Auth+Firestore (regras reais), Worker de stems local (D1 migrado) e servidor do app com fallback de SPA', async () => {
      const jh = javaHome();
      const env = jh ? { JAVA_HOME: jh, PATH: `${path.join(jh, 'bin')}${path.delimiter}${process.env.PATH}` } : {};
      const cfg = path.join(HOME, 'firebase.e2e.json');
      fs.writeFileSync(cfg, JSON.stringify({
        firestore: { rules: path.join(ROOT, 'firestore.rules').split(path.sep).join('/') },
        emulators: { singleProjectMode: true, hub: { host: '127.0.0.1', port: ports.hub }, logging: { host: '127.0.0.1', port: ports.logging }, auth: { host: '127.0.0.1', port: ports.auth }, firestore: { host: '127.0.0.1', port: ports.fs, websocketPort: ports.fsWs }, ui: { enabled: false } }
      }));
      start('emuladores', process.execPath, [path.join(ROOT, 'node_modules/firebase-tools/lib/bin/firebase.js'), 'emulators:start', '--config', cfg, '--only', 'auth,firestore', '--project', PROJECT], { env });
      await waitPort(ports.auth, 'Auth emulator');
      await waitPort(ports.fs, 'Firestore emulator');
      const wdir = path.join(ROOT, 'workers/stems');
      const wrangler = path.join(wdir, 'node_modules/wrangler/bin/wrangler.js');
      fs.rmSync(PERSIST, { recursive: true, force: true });
      const wenv = { WRANGLER_SEND_METRICS: 'false', CI: 'true' };
      const mig = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'lagoinha-vs-stems-registry', '--local', '--persist-to', PERSIST], { cwd: wdir, env: { ...process.env, ...wenv }, encoding: 'utf8' });
      fs.writeFileSync(path.join(HOME, 'worker-migrations.log'), `${mig.stdout}\n${mig.stderr}`);
      assert(mig.status === 0, 'migracoes D1 locais falharam (worker-migrations.log)');
      assert(/0003_publications/.test(mig.stdout), 'migracao 0003_publications nao aplicada');
      start('worker', process.execPath, [wrangler, 'dev', '--port', String(ports.worker), '--ip', '127.0.0.1', '--inspector-port', String(ports.inspector), '--persist-to', PERSIST,
        '--var', `FIREBASE_PROJECT_ID:${PROJECT}`, '--var', `FIRESTORE_BASE:http://${FS_HOST}`, '--var', 'AUTH_EMULATOR:true', '--var', `ALLOWED_ORIGINS:${APP}`, '--var', 'VERSION:e2e'], { cwd: wdir, env: wenv });
      await waitHttp(`${WORKER}/`, 'Worker');
      await startStatic(ports.app);
      const html = await (await fetch(`${APP}/admin/acervo`)).text();
      assert(html.includes('<div id="root"'), '/admin/acervo nao caiu no app');
      return { portas: ports };
    });

    await check('2', 'Contas: curador (platformAdmins) e musico comum', async () => {
      for (const u of Object.values(users)) {
        const r = await authCall('signUp', { email: u.email, password, displayName: u.name, returnSecureToken: true });
        u.uid = r.localId;
      }
      await fsOwnerPatch(`platformAdmins/${users.curator.uid}`, { role: { stringValue: 'curator' } });
      return { curador: users.curator.email, musico: users.member.email };
    });

    const pw = await loadPlaywright();
    const browser = await pw.chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const curatorToken = async () => (await authCall('signInWithPassword', { email: users.curator.email, password, returnSecureToken: true })).idToken;

    try {
      const admin = await newContext(browser);
      const page = admin.page;
      currentPage = page;

      await check('3', 'Criterio 1: painel /admin/acervo pede login e abre para o curador', async () => {
        await page.goto(`${APP}/admin/acervo`, { waitUntil: 'domcontentloaded' });
        await page.locator('input[type="email"]').first().fill(users.curator.email);
        await page.locator('input[type="password"]').first().fill(password);
        await page.locator('button[type="submit"]').first().click();
        await page.getByText('Acervo · biblioteca pública').waitFor({ timeout: 30000 });
        await shot(page, '01-painel-vazio');
        return { url: page.url() };
      });

      await check('4', 'Criterio 5: dois ZIPs + um arquivo invalido na mesma selecao viram 2 musicas; o invalido aparece recusado com motivo', async () => {
        await page.locator('[data-testid="acervo-arquivos"]').setInputFiles([material.alfaZip, material.betaZip, material.junk]);
        await card(page, 'E2E Acervo Alfa').waitFor({ timeout: 60000 });
        await card(page, 'E2E Acervo Beta').waitFor({ timeout: 60000 });
        await page.getByText('leia-me.txt: não é áudio nem .zip').waitFor({ timeout: 5000 });
        const alfa = card(page, 'E2E Acervo Alfa');
        const beta = card(page, 'E2E Acervo Beta');
        const alfaStems = await alfa.locator('ul > li').count();
        const betaStems = await beta.locator('ul > li').count();
        assert(alfaStems === 4 && betaStems === 3, `stems por musica: alfa=${alfaStems} beta=${betaStems}`);
        assert((await alfa.getByLabel(/^BPM/).inputValue()) === '96', 'BPM do nome nao lido');
        assert((await alfa.getByLabel(/^Tom/).inputValue()) === 'D', 'tom do nome nao lido');
        assert((await beta.getByLabel(/^BPM/).inputValue()) === '', 'BPM inventado para Beta');
        assert((await beta.getByLabel(/^Tom/).inputValue()) === '', 'tom inventado para Beta');
        await beta.getByText('pendente: obrigatório para publicar').waitFor();
        const fn = await alfa.getByLabel('Função de Click.wav').inputValue();
        const fnGuia = await alfa.getByLabel('Função de Guia.wav').inputValue();
        assert(fn === 'click' && fnGuia === 'guide', `funcoes click/guia: ${fn}/${fnGuia}`);
        await shot(page, '02-dois-zips-na-fila');
        return { musicas: 2, recusado: 'leia-me.txt', alfa: { stems: alfaStems, bpm: 96, tom: 'D' }, beta: { stems: betaStems, bpm: 'pendente', tom: 'desconhecido' } };
      });

      await check('5', 'Criterio 2: salvar no acervo envia varios stems, confere cada um no servidor e fica "pronto para publicar"', async () => {
        for (const title of ['E2E Acervo Alfa', 'E2E Acervo Beta']) {
          const c = card(page, title);
          await fillRights(c);
          await c.getByRole('button', { name: 'Salvar no acervo' }).click();
        }
        await waitCardStatus(page, 'E2E Acervo Alfa', 'Pronto para publicar');
        await waitCardStatus(page, 'E2E Acervo Beta', 'Pronto para publicar');
        const conferidos = await card(page, 'E2E Acervo Alfa').getByText('4/4 stems conferidos').count();
        assert(conferidos === 1, 'Alfa sem 4/4 conferidos');
        const cat = await catalogByTitle();
        assert(cat['E2E Acervo Alfa']?.status === 'ready' && cat['E2E Acervo Beta']?.status === 'ready', `catalogo: ${JSON.stringify(cat)}`);
        assert(cat['E2E Acervo Beta'].bpm === 0, 'BPM de Beta deveria ficar 0 (pendente)');
        await shot(page, '03-prontas');
        return { catalogo: cat };
      });

      await check('6', 'Criterio 6: publicar e conferido pelo servidor (Beta recusada por BPM pendente; depois de informar o BPM, publica)', async () => {
        const beta = card(page, 'E2E Acervo Beta');
        await beta.getByRole('button', { name: 'Publicar na biblioteca' }).click();
        await beta.getByText('BPM pendente: informe o BPM antes de publicar.').waitFor({ timeout: 30000 });
        assert((await catalogByTitle())['E2E Acervo Beta'].status === 'ready', 'Beta publicada com BPM pendente');
        await beta.getByLabel(/^BPM/).fill('72');
        await beta.getByLabel(/^BPM/).blur();
        await beta.getByRole('button', { name: 'Salvar no acervo' }).click();
        await waitCardStatus(page, 'E2E Acervo Beta', 'Pronto para publicar');
        await beta.getByRole('button', { name: 'Publicar na biblioteca' }).click();
        await waitCardStatus(page, 'E2E Acervo Beta', 'Publicado', 60000);
        await card(page, 'E2E Acervo Alfa').getByRole('button', { name: 'Publicar na biblioteca' }).click();
        await waitCardStatus(page, 'E2E Acervo Alfa', 'Publicado', 60000);
        const cat = await catalogByTitle();
        assert(cat['E2E Acervo Alfa'].status === 'published' && cat['E2E Acervo Beta'].status === 'published', `catalogo: ${JSON.stringify(cat)}`);
        assert(cat['E2E Acervo Beta'].bpm === 72, 'BPM informado nao gravado');
        await shot(page, '04-publicadas');
        return { recusaServidor: 'bpm_pending', depois: { alfa: cat['E2E Acervo Alfa'], beta: cat['E2E Acervo Beta'] } };
      });

      const partPuts = { s1: [], s2: [] };
      let phase = 's1';
      page.on('request', (req) => {
        const m = /\/multipart\/[^/]+\/(\d+)$/.exec(new URL(req.url()).pathname);
        if (m && req.method() === 'PUT') partPuts[phase].push(Number(m[1]));
      });

      await check('7', 'Criterios 3 e 4: stems avulsos com arquivo de ~101 MB pelo multipart; recarga no meio; nova selecao continua das partes recebidas', async () => {
        const big = material.gama[2];
        const partCount = Math.ceil(big.size / PART_SIZE);
        await page.locator('[data-testid="acervo-arquivos"]').setInputFiles(material.gama.map((g) => g.path));
        const c = card(page, 'Sem título');
        await c.waitFor({ timeout: 60000 });
        await c.getByLabel(/^Título/).fill('E2E Acervo Gama');
        await c.getByLabel(/^Título/).blur();
        const g = card(page, 'E2E Acervo Gama');
        await g.getByLabel(/^BPM/).fill('80');
        await g.getByLabel(/^BPM/).blur();
        await fillRights(g);
        assert((await g.getByLabel('Função de pad gama grande.wav').inputValue()) === 'pad', 'pad nao classificado');
        // Segura as partes 3+ para a recarga pegar o envio no meio (as partes 1 e 2 chegam ao servidor).
        const held = /\/multipart\/[^/]+\/([3-9])$/;
        const isHeld = (url) => held.test(url.pathname);
        await page.route(isHeld, async (route) => {
          await sleep(60000);
          await route.continue().catch(() => undefined);
        });
        let done = 0;
        const twoParts = new Promise((resolve) => {
          const onResp = (res) => {
            if (/\/multipart\/[^/]+\/[12]$/.test(new URL(res.url()).pathname) && res.request().method() === 'PUT' && res.status() === 200 && ++done === 2) {
              page.off('response', onResp);
              resolve();
            }
          };
          page.on('response', onResp);
        });
        await g.getByRole('button', { name: 'Salvar no acervo' }).click();
        await Promise.race([twoParts, sleep(180000).then(() => Promise.reject(new Error('partes 1 e 2 nao confirmadas')))]);
        await sleep(1500); // estado de retomada gravado no aparelho (grava no maximo a cada 1 s)
        await shot(page, '05-multipart-no-meio');
        await page.unroute(isHeld);
        phase = 's2';
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByText('Acervo · biblioteca pública').waitFor({ timeout: 30000 });
        await waitCardStatus(page, 'E2E Acervo Gama', 'Selecione os arquivos de novo', 30000);
        await shot(page, '06-apos-recarga');
        await page.locator('[data-testid="acervo-arquivos"]').setInputFiles(material.gama.map((x) => x.path));
        await waitCardStatus(page, 'E2E Acervo Gama', 'Pronto para publicar', 240000);
        const s2 = [...new Set(partPuts.s2)].sort();
        assert(!s2.includes(1) && !s2.includes(2), `partes ja recebidas foram reenviadas: ${s2}`);
        assert(s2.length === partCount - 2, `partes enviadas na retomada: ${s2} (esperado ${partCount - 2})`);
        // Conferencia do conteudo pelo R2 (nao pela ETag): verify devolve r2-sha256 e os bytes batem.
        const token = await curatorToken();
        const v = await fetch(`${WORKER}/v1/catalog/blobs/${big.sha}/verify`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
        const vj = await v.json();
        assert(v.status === 200 && vj.integrity === 'r2-sha256', `verify: ${v.status} ${JSON.stringify(vj)}`);
        const draft = (await catalogByTitle())['E2E Acervo Gama'];
        // Leitura autenticada do catalogo sempre referencia musica e versao (o Worker confere a versao no Firestore).
        const gr = await fetch(`${WORKER}/v1/catalog/blobs/${big.sha}?song=${draft.id}&version=${draft.draftVersionId}`, { headers: { authorization: `Bearer ${token}` } });
        const got = Buffer.from(await gr.arrayBuffer());
        assert(
          sha256(got) === big.sha && got.length === big.size,
          `bytes do arquivo grande nao conferem: status=${gr.status} bytes=${got.length}/${big.size} sha=${sha256(got).slice(0, 12)} headers=${JSON.stringify(Object.fromEntries(gr.headers))} inicio=${got.subarray(0, 120).toString('utf8')}`
        );
        const cat = await catalogByTitle();
        assert(Object.keys(cat).filter((t) => t.startsWith('E2E Acervo Gama')).length === 1, 'Gama duplicada no catalogo');
        return { partes: partCount, enviadasAntesDaRecarga: [...new Set(partPuts.s1)].sort(), reenviadasNaRetomada: s2, integridade: vj.integrity, sha256Confere: true, gama: cat['E2E Acervo Gama'] };
      });

      await check('8', 'Confirmar de novo nao duplica: salvar Gama outra vez nao sobe nada e mantem os mesmos ids', async () => {
        const before = await catalogByTitle();
        const n = partPuts.s2.length;
        const g = card(page, 'E2E Acervo Gama');
        await g.getByLabel(/^Artista/).fill('Teste');
        await g.getByLabel(/^Artista/).blur();
        await g.getByRole('button', { name: 'Salvar no acervo' }).click();
        await waitCardStatus(page, 'E2E Acervo Gama', 'Pronto para publicar');
        const after = await catalogByTitle();
        assert(partPuts.s2.length === n, 'reenviou partes');
        assert(after['E2E Acervo Gama'].id === before['E2E Acervo Gama'].id && after['E2E Acervo Gama'].draftVersionId === before['E2E Acervo Gama'].draftVersionId, 'ids mudaram');
        assert(Object.keys(after).length === Object.keys(before).length, 'musica duplicada');
        return { songId: after['E2E Acervo Gama'].id, versionId: after['E2E Acervo Gama'].draftVersionId, musicasNoCatalogo: Object.keys(after).length };
      });

      const cat = await catalogByTitle();
      const alfa = cat['E2E Acervo Alfa'];
      const beta = cat['E2E Acervo Beta'];
      const gama = cat['E2E Acervo Gama'];

      await check('9', 'Musico sem curadoria ve "Acesso restrito" no painel', async () => {
        const m = await newContext(browser);
        try {
          await m.page.goto(`${APP}/admin/acervo`, { waitUntil: 'domcontentloaded' });
          await m.page.locator('input[type="email"]').first().fill(users.member.email);
          await m.page.locator('input[type="password"]').first().fill(password);
          await m.page.locator('button[type="submit"]').first().click();
          await m.page.getByText('Acesso restrito').waitFor({ timeout: 30000 });
          await shot(m.page, '07-musico-acesso-restrito');
          return { acessoRestrito: true };
        } finally {
          await m.context.close();
        }
      });

      await check('10', 'Criterio 8: visitante sem login nao envia, nao altera, nao apaga e nao le rascunho; le so o publicado', async () => {
        const anon = (url, init = {}) => fetch(url, init).then((r) => r.status);
        const fsDoc = (p) => `${FS_DOCS()}/${p}`;
        const out = {
          putBlob: await anon(`${WORKER}/v1/catalog/blobs/${'d'.repeat(64)}`, { method: 'PUT', body: 'x' }),
          deleteBlob: await anon(`${WORKER}/v1/catalog/blobs/${material.alfa['Click.wav']}`, { method: 'DELETE' }),
          headBlob: await anon(`${WORKER}/v1/catalog/blobs/${material.alfa['Click.wav']}`, { method: 'HEAD' }),
          verify: await anon(`${WORKER}/v1/catalog/blobs/${material.alfa['Click.wav']}/verify`, { method: 'POST' }),
          publish: await anon(`${WORKER}/v1/catalog/songs/${gama.id}/publish?version=${gama.draftVersionId}`, { method: 'POST' }),
          withdraw: await anon(`${WORKER}/v1/catalog/songs/${alfa.id}/withdraw`, { method: 'POST' }),
          blobSemReferencia: await anon(`${WORKER}/v1/catalog/blobs/${material.alfa['Bateria.wav']}`),
          blobDoRascunho: await anon(`${WORKER}/v1/catalog/blobs/${material.gama[0].sha}?song=${gama.id}&version=${gama.draftVersionId}`),
          blobPublicadoComVersaoErrada: await anon(`${WORKER}/v1/catalog/blobs/${material.alfa['Bateria.wav']}?song=${alfa.id}&version=${gama.draftVersionId}`),
          blobPublicado: await anon(`${WORKER}/v1/catalog/blobs/${material.alfa['Bateria.wav']}?song=${alfa.id}&version=${alfa.currentVersionId}`),
          fsLerRascunho: await anon(fsDoc(`catalog/${gama.id}`)),
          fsLerVersaoRascunho: await anon(fsDoc(`catalog/${gama.id}/versions/${gama.draftVersionId}`)),
          fsLerPublicada: await anon(fsDoc(`catalog/${alfa.id}`)),
          fsAlterar: await anon(`${fsDoc(`catalog/${alfa.id}`)}?updateMask.fieldPaths=title`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { title: { stringValue: 'x' } } }) }),
          fsApagar: await anon(fsDoc(`catalog/${alfa.id}`), { method: 'DELETE' }),
          fsCriar: await anon(`${FS_DOCS()}/catalog?documentId=intruso`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { title: { stringValue: 'x' }, status: { stringValue: 'published' } } }) })
        };
        for (const k of ['putBlob', 'deleteBlob', 'headBlob', 'verify', 'publish', 'withdraw']) assert(out[k] === 401, `${k}: ${out[k]}`);
        assert(out.blobSemReferencia === 400, `blob sem referencia: ${out.blobSemReferencia}`);
        assert(out.blobDoRascunho === 404, `blob do rascunho servido ao visitante: ${out.blobDoRascunho}`);
        assert(out.blobPublicadoComVersaoErrada === 404, `blob servido com versao nao publicada: ${out.blobPublicadoComVersaoErrada}`);
        assert(out.blobPublicado === 200, `blob publicado: ${out.blobPublicado}`);
        for (const k of ['fsLerRascunho', 'fsLerVersaoRascunho', 'fsAlterar', 'fsApagar', 'fsCriar']) assert(out[k] === 403, `${k}: ${out[k]}`);
        assert(out.fsLerPublicada === 200, `leitura publicada: ${out.fsLerPublicada}`);
        return out;
      });

      await check('11', 'Qualidade: o que o visitante baixa e byte a byte o original (sha256 igual: L/R, silencio inicial e duracao intactos; sem normalizar)', async () => {
        const stems = await versionStems(alfa.id, alfa.currentVersionId);
        const out = [];
        for (const s of stems) {
          const buf = Buffer.from(await (await fetch(`${WORKER}/v1/catalog/blobs/${s.sha256}?song=${alfa.id}&version=${alfa.currentVersionId}`)).arrayBuffer());
          assert(sha256(buf) === s.sha256 && s.sha256 === material.alfa[s.name], `${s.name}: sha diferente`);
          assert(buf.readUInt16LE(22) === 2, `${s.name}: perdeu o estereo`);
          out.push({ nome: s.name, funcao: s.type, bytes: buf.length });
        }
        const types = Object.fromEntries(stems.map((s) => [s.name, s.type]));
        assert(types['Click.wav'] === 'click' && types['Guia.wav'] === 'guide', `funcoes: ${JSON.stringify(types)}`);
        return { stems: out };
      });

      await check('12', 'Criterios 7 e 9: janela anonima abre a biblioteca, ve so as publicadas, prepara e toca no player; reabre sem rede e toca', async () => {
        const v = await newContext(browser);
        try {
          const p = v.page;
          await p.goto(`${APP}/biblioteca`, { waitUntil: 'domcontentloaded' });
          await p.getByText('E2E Acervo Alfa').waitFor({ timeout: 30000 });
          await p.getByText('E2E Acervo Beta').waitFor({ timeout: 10000 });
          assert((await p.getByText('E2E Acervo Gama').count()) === 0, 'rascunho aparece na biblioteca publica');
          await shot(p, '08-biblioteca-anonima');
          await p.goto(`${APP}/biblioteca/${alfa.id}`, { waitUntil: 'domcontentloaded' });
          await p.getByRole('heading', { name: 'E2E Acervo Alfa' }).waitFor({ timeout: 30000 });
          await p.getByText('Tom D').waitFor();
          await p.getByText('96 BPM').waitFor();
          await shot(p, '09-pagina-da-musica');
          await Promise.all([p.waitForURL(/\/\?tocar=|\/$/, { timeout: 120000 }), p.getByRole('button', { name: /Preparar e abrir no player/ }).click()]);
          await p.getByText('E2E Acervo Alfa').first().waitFor({ timeout: 60000 });
          await playBtn(p).waitFor({ timeout: 30000 });
          await sleep(1500);
          const online = await startAndProveAudio(p);
          await shot(p, '10-player-visitante');
          await playBtn(p).click();
          await p.waitForFunction(async () => (await navigator.serviceWorker?.getRegistration())?.active?.state === 'activated', null, { timeout: 60000 });
          // Sem rede: contexto offline + tudo que for para a rede abortado. O app vem do service worker, o audio do IndexedDB.
          const aborted = [];
          await v.context.route(/^https?:\/\//, (route) => {
            aborted.push(route.request().url());
            return route.abort('internetdisconnected');
          });
          await v.context.setOffline(true);
          await p.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await p.getByText('E2E Acervo Alfa').first().waitFor({ timeout: 60000 });
          await p.locator('div', { hasText: 'E2E Acervo Alfa' }).filter({ hasNotText: 'CONSOLE' }).last().click();
          await sleep(1500);
          const offline = await startAndProveAudio(p);
          await shot(p, '11-player-offline');
          const appMisses = aborted.filter((u) => u.startsWith(APP) && !u.includes('/stems/'));
          assert(appMisses.length === 0, `recursos do app fora do cache: ${appMisses.slice(0, 5)}`);
          return { online, offline, errosDePagina: v.errs.slice(0, 5) };
        } finally {
          await v.context.close();
        }
      });

      await check('13', 'Criterio 10: retirar a versao de teste (some para o visitante, arquivos guardados) e recuperar republicando', async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByText('Acervo · biblioteca pública').waitFor({ timeout: 30000 });
        const row = page.locator('section li', { hasText: 'E2E Acervo Beta' }).last();
        await row.getByRole('button', { name: 'Retirar' }).click();
        await row.getByText('retirada').waitFor({ timeout: 30000 });
        const blobSha = material.beta['Teclado.wav'];
        const retirada = {
          catalogo: (await catalogByTitle())['E2E Acervo Beta'].status,
          fsVisitante: (await fetch(`${FS_DOCS()}/catalog/${beta.id}`)).status,
          blobVisitante: (await fetch(`${WORKER}/v1/catalog/blobs/${blobSha}?song=${beta.id}&version=${beta.currentVersionId}`)).status,
          blobCurador: (await fetch(`${WORKER}/v1/catalog/blobs/${blobSha}?song=${beta.id}&version=${beta.currentVersionId}`, { headers: { authorization: `Bearer ${await curatorToken()}` } })).status
        };
        assert(retirada.catalogo === 'withdrawn' && retirada.fsVisitante === 403 && retirada.blobVisitante === 404 && retirada.blobCurador === 200, `retirada: ${JSON.stringify(retirada)}`);
        await shot(page, '12-retirada');
        await row.getByRole('button', { name: 'Republicar' }).click();
        await row.getByText('publicada').waitFor({ timeout: 30000 });
        const volta = {
          catalogo: (await catalogByTitle())['E2E Acervo Beta'],
          blobVisitante: (await fetch(`${WORKER}/v1/catalog/blobs/${blobSha}?song=${beta.id}&version=${beta.currentVersionId}`)).status
        };
        assert(volta.catalogo.status === 'published' && volta.catalogo.currentVersionId === beta.currentVersionId && volta.blobVisitante === 200, `republicada: ${JSON.stringify(volta)}`);
        return { retirada, republicada: { status: volta.catalogo.status, mesmaVersao: true, blobVisitante: volta.blobVisitante } };
      });

      await check('14', 'Backup (D1 + audio conferido + catalogo publicado) e restauracao num Worker novo que serve a musica publicada com os mesmos bytes', async () => {
        const dest = path.join(HOME, 'backup');
        const restored = path.join(HOME, 'restaurado');
        fs.rmSync(dest, { recursive: true, force: true });
        fs.rmSync(restored, { recursive: true, force: true });
        const run = (script, args) => {
          const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
          fs.writeFileSync(path.join(HOME, `${script}.log`), `${r.stdout}\n${r.stderr}`);
          assert(r.status === 0, `${script} falhou: ${(r.stderr || r.stdout).slice(-500)}`);
          return r.stdout;
        };
        run('backup-acervo.mjs', ['--local', PERSIST, '--firestore', FS_DOCS(), '--dest', dest]);
        const summary = JSON.parse(fs.readFileSync(path.join(dest, fs.readdirSync(dest).find((f) => /^backup-.*\.json$/.test(f))), 'utf8'));
        assert(summary.audio.falhas.length === 0 && summary.audio.baixados === summary.audio.arquivos, `audio: ${JSON.stringify(summary.audio)}`);
        assert(summary.catalogo.musicasPublicadas === 2, `catalogo publicado no backup: ${summary.catalogo.musicasPublicadas}`);
        // Segunda rodada: incremental, nada baixa de novo.
        run('backup-acervo.mjs', ['--local', PERSIST, '--firestore', FS_DOCS(), '--dest', dest]);
        const again = fs.readdirSync(dest).filter((f) => /^backup-.*\.json$/.test(f)).sort().at(-1);
        const second = JSON.parse(fs.readFileSync(path.join(dest, again), 'utf8'));
        run('restore-acervo.mjs', ['--from', dest, '--para', restored]);
        const port = await freePort();
        const inspector = await freePort();
        const wdir = path.join(ROOT, 'workers/stems');
        start('worker-restaurado', process.execPath, [path.join(wdir, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--port', String(port), '--ip', '127.0.0.1', '--inspector-port', String(inspector), '--persist-to', restored,
          '--var', `FIREBASE_PROJECT_ID:${PROJECT}`, '--var', `FIRESTORE_BASE:http://${FS_HOST}`, '--var', 'AUTH_EMULATOR:true', '--var', `ALLOWED_ORIGINS:${APP}`, '--var', 'VERSION:restaurado'], { cwd: wdir, env: { WRANGLER_SEND_METRICS: 'false', CI: 'true' } });
        await waitHttp(`http://127.0.0.1:${port}/`, 'Worker restaurado');
        const served = [];
        for (const [name, sha] of Object.entries(material.alfa)) {
          const r = await fetch(`http://127.0.0.1:${port}/v1/catalog/blobs/${sha}?song=${alfa.id}&version=${alfa.currentVersionId}`);
          const buf = Buffer.from(await r.arrayBuffer());
          assert(r.status === 200 && sha256(buf) === sha, `${name} restaurado: ${r.status}`);
          served.push(name);
        }
        const draft = await fetch(`http://127.0.0.1:${port}/v1/catalog/blobs/${material.gama[0].sha}?song=${gama.id}&version=${gama.draftVersionId}`);
        assert(draft.status === 404, `rascunho servido apos restaurar: ${draft.status}`);
        return {
          backup: { arquivos: summary.audio.arquivos, bytes: summary.audio.bytes, publicadas: summary.catalogo.musicasPublicadas, d1Bytes: summary.d1.bytes },
          incremental: { baixados: second.audio.baixados, jaNoBackup: second.audio.jaNoBackup },
          restaurado: { servidosComMesmoSha: served, rascunhoContinuaPrivado: true }
        };
      });

      await admin.context.close();
    } finally {
      await browser.close();
    }
  } finally {
    staticSrv?.closeAllConnections?.();
    staticSrv?.close();
    killAll();
    fs.writeFileSync(path.join(HOME, 'resultado.json'), JSON.stringify({ results }, null, 2));
  }
}

let exit = 0;
try {
  await main();
} catch (e) {
  exit = 1;
  console.error(`E2E ACERVO FALHOU: ${String(e?.message ?? e)}`);
}
killAll();
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nRESUMO: ${pass} PASS, ${results.length - pass} FAIL de ${results.length} etapas; evidencias em ${HOME}`);
process.exit(exit);
