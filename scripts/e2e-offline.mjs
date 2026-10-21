// E2E offline do build de PRODUCAO (service worker + IndexedDB), 100% local (emuladores; nada de nuvem real).
//   npm run e2e:offline                 fluxo completo
//   npm run e2e:offline -- --without-sw controle: mesmo roteiro com o service worker bloqueado (DEVE falhar na etapa offline)
//   npm run e2e:offline -- --reuse-build reaproveita os dois builds da execucao anterior (mesmas portas)
// Roteiro: builda v1 e v2 (tags diferentes) -> sobe Auth+Firestore (emuladores), Worker de stems (wrangler dev local) e um
// servidor estatico do dist -> semeia igreja, 2 usuarios, 2 musicas SINTETICAS (WAV gerado aqui, nada do acervo) e um culto
// -> perfil persistente: abre online, loga, prepara o culto, confere SW ativo + precache vs dist + stems no IndexedDB
// -> fecha, REABRE no mesmo perfil com rede cortada (offline no contexto + servidor estatico derrubado + rotas abortadas)
// e toca -> atualizacao v2 durante a reproducao (nao recarrega, aviso so apos parar, aplicar funciona).
// Login Google real NAO e coberto (acao do Samuel; homologacao pendente). Evidencias em %LOCALAPPDATA%\lagoinha-vs\e2e-offline\.
import { spawn, spawnSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
const HOME = process.env.LAGOINHA_E2E_HOME ?? path.join(LOCAL, 'lagoinha-vs', 'e2e-offline');
const WITHOUT_SW = process.argv.includes('--without-sw');
const REUSE = process.argv.includes('--reuse-build');
const PROJECT = 'demo-lagoinha';
const CHURCH = 'lagoinha-jp';
const PROFILE = path.join(HOME, 'perfil');
const DIST1 = path.join(HOME, 'dist-v1');
const DIST2 = path.join(HOME, 'dist-v2');
const TAG1 = 'e2e-v1';
const TAG2 = 'e2e-v2';

const results = [];
const children = [];
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => {
  if (!cond) throw new Error(`assercao falhou: ${msg}`);
};
async function check(step, name, fn) {
  try {
    const evidence = (await fn()) ?? {};
    results.push({ step, name, status: 'PASS', evidence });
    log(`PASS ${step} ${name} ${JSON.stringify(evidence).slice(0, 700)}`);
    return evidence;
  } catch (e) {
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

// ---------------------------------------------------------------- servidor estatico (raiz trocavel)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const staticServer = { server: null, root: DIST1, hits: 0, port: 0 };
function listen(port) {
  const server = http.createServer((req, res) => {
    staticServer.hits++;
    const url = new URL(req.url ?? '/', 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(staticServer.root, rel);
    if (!file.startsWith(staticServer.root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('404');
    }
    const headers = { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' };
    if (/(^|\/)(sw\.js|index\.html)$/.test(rel)) headers['cache-control'] = 'no-cache';
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
async function startStatic(root) {
  staticServer.root = root;
  staticServer.server = await listen(staticServer.port);
}
async function stopStatic() {
  const s = staticServer.server;
  staticServer.server = null;
  if (!s) return;
  s.closeAllConnections?.();
  await new Promise((r) => s.close(r));
}

// ---------------------------------------------------------------- Firebase (emuladores) via REST
let AUTH;
let FS_HOST;
let WORKER;
let APP;
let toFields;
const FS_DOCS = () => `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function authCall(op, body) {
  const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${op}?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`auth ${op}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
async function fsOwner(docPath, data) {
  const res = await fetch(`${FS_DOCS()}/${docPath}`, { method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: toFields(data) }) });
  if (!res.ok) throw new Error(`firestore PATCH ${docPath}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/** WAV mono 16-bit sintetico (seno), decodificavel por decodeAudioData. Nada do acervo real. */
function makeWav(freq, seconds, rate = 22050) {
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 9000), 44 + i * 2);
  return buf;
}

// ---------------------------------------------------------------- navegador
const AUDIO_SPY = `(() => {
  const Orig = window.AudioContext;
  window.__acs = [];
  window.AudioContext = class extends Orig { constructor(...a) { super(...a); window.__acs.push(this); } };
})();`;

async function openContext(pw, { offline = false, serviceWorkers = 'allow' } = {}) {
  const context = await pw.chromium.launchPersistentContext(PROFILE, {
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: ['--autoplay-policy=no-user-gesture-required'],
    serviceWorkers,
    offline,
  });
  await context.addInitScript(AUDIO_SPY);
  const net = { aborted: [], consoleErrors: [], pageErrors: [] };
  if (offline) {
    // Bloqueio no nivel do contexto: tudo que chegar a rede e abortado e contado. O que o service worker responde
    // do cache nao passa por aqui (o Playwright nao intercepta o que o SW atende).
    await context.route(/^https?:\/\//, (route) => {
      net.aborted.push(route.request().url());
      return route.abort('internetdisconnected');
    });
    await context.setOffline(true);
  }
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (m) => m.type() === 'error' && net.consoleErrors.push(m.text().slice(0, 300)));
  page.on('pageerror', (e) => net.pageErrors.push(String(e).slice(0, 300)));
  return { context, page, net };
}

async function login(page, email, password) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.getByText('BANCO DE VS').first().waitFor({ timeout: 30000 });
}
async function swState(page) {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    return {
      supported: 'serviceWorker' in navigator,
      controlled: !!navigator.serviceWorker?.controller,
      active: reg?.active?.state ?? null,
      waiting: reg?.waiting?.state ?? null,
      installing: reg?.installing?.state ?? null,
      script: reg?.active?.scriptURL ?? null,
    };
  });
}
async function waitSwActive(page, timeout = 60000) {
  await page.waitForFunction(async () => (await navigator.serviceWorker?.getRegistration())?.active?.state === 'activated', null, { timeout });
}
/** URLs do cache de precache do Workbox + nomes de todos os caches. */
async function cacheReport(page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const n of names) for (const r of await (await caches.open(n)).keys()) urls.push({ cache: n, url: r.url });
    return { names, urls };
  });
}
async function deviceStorage(page) {
  return page.evaluate(async () => {
    const dbs = (await indexedDB.databases()).map((d) => d.name).filter((n) => n && !/firebase/i.test(n));
    const out = {};
    for (const name of dbs) {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      out[name] = {};
      for (const store of Array.from(db.objectStoreNames)) {
        const keys = await new Promise((res) => {
          const r = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
          r.onsuccess = () => res(r.result.map(String));
        });
        out[name][store] = { count: keys.length, cloud: keys.filter((k) => k.includes('cloud:')) };
      }
      db.close();
    }
    return out;
  });
}
const cloudKeys = (storage) => [...new Set(Object.values(storage).flatMap((s) => Object.values(s).flatMap((v) => v.cloud)))];
const statusChip = (page) => page.locator('[data-testid="pwa-status"]');
const playBtn = (page) => page.locator('button[title^="Reproduzir"]').first();
async function audioClock(page) {
  return page.evaluate(() => (window.__acs ?? []).map((c) => ({ state: c.state, t: c.currentTime })));
}
/** Aperta Play e prova que ha AudioContext rodando com o relogio avancando (>= 1,5 s em 2,5 s). */
async function startAndProveAudio(page) {
  const before = await playBtn(page).innerText();
  await playBtn(page).click();
  const deadline = Date.now() + 20000;
  while ((await playBtn(page).innerText()) === before && Date.now() < deadline) await sleep(300);
  const a = await audioClock(page);
  await sleep(2500);
  const b = await audioClock(page);
  const running = b.filter((c, i) => c.state === 'running' && a[i] && c.t - a[i].t >= 1.5);
  assert(running.length >= 1, `nenhum AudioContext rodando com tempo avancando: antes=${JSON.stringify(a)} depois=${JSON.stringify(b)}`);
  return { botaoAntes: before, botaoTocando: await playBtn(page).innerText(), contextos: b.length, avancoDoRelogio: Number((running[0].t - a[b.indexOf(running[0])].t).toFixed(2)) };
}
async function stopPlayback(page) {
  const playingLabel = await playBtn(page).innerText();
  await playBtn(page).click();
  const deadline = Date.now() + 10000;
  while ((await playBtn(page).innerText()) === playingLabel && Date.now() < deadline) await sleep(200);
}
async function openPreparedSong(page, title) {
  await page.locator('div', { hasText: title }).filter({ hasNotText: 'CONSOLE' }).last().click();
  await sleep(1200);
}

// ---------------------------------------------------------------- build
function buildApp(tag, outDir, env) {
  fs.rmSync(outDir, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'e2e', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: ROOT,
    env: { ...process.env, ...env, LAGOINHA_BUILD_TAG: tag },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(HOME, `build-${tag}.log`), `${r.stdout}\n${r.stderr}`);
  assert(r.status === 0, `vite build ${tag} falhou: ${(r.stderr || r.stdout).slice(-400)}`);
  // public/stems (faixas de desenvolvimento, fora do git) vai junto no dist local; sai para o teste comparar so o que o SW deve ter.
  fs.rmSync(path.join(outDir, 'stems'), { recursive: true, force: true });
}
function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]));
}
const PRECACHE_EXT = /\.(html|js|mjs|css|svg|png|ico|webmanifest|woff2?|ttf|wasm)$/;
const expectedPrecache = (dir) => walk(dir).filter((f) => PRECACHE_EXT.test(f) && f !== 'sw.js' && !/^workbox-[^/]*\.js$/.test(f) && !f.startsWith('stems/'));

// ---------------------------------------------------------------- roteiro
async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(HOME, { recursive: true });
  const portsFile = path.join(HOME, 'ports.json');
  let ports;
  if (REUSE && fs.existsSync(portsFile)) ports = JSON.parse(fs.readFileSync(portsFile, 'utf8'));
  else ports = { auth: await freePort(), fs: await freePort(), fsWs: await freePort(), hub: await freePort(), logging: await freePort(), worker: await freePort(), inspector: await freePort(), app: await freePort() };
  for (const p of [ports.auth, ports.fs, ports.worker, ports.app]) assert(!(await portOpen(p)), `porta ${p} ocupada (apague ${portsFile} para sortear outras)`);
  fs.writeFileSync(portsFile, JSON.stringify(ports));
  AUTH = `127.0.0.1:${ports.auth}`;
  FS_HOST = `127.0.0.1:${ports.fs}`;
  WORKER = `http://127.0.0.1:${ports.worker}`;
  APP = `http://127.0.0.1:${ports.app}`;
  staticServer.port = ports.app;
  ({ toFields } = await import(pathToFileURL(path.join(ROOT, 'tools/migrator/src/targets/registry-firestore.mjs'))));
  const password = `E2e-${crypto.randomBytes(9).toString('base64url')}`;
  const users = { admin: { email: 'admin@e2e.local', name: 'Admin E2E', role: 'admin' }, member: { email: 'integrante@e2e.local', name: 'Integrante E2E', role: 'musician' } };
  const songsMeta = [
    { id: 'e2e-song-um', title: 'E2E Louvor Um', stems: [['Bateria', 'drums', 220], ['Baixo', 'bass', 110], ['Click', 'click', 880]] },
    { id: 'e2e-song-dois', title: 'E2E Louvor Dois', stems: [['Bateria', 'drums', 196], ['Baixo', 'bass', 98], ['Click', 'click', 880]] },
  ];
  const culto = { id: 'e2e-culto', title: 'Culto E2E Offline' };
  const buildEnv = {
    VITE_BACKEND: 'firebase',
    VITE_FIREBASE_API_KEY: 'demo-key',
    VITE_FIREBASE_PROJECT_ID: PROJECT,
    VITE_FIREBASE_AUTH_EMULATOR: AUTH,
    VITE_FIREBASE_FIRESTORE_EMULATOR: FS_HOST,
    VITE_STEMS_WORKER_URL: WORKER,
  };

  try {
    await check('1', 'Build de producao v1 e v2 (tags diferentes) com SW; sem stems de desenvolvimento no dist', async () => {
      if (!(REUSE && fs.existsSync(path.join(DIST1, 'sw.js')) && fs.existsSync(path.join(DIST2, 'sw.js')))) {
        buildApp(TAG1, DIST1, buildEnv);
        buildApp(TAG2, DIST2, buildEnv);
      }
      for (const d of [DIST1, DIST2]) assert(fs.existsSync(path.join(d, 'sw.js')) && fs.existsSync(path.join(d, 'manifest.webmanifest')), `${d} sem sw.js/manifest`);
      const h1 = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST1, 'sw.js'))).digest('hex');
      const h2 = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST2, 'sw.js'))).digest('hex');
      assert(h1 !== h2, 'sw.js de v1 e v2 iguais: o update nao seria detectado');
      return { arquivosPrecacheV1: expectedPrecache(DIST1).length, arquivosPrecacheV2: expectedPrecache(DIST2).length, swDiferente: true };
    });

    await check('2', 'Emuladores Auth+Firestore, Worker de stems local e servidor estatico do dist v1 (portas livres sorteadas)', async () => {
      const jh = javaHome();
      const env = jh ? { JAVA_HOME: jh, PATH: `${path.join(jh, 'bin')}${path.delimiter}${process.env.PATH}` } : {};
      const cfg = path.join(HOME, 'firebase.e2e.json');
      fs.writeFileSync(cfg, JSON.stringify({
        firestore: { rules: path.join(ROOT, 'firestore.rules').split(path.sep).join('/') },
        emulators: { singleProjectMode: true, hub: { host: '127.0.0.1', port: ports.hub }, logging: { host: '127.0.0.1', port: ports.logging }, auth: { host: '127.0.0.1', port: ports.auth }, firestore: { host: '127.0.0.1', port: ports.fs, websocketPort: ports.fsWs }, ui: { enabled: false } },
      }));
      start('emuladores', process.execPath, [path.join(ROOT, 'node_modules/firebase-tools/lib/bin/firebase.js'), 'emulators:start', '--config', cfg, '--only', 'auth,firestore', '--project', PROJECT], { env });
      await waitPort(ports.auth, 'Auth emulator');
      await waitPort(ports.fs, 'Firestore emulator');
      const wdir = path.join(ROOT, 'workers/stems');
      const wrangler = path.join(wdir, 'node_modules/wrangler/bin/wrangler.js');
      const persist = path.join(HOME, 'wrangler-state');
      fs.rmSync(persist, { recursive: true, force: true });
      const wenv = { WRANGLER_SEND_METRICS: 'false', CI: 'true' };
      const mig = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'lagoinha-vs-stems-registry', '--local', '--persist-to', persist], { cwd: wdir, env: { ...process.env, ...wenv }, encoding: 'utf8' });
      fs.writeFileSync(path.join(HOME, 'worker-migrations.log'), `${mig.stdout}\n${mig.stderr}`);
      assert(mig.status === 0, 'migracoes D1 locais falharam (worker-migrations.log)');
      start('worker', process.execPath, [wrangler, 'dev', '--port', String(ports.worker), '--ip', '127.0.0.1', '--inspector-port', String(ports.inspector), '--persist-to', persist,
        '--var', `FIREBASE_PROJECT_ID:${PROJECT}`, '--var', `FIRESTORE_BASE:http://${FS_HOST}`, '--var', 'AUTH_EMULATOR:true', '--var', `ALLOWED_ORIGINS:${APP}`], { cwd: wdir, env: wenv });
      await waitHttp(`${WORKER}/`, 'Worker');
      await startStatic(DIST1);
      const html = await (await fetch(APP)).text();
      assert(html.includes('<div id="root"'), 'servidor estatico nao serviu o app');
      return { portas: ports };
    });

    await check('3', 'Semear igreja, admin e integrante, 2 musicas sinteticas (6 stems WAV via Worker), versoes e culto publicado', async () => {
      await fsOwner(`churches/${CHURCH}`, { name: 'Lagoinha E2E', city: 'Joao Pessoa' });
      for (const u of Object.values(users)) {
        const r = await authCall('signUp', { email: u.email, password, displayName: u.name, returnSecureToken: true });
        u.uid = r.localId;
        await fsOwner(`churches/${CHURCH}/members/${u.uid}`, { role: u.role, status: 'active', displayName: u.name, createdAt: new Date() });
        await fsOwner(`users/${u.uid}`, { displayName: u.name, primaryChurchId: CHURCH, createdAt: new Date() });
      }
      const admin = await authCall('signInWithPassword', { email: users.admin.email, password, returnSecureToken: true });
      const items = [];
      let blobs = 0;
      let bytes = 0;
      for (const [i, s] of songsMeta.entries()) {
        const stems = [];
        for (const [name, type, freq] of s.stems) {
          const wav = makeWav(freq, 8);
          const sha = crypto.createHash('sha256').update(wav).digest('hex');
          const res = await fetch(`${WORKER}/v1/churches/${CHURCH}/blobs/${sha}`, { method: 'PUT', headers: { authorization: `Bearer ${admin.idToken}`, 'content-type': 'audio/wav', 'x-original-name': `${name}.wav` }, body: wav });
          assert(res.status === 201 || res.status === 200, `PUT blob ${res.status}`);
          stems.push({ sha256: sha, name, type, size: wav.length, contentType: 'audio/wav' });
          blobs++;
          bytes += wav.length;
        }
        const versionId = `v${crypto.createHash('sha256').update(JSON.stringify(stems.map((x) => x.sha256))).digest('hex').slice(0, 20)}`;
        const now = new Date();
        await fsOwner(`churches/${CHURCH}/library/${s.id}`, {
          title: s.title, artist: 'Sintetico', kind: 'song', originalKey: 'G', bpm: 90, timeSignature: { beats: 4, value: 4 }, durationSec: 8, tags: [], rightsClass: 'own',
          currentVersionId: versionId, status: 'ready', pendingReason: null, source: { kind: 'manual' }, createdAt: now, updatedAt: now,
        });
        await fsOwner(`churches/${CHURCH}/library/${s.id}/versions/${versionId}`, { createdAt: now, createdBy: admin.localId, changelog: 'E2E offline', sections: [], stems });
        items.push({ order: i + 1, source: 'church', songId: s.id, versionId });
      }
      await fsOwner(`churches/${CHURCH}/setlists/${culto.id}`, { title: culto.title, serviceDate: '2026-10-25', status: 'published', revision: 1, updatedBy: admin.localId, updatedAt: new Date(), items });
      culto.items = items;
      return { musicas: songsMeta.length, stemsNoWorker: blobs, bytesSinteticos: bytes };
    });

    const pw = await loadPlaywright();
    const swMode = WITHOUT_SW ? 'block' : 'allow';
    let preparedKeys = [];

    // ---- sessao 1: online, perfil persistente
    {
      const s = await openContext(pw, { serviceWorkers: swMode });
      try {
        await check('4', `Online: abre o build v1, loga (Auth emulador) e ${WITHOUT_SW ? '[CONTROLE] SW bloqueado' : 'o service worker fica ativo com precache completo'}`, async () => {
          await login(s.page, users.member.email, password);
          if (WITHOUT_SW) return { swBloqueado: true, estado: await swState(s.page) };
          await waitSwActive(s.page);
          await s.page.waitForFunction(() => document.querySelector('[data-testid="pwa-status"]')?.getAttribute('data-shell') === 'ready', null, { timeout: 30000 });
          const state = await swState(s.page);
          const cr = await cacheReport(s.page);
          const precacheNames = cr.names.filter((n) => /precache/.test(n));
          assert(precacheNames.length === 1 && cr.names.length === 1, `caches inesperados (so o precache e permitido): ${JSON.stringify(cr.names)}`);
          const origins = new Set(cr.urls.map((u) => new URL(u.url).origin));
          assert(origins.size === 1 && origins.has(APP), `cache com origem de fora do app (Firebase/Worker nao podem ser cacheados): ${[...origins]}`);
          const cached = new Set(cr.urls.map((u) => new URL(u.url).pathname.replace(/^\//, '') || 'index.html'));
          const expected = expectedPrecache(DIST1);
          const missing = expected.filter((f) => !cached.has(f) && !(f === 'index.html' && cached.has('')));
          const extra = [...cached].filter((f) => !expected.includes(f));
          assert(missing.length === 0, `faltam no precache: ${missing.slice(0, 8).join(', ')}`);
          assert(extra.length === 0, `no cache mas fora do dist: ${extra.slice(0, 8).join(', ')}`);
          const chunks = expected.filter((f) => f.startsWith('assets/') && f.endsWith('.js')).length;
          return { sw: state, urlsNoCache: cr.urls.length, arquivosNoDist: expected.length, faltando: 0, jsChunks: chunks, cacheNomes: cr.names };
        });

        await check('5', 'Online: prepara o culto completo (Preparar e abrir offline) e confere stems no IndexedDB e o indicador de culto', async () => {
          const page = s.page;
          await page.getByText('BANCO DE VS').first().click();
          await page.getByText('Banco de VS na Nuvem').first().waitFor({ timeout: 15000 });
          await page.getByText('Cultos da Igreja').first().click();
          const card = page.locator('div', { has: page.getByText(culto.title, { exact: true }) }).filter({ has: page.getByRole('button', { name: /Preparar e abrir offline/ }) }).last();
          await card.waitFor({ timeout: 20000 });
          await card.getByRole('button', { name: /Preparar e abrir offline/ }).click();
          await page.getByText('Banco de VS na Nuvem').first().waitFor({ state: 'hidden', timeout: 90000 });
          const storage = await deviceStorage(page);
          preparedKeys = cloudKeys(storage);
          for (const [i, m] of songsMeta.entries()) {
            const key = `cloud:church:${m.id}@${culto.items[i].versionId}`;
            assert(preparedKeys.some((k) => k.startsWith(key)), `IndexedDB sem a musica ${key}: ${JSON.stringify(preparedKeys)}`);
          }
          const stemKeys = preparedKeys.filter((k) => !/^cloud:church:[^@]+@[^@:]+$/.test(k));
          assert(preparedKeys.length >= 2, 'menos de 2 chaves de acervo no IndexedDB');
          await page.waitForFunction(() => document.querySelector('[data-testid="pwa-status"]')?.getAttribute('data-prepared') === '2', null, { timeout: 10000 });
          const chipText = await statusChip(page).innerText();
          assert(/Culto preparado no aparelho: 2/.test(chipText), `indicador: ${chipText}`);
          if (!WITHOUT_SW) assert(/App dispon[ií]vel offline/.test(chipText), `indicador do app: ${chipText}`);
          return { chavesNoIndexedDB: preparedKeys, chavesDeStem: stemKeys.length, indicador: chipText.replace(/\n/g, ' | ') };
        });

        await check('6', 'Online: toca uma musica preparada (AudioContext running, relogio avancando)', async () => {
          await openPreparedSong(s.page, songsMeta[0].title);
          const r = await startAndProveAudio(s.page);
          await stopPlayback(s.page);
          return r;
        });
      } finally {
        await s.context.close();
      }
    }

    // ---- sessao 2: MESMO perfil, rede desligada, servidor do app derrubado
    await stopStatic();
    await check('7', `OFFLINE${WITHOUT_SW ? ' [CONTROLE sem SW: deve falhar aqui]' : ''}: reabre o MESMO perfil sem rede (contexto offline + servidor do app derrubado + rotas abortadas), acessa o culto e toca`, async () => {
      const s = await openContext(pw, { offline: true, serviceWorkers: swMode });
      try {
        await s.page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await s.page.getByText('BANCO DE VS').first().waitFor({ timeout: 30000 });
        const state = await swState(s.page);
        if (!WITHOUT_SW) assert(state.controlled && state.active === 'activated', `SW nao esta controlando a pagina offline: ${JSON.stringify(state)}`);
        const online = await s.page.evaluate(() => navigator.onLine);
        assert(online === false, 'navigator.onLine deveria ser false');
        const storage = await deviceStorage(s.page);
        const keys = cloudKeys(storage);
        assert(preparedKeys.every((k) => keys.includes(k)), `IndexedDB perdeu chaves: ${JSON.stringify(keys)}`);
        const chip = await statusChip(s.page).innerText();
        assert(/Culto preparado no aparelho: 2/.test(chip), `indicador offline: ${chip}`);
        // modal carregado sob demanda: o chunk vem do precache
        await s.page.getByText('BANCO DE VS').first().click();
        await s.page.getByText('Banco de VS na Nuvem').first().waitFor({ timeout: 15000 });
        await s.page.locator('button:has(svg.lucide-x)').first().click();
        await s.page.getByText('Banco de VS na Nuvem').first().waitFor({ state: 'hidden', timeout: 10000 });
        await openPreparedSong(s.page, songsMeta[1].title);
        const play = await startAndProveAudio(s.page);
        const appAborted = s.net.aborted.filter((u) => u.startsWith(APP) && !u.startsWith(`${APP}/stems/`));
        const presetStems = s.net.aborted.filter((u) => u.startsWith(`${APP}/stems/`)).length;
        assert(appAborted.length === 0, `recursos do app que o SW nao tinha: ${appAborted.join(', ')}`);
        const hosts = [...new Set(s.net.aborted.map((u) => new URL(u).host))];
        return { sw: state, navigatorOnLine: online, chavesNoIndexedDB: keys.length, indicador: chip.replace(/\n/g, ' | '), reproducao: play, requisicoesAbortadasPorHost: hosts, faixasDePresetDeDev_publicStems_foraDoGit: presetStems };
      } finally {
        await s.context.close();
      }
    });

    if (WITHOUT_SW) return;

    // ---- sessao 3: atualizacao v2 durante a reproducao
    await startStatic(DIST1);
    {
      const s = await openContext(pw);
      try {
        await s.page.goto(APP, { waitUntil: 'domcontentloaded' });
        await s.page.getByText('BANCO DE VS').first().waitFor({ timeout: 30000 });
        await waitSwActive(s.page);
        await check('8', 'Atualizacao v2 com reproducao ativa: o app NAO recarrega, nao ha aviso; aviso so aparece depois de parar', async () => {
          const page = s.page;
          await openPreparedSong(page, songsMeta[0].title);
          assert((await statusChip(page).getAttribute('title')).includes(TAG1), 'a pagina deveria estar no build v1');
          await page.evaluate(() => {
            window.__marker = 'sem-reload';
          });
          const play = await startAndProveAudio(page);
          // publica a v2 (mesma origem) e provoca a checagem de atualizacao
          staticServer.root = DIST2;
          await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
          await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 30000 });
          await page.waitForFunction(() => document.querySelector('[data-testid="pwa-status"]')?.getAttribute('data-update-pending') === 'true', null, { timeout: 15000 });
          await sleep(4000);
          const still = await page.evaluate(() => ({ marker: window.__marker, navs: performance.getEntriesByType('navigation').length }));
          assert(still.marker === 'sem-reload', 'a pagina recarregou sozinha com a reproducao ativa');
          assert((await page.locator('[data-testid="pwa-update"]').count()) === 0, 'aviso de atualizacao apareceu durante a reproducao');
          const clock = await audioClock(page);
          assert(clock.some((c) => c.state === 'running'), 'o audio parou durante a atualizacao');
          await stopPlayback(page);
          await page.locator('[data-testid="pwa-update"]').waitFor({ timeout: 10000 });
          assert((await statusChip(page).getAttribute('title')).includes(TAG1), 'ainda deveria estar na v1 antes de aceitar');
          return { reproducao: play, swEmEspera: true, semRecarga: true, avisoDuranteReproducao: 0, avisoAposParar: true, tagAntes: TAG1 };
        });
        await check('9', 'Aplicar atualizacao: recarrega na v2, culto preparado segue no aparelho e a v2 abre offline', async () => {
          const page = s.page;
          await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.getByRole('button', { name: 'Atualizar agora' }).click()]);
          await page.getByText('BANCO DE VS').first().waitFor({ timeout: 30000 });
          await page.waitForFunction((tag) => document.querySelector('[data-testid="pwa-status"]')?.getAttribute('title')?.includes(tag), TAG2, { timeout: 30000 });
          await waitSwActive(page);
          assert((await page.locator('[data-testid="pwa-update"]').count()) === 0, 'aviso ainda aberto apos atualizar');
          const keys = cloudKeys(await deviceStorage(page));
          assert(preparedKeys.every((k) => keys.includes(k)), 'stems preparados sumiram na atualizacao');
          const cr = await cacheReport(page);
          const cached = new Set(cr.urls.map((u) => new URL(u.url).pathname.replace(/^\//, '') || 'index.html'));
          const missing = expectedPrecache(DIST2).filter((f) => !cached.has(f) && !(f === 'index.html' && cached.has('')));
          assert(missing.length === 0, `precache da v2 incompleto: ${missing.slice(0, 6)}`);
          const extra = [...cached].filter((f) => !expectedPrecache(DIST2).includes(f));
          assert(extra.length === 0, `cache com restos da v1: ${extra.slice(0, 6)}`);
          return { tagDepois: TAG2, chavesNoIndexedDB: keys.length, urlsNoCache: cr.urls.length, restosDaV1: 0 };
        });
      } finally {
        await s.context.close();
      }
    }
    await stopStatic();
    await check('10', 'v2 offline: reabre sem rede e sem servidor, na v2, e toca', async () => {
      const s = await openContext(pw, { offline: true });
      try {
        await s.page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await s.page.getByText('BANCO DE VS').first().waitFor({ timeout: 30000 });
        assert((await statusChip(s.page).getAttribute('title')).includes(TAG2), 'offline nao abriu a v2');
        await openPreparedSong(s.page, songsMeta[0].title);
        const play = await startAndProveAudio(s.page);
        assert(s.net.aborted.filter((u) => u.startsWith(APP) && !u.startsWith(`${APP}/stems/`)).length === 0, 'v2 pediu recurso do app fora do cache');
        return { versao: TAG2, reproducao: play };
      } finally {
        await s.context.close();
      }
    });
  } finally {
    await stopStatic().catch(() => undefined);
    killAll();
    fs.writeFileSync(path.join(HOME, 'resultado.json'), JSON.stringify({ modo: WITHOUT_SW ? 'sem-sw' : 'completo', results }, null, 2));
  }
}

let exit = 0;
try {
  await main();
} catch (e) {
  exit = 1;
  console.error(`E2E OFFLINE FALHOU${WITHOUT_SW ? ' (esperado no controle sem service worker)' : ''}: ${String(e?.message ?? e)}`);
}
killAll();
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nRESUMO ${WITHOUT_SW ? '[sem SW]' : '[completo]'}: ${pass} PASS, ${results.length - pass} FAIL de ${results.length} etapas; evidencias em ${HOME}`);
process.exit(exit);
