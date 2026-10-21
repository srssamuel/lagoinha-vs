// Demo ponta a ponta 100% local do acervo migrado (emuladores; nada de nuvem real).
//   node scripts/demo-e2e.mjs
// Sobe Firebase Auth+Firestore (projeto demo-lagoinha), o Worker de stems (wrangler dev, D1/R2 locais) e o Vite com
// variaveis de emulador; semeia igreja e dois usuarios; roda o migrador (alvos worker+firestore) sobre o piloto
// do manifesto; percorre o app pelo Playwright (admin publica o culto, integrante prepara e abre offline); publica uma versao
// nova; repete o fluxo numa sessao limpa com o Drive bloqueado por rota. Derruba tudo no finally.
// Evidencias (screenshots, JSON, logs) em %LOCALAPPDATA%\lagoinha-vs\demo\. Nada daqui aponta para o Drive: a origem do
// piloto (G:) e so lida pelo migrador. Nomes de musicas ficam so nas evidencias locais, nunca no git.
import { spawn, spawnSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
const DEMO = process.env.LAGOINHA_DEMO_HOME ?? path.join(LOCAL, 'lagoinha-vs', 'demo');
const SRC_MIGRATION = path.join(LOCAL, 'lagoinha-vs', 'migracao');
const EVID = path.join(DEMO, 'evidencias');
const MIG = path.join(DEMO, 'migracao');

const PROJECT = 'demo-lagoinha';
const CHURCH = 'lagoinha-jp';
const AUTH = '127.0.0.1:9099';
const FS_HOST = '127.0.0.1:8080';
const WORKER_PORT = 8788;
const VITE_PORT = 5199;
const APP = `http://127.0.0.1:${VITE_PORT}`;
const WORKER = `http://127.0.0.1:${WORKER_PORT}`;
const FS_DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

const results = [];
const children = [];
const liveSessions = [];
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`);

function record(step, name, status, evidence = {}) {
  results.push({ step, name, status, evidence });
  log(`${status} ${step} ${name} ${JSON.stringify(evidence).slice(0, 400)}`);
}
async function check(step, name, fn) {
  try {
    const evidence = await fn();
    record(step, name, 'PASS', evidence ?? {});
    return evidence;
  } catch (e) {
    const diag = {};
    for (const s of liveSessions) {
      try {
        await s.page.screenshot({ path: path.join(EVID, `FALHA-${step}-${s.net.label}.png`) });
      } catch {
        /* pagina fechada */
      }
      diag[s.net.label] = { console: s.net.consoleErrors.slice(-6), pageErrors: s.net.pageErrors.slice(-4), httpErros: s.net.httpErrors.slice(-8) };
    }
    record(step, name, 'FAIL', { error: String(e?.message ?? e).slice(0, 600), diag });
    throw e;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => {
  if (!cond) throw new Error(`assercao falhou: ${msg}`);
};

// ---------------------------------------------------------------- processos
function start(name, cmd, args, { cwd = ROOT, env = {} } = {}) {
  const out = fs.openSync(path.join(DEMO, `${name}.log`), 'w');
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', out, out], windowsHide: true });
  child.on('error', (e) => log(`processo ${name}: ${e.message}`));
  children.push({ name, child });
  return child;
}
function killAll() {
  for (const { child } of children.reverse()) {
    if (child.exitCode === null && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  }
}
function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.connect({ port, host }, () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => resolve(false));
  });
}
async function waitPort(port, label, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await portOpen(port)) return;
    await sleep(500);
  }
  throw new Error(`${label} nao abriu a porta ${port} em ${ms / 1000}s (veja ${DEMO})`);
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

// ---------------------------------------------------------------- Firebase (emuladores) via REST
const SECURETOKEN = `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts`;
async function authCall(op, body) {
  const res = await fetch(`${SECURETOKEN}:${op}?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`auth ${op}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
const toFields = (await import(pathToFileURL(path.join(ROOT, 'tools/migrator/src/targets/registry-firestore.mjs')))).toFields;
const fromFields = (await import(pathToFileURL(path.join(ROOT, 'tools/migrator/src/targets/registry-firestore.mjs')))).fromFields;

/** token "owner" do emulador: ignora as regras (semeadura e leitura de conferencia). */
async function fsOwner(method, docPath, data) {
  const res = await fetch(`${FS_DOCS}/${docPath}`, {
    method,
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: data ? JSON.stringify({ fields: toFields(data) }) : undefined,
  });
  if (!res.ok && res.status !== 404) throw new Error(`firestore ${method} ${docPath}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 404 ? null : res.json();
}
async function fsList(collectionPath, token = 'owner') {
  const res = await fetch(`${FS_DOCS}/${collectionPath}?pageSize=200`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`firestore list ${collectionPath}: ${res.status}`);
  return ((await res.json()).documents ?? []).map((d) => ({ id: d.name.split('/').pop(), ...fromFields(d.fields ?? {}) }));
}

// ---------------------------------------------------------------- migracao: copia do manifesto com o piloto reaberto
function prepareManifest() {
  fs.rmSync(MIG, { recursive: true, force: true });
  fs.mkdirSync(MIG, { recursive: true });
  for (const f of ['config.json', 'manifest.db']) {
    const src = path.join(SRC_MIGRATION, f);
    if (!fs.existsSync(src)) throw new Error(`falta ${src}: rode antes o inventario e o piloto local do migrador`);
    fs.copyFileSync(src, path.join(MIG, f)); // o original nao e tocado
  }
  const db = new DatabaseSync(path.join(MIG, 'manifest.db'));
  try {
    const saved = db.prepare(`SELECT value FROM meta WHERE key = 'pilot_keys'`).get();
    if (!saved) throw new Error('manifesto sem piloto (meta.pilot_keys)');
    const keys = JSON.parse(saved.value);
    const marks = keys.map(() => '?').join(',');
    const songs = db.prepare(`SELECT DISTINCT song_id FROM files WHERE key IN (${marks}) AND song_id IS NOT NULL`).all(...keys).map((r) => r.song_id);
    db.prepare(
      `UPDATE files SET state = 'discovered', sha256 = NULL, md5_local = NULL, r2_key = NULL, existed = 0, upload_started_at = NULL, reason = NULL,
        firebase_song_id = NULL, firebase_version_id = NULL WHERE key IN (${marks})`,
    ).run(...keys);
    if (songs.length) {
      db.prepare(`UPDATE songs SET status = 'pending', pending_reason = NULL, current_version_id = NULL WHERE song_id IN (${songs.map(() => '?').join(',')})`).run(...songs);
    }
    return { pilotItems: keys.length, pilotSongs: songs.length };
  } finally {
    db.close();
  }
}
function runCli(args, env) {
  const r = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'tools/migrator/src/cli.mjs'), ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
function lastJson(text) {
  const i = text.lastIndexOf('\n{');
  const body = i >= 0 ? text.slice(i + 1) : text;
  return JSON.parse(body.trim());
}

// ---------------------------------------------------------------- navegador
async function loadPlaywright() {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const req = createRequire(path.join(root, 'noop.js'));
  return req('playwright');
}
const DRIVE_PATTERNS = [/^https?:\/\/[^/]*\.googleapis\.com\/drive/i, /^https?:\/\/[^/]*googleapis\.com\/upload\/drive/i, /^https?:\/\/drive\.google\.com/i, /^https?:\/\/[^/]*\.googleusercontent\.com/i, /^https?:\/\/docs\.google\.com/i];
const isDriveUrl = (u) => DRIVE_PATTERNS.some((re) => re.test(u));

async function shot(page, name) {
  const file = path.join(EVID, `${name}.png`);
  await page.screenshot({ path: file });
  return path.basename(file);
}

async function newSession(browser, label, { blockDrive = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const net = { label, httpErrors: [], requests: [], driveBlocked: [], driveSeen: [], consoleErrors: [], pageErrors: [] };
  // Todo pedido ao Drive e abortado (e contado); Firebase/identitytoolkit/securetoken seguem livres.
  await context.route((url) => isDriveUrl(url.toString()), (route) => {
    net.driveBlocked.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('request', (req) => {
    const u = req.url();
    if (isDriveUrl(u)) net.driveSeen.push(u);
    try {
      net.requests.push({ host: new URL(u).host, method: req.method(), path: new URL(u).pathname.slice(0, 60) });
    } catch {
      /* data: / blob: */
    }
  });
  page.on('response', (r) => r.status() >= 400 && net.httpErrors.push(` ${r.request().method()} ${new URL(r.url()).host}${new URL(r.url()).pathname.slice(0, 50)}`));
  page.on('requestfailed', (r) => net.httpErrors.push(`FALHOU ${r.method()} ${r.url().slice(0, 80)} ${r.failure()?.errorText}`));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && net.consoleErrors.push(`: ${m.text().slice(0, 700)}`));
  page.on('pageerror', (e) => net.pageErrors.push(String(e).slice(0, 200)));
  const session = { context, page, net, blockDrive };
  liveSessions.push(session);
  return session;
}
const hostCounts = (net) => {
  const out = {};
  for (const r of net.requests) out[r.host] = (out[r.host] ?? 0) + 1;
  return out;
};

async function login(page, email, password) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.getByText('BANCO DE VS').first().waitFor({ timeout: 30000 });
}
async function openCloudLibrary(page) {
  await page.getByText('BANCO DE VS').first().click();
  await page.getByText('Banco de VS na Nuvem').first().waitFor({ timeout: 10000 });
}
async function closeModal(page) {
  await page.locator('button:has(svg.lucide-x)').first().click();
  await page.getByText('Banco de VS na Nuvem').first().waitFor({ state: 'hidden', timeout: 10000 });
}
/** Dados do IndexedDB do aparelho (sem os bancos do Firebase): contagem de registros por store + chaves de musica. */
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
        const tx = db.transaction(store, 'readonly');
        const keys = await new Promise((res) => {
          const r = tx.objectStore(store).getAllKeys();
          r.onsuccess = () => res(r.result.map(String));
        });
        out[name][store] = { count: keys.length, keys: keys.filter((k) => k.includes('cloud:')) };
      }
      db.close();
    }
    return out;
  });
}
const cloudKeysOf = (storage) => [...new Set(Object.values(storage).flatMap((stores) => Object.values(stores).flatMap((s) => s.keys.map((k) => k.match(/cloud:[a-z]+:[A-Za-z0-9_]+@[A-Za-z0-9]+/)?.[0] ?? k))))];

// ---------------------------------------------------------------- roteiro
async function main() {
  fs.rmSync(EVID, { recursive: true, force: true });
  fs.mkdirSync(EVID, { recursive: true });
  const password = `Demo-${crypto.randomBytes(9).toString('base64url')}`;
  const users = { admin: { email: 'admin@demo.local', name: 'Admin Demo' }, member: { email: 'integrante@demo.local', name: 'Integrante Demo' } };
  let vite;
  const ctx = {};

  // 1. infraestrutura -------------------------------------------------------
  await check('1', 'Emuladores auth+firestore (projeto demo-lagoinha), Worker dev:emu e Vite com env de emulador', async () => {
    for (const p of [8080, 9099, WORKER_PORT, VITE_PORT]) assert(!(await portOpen(p)), `porta ${p} ja esta em uso`);
    const jh = javaHome();
    const env = jh ? { JAVA_HOME: jh, PATH: `${path.join(jh, 'bin')}${path.delimiter}${process.env.PATH}` } : {};
    start('emuladores', process.execPath, [path.join(ROOT, 'node_modules/firebase-tools/lib/bin/firebase.js'), 'emulators:start', '--only', 'auth,firestore', '--project', PROJECT], { env });
    await waitPort(9099, 'Auth emulator');
    await waitPort(8080, 'Firestore emulator');

    const wdir = path.join(ROOT, 'workers/stems');
    const wrangler = path.join(wdir, 'node_modules/wrangler/bin/wrangler.js');
    const persist = path.join(DEMO, 'wrangler-state');
    fs.rmSync(persist, { recursive: true, force: true });
    const wenv = { WRANGLER_SEND_METRICS: 'false', CI: 'true' };
    const mig = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'lagoinha-vs-stems-registry', '--local', '--persist-to', persist], { cwd: wdir, env: { ...process.env, ...wenv }, encoding: 'utf8' });
    fs.writeFileSync(path.join(DEMO, 'worker-migrations.log'), `${mig.stdout}\n${mig.stderr}`);
    assert(mig.status === 0, `migracoes D1 locais falharam (worker-migrations.log)`);
    start('worker', process.execPath, [wrangler, 'dev', '--port', String(WORKER_PORT), '--ip', '127.0.0.1', '--persist-to', persist,
      '--var', `FIREBASE_PROJECT_ID:${PROJECT}`, '--var', `FIRESTORE_BASE:http://${FS_HOST}`, '--var', 'AUTH_EMULATOR:true', '--var', `ALLOWED_ORIGINS:${APP}`], { cwd: wdir, env: wenv });
    await waitHttp(`${WORKER}/`, 'Worker');

    const viteEnv = {
      VITE_BACKEND: 'firebase',
      VITE_FIREBASE_API_KEY: 'demo-key',
      VITE_FIREBASE_PROJECT_ID: PROJECT,
      VITE_FIREBASE_AUTH_EMULATOR: AUTH,
      VITE_FIREBASE_FIRESTORE_EMULATOR: FS_HOST,
      VITE_STEMS_WORKER_URL: WORKER,
    };
    vite = start('vite', process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--mode', 'demo', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], { env: viteEnv });
    await waitHttp(APP, 'Vite');
    const html = await (await fetch(APP)).text();
    assert(html.includes('<div id="root"'), 'Vite nao serviu o app');
    const health = await fetch(`${WORKER}/v1/churches/${CHURCH}/blobs/${'0'.repeat(64)}`, { method: 'HEAD' });
    return { auth: 'ok', firestore: 'ok', workerHttp: health.status, vite: 'ok', projeto: PROJECT, backend: 'firebase (env por variaveis de processo, sem .env)' };
  });

  // 2. semeadura ------------------------------------------------------------
  await check('2', 'Semear igreja lagoinha-jp e dois usuarios (admin e integrante) com membros ativos', async () => {
    await fsOwner('PATCH', `churches/${CHURCH}`, { name: 'Lagoinha Joao Pessoa', city: 'Joao Pessoa' });
    for (const [who, role] of [['admin', 'admin'], ['member', 'musician']]) {
      const u = users[who];
      const r = await authCall('signUp', { email: u.email, password, displayName: u.name, returnSecureToken: true });
      u.uid = r.localId;
      await fsOwner('PATCH', `churches/${CHURCH}/members/${u.uid}`, { role, status: 'active', displayName: u.name, createdAt: new Date() });
      await fsOwner('PATCH', `users/${u.uid}`, { displayName: u.name, primaryChurchId: CHURCH, createdAt: new Date() });
    }
    const members = await fsList(`churches/${CHURCH}/members`);
    assert(members.length === 2 && members.every((m) => m.status === 'active'), 'membros nao semeados');
    return { membros: members.map((m) => `${m.role}:${m.status}`).sort() };
  });

  // 3. migracao -------------------------------------------------------------
  const mig = await check('3', 'Migrador (alvos worker+firestore) sobre o piloto real, contra o Worker e o Firestore locais', async () => {
    const prep = prepareManifest();
    const signIn = await authCall('signInWithPassword', { email: users.admin.email, password, returnSecureToken: true });
    const tokenFile = path.join(MIG, 'admin.token');
    fs.writeFileSync(tokenFile, signIn.idToken);
    const env = {
      LAGOINHA_MIGRATION_HOME: MIG,
      MIGRATOR_WORKER_URL: WORKER,
      MIGRATOR_ID_TOKEN_FILE: tokenFile,
      MIGRATOR_FIREBASE_PROJECT_ID: PROJECT,
      MIGRATOR_FIRESTORE_BASE: `http://${FS_HOST}`,
      MIGRATOR_CHURCH_ID: CHURCH,
    };
    const run = runCli(['migrate', '--pilot', '--target', 'worker', '--registry', 'firestore', '--assume-time-signature', '4/4'], env);
    fs.writeFileSync(path.join(DEMO, 'migrador.stdout.log'), run.stdout);
    fs.writeFileSync(path.join(DEMO, 'migrador.stderr.log'), run.stderr);
    assert(run.status === 0, `migrador saiu com ${run.status}: ${run.stderr.slice(-300)}`);
    const sum = lastJson(run.stdout);
    assert(sum.failed === 0 && !sum.aborted, `falhas=${sum.failed}`);
    assert(sum.songs.published >= 1, 'nenhuma musica publicada');
    const lib = await fsList(`churches/${CHURCH}/library`, signIn.idToken);
    const ready = lib.filter((s) => s.status === 'ready' && s.currentVersionId);
    assert(ready.length === sum.songs.published, `biblioteca ready=${ready.length} != publicadas=${sum.songs.published}`);
    // Todos os blobs das versoes publicadas respondem no Worker (HEAD) com o tamanho do registro.
    let blobs = 0;
    for (const s of ready) {
      const v = (await fsList(`churches/${CHURCH}/library/${s.id}/versions`, signIn.idToken)).find((x) => x.id === s.currentVersionId);
      for (const st of v.stems) {
        const h = await fetch(`${WORKER}/v1/churches/${CHURCH}/blobs/${st.sha256}`, { method: 'HEAD', headers: { authorization: `Bearer ${signIn.idToken}` } });
        assert(h.status === 200 && Number(h.headers.get('content-length')) === st.size, `HEAD ${h.status} para um stem`);
        blobs++;
      }
    }
    ctx.library = ready.map((s) => ({ id: s.id, title: s.title, versionId: s.currentVersionId }));
    ctx.adminToken = signIn.idToken;
    ctx.tokenFile = tokenFile;
    ctx.migrEnv = env;
    return {
      itensPiloto: prep.pilotItems, musicasPiloto: prep.pilotSongs,
      migrador: { processed: sum.processed, hashed: sum.hashed, uploaded: sum.uploaded, verified: sum.verified, failed: sum.failed, songs: sum.songs },
      registroFirestore: sum.registryStats, armazenamentoWorker: sum.storageStats,
      biblioteca: { total: lib.length, prontas: ready.length }, blobsConferidosNoWorker: blobs,
    };
  });
  void mig;

  if (process.env.DEMO_HOLD_AFTER_3) {
    // Depuracao: deixa a infraestrutura de pe ate existir o arquivo "release" na pasta do demo.
    log(`DEMO_HOLD_AFTER_3: infraestrutura de pe; crie o arquivo "release" em ${DEMO} para seguir`);
    fs.rmSync(path.join(DEMO, 'release'), { force: true });
    while (!fs.existsSync(path.join(DEMO, 'release'))) await sleep(1000);
  }
  // 4-8. navegador ----------------------------------------------------------
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  ctx.browser = browser;
  try {
    await browserFlow(browser, ctx, users, password, 'normal');
    await versionStep(browser, ctx, users, password);
    await browserFlow(browser, ctx, users, password, 'semdrive');
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Passos 4-6 (modo normal) e passo 8 (sessao limpa, Drive bloqueado por rota). */
async function browserFlow(browser, ctx, users, password, mode) {
  const tag = mode === 'semdrive' ? '8' : '';
  const S = (n) => (mode === 'semdrive' ? `8.${n}` : n);
  const sufixo = mode === 'semdrive' ? '-semdrive' : '';
  const admin = await newSession(browser, `admin${sufixo}`);
  const member = await newSession(browser, `integrante${sufixo}`);
  captureShell(member);
  ctx[`sessions${sufixo}`] = { admin, member };
  const cultoTitulo = mode === 'semdrive' ? 'Culto sem Drive' : 'Culto de domingo';

  await check(S('4'), `Admin: login, biblioteca com o acervo migrado (Firestore), adiciona ao repertorio via Worker e publica o culto${mode === 'semdrive' ? ' [Drive bloqueado]' : ''}`, async () => {
    const { page } = admin;
    const blobGets = [];
    page.on('response', (r) => {
      if (r.url().startsWith(WORKER) && r.url().includes('/blobs/') && r.request().method() === 'GET') blobGets.push(r.status());
    });
    await login(page, users.admin.email, password);
    await shot(page, `${S('4')}a-admin-logado`);
    await openCloudLibrary(page);
    const rows = page.locator('h4');
    await page.locator('button:has-text("Carregar no Setlist")').first().waitFor({ timeout: 20000 });
    const addable = await page.locator('button:has-text("Carregar no Setlist")').count();
    const catalogRows = await rows.count();
    await shot(page, `${S('4')}b-biblioteca-migrada`);
    assert(addable >= 1, 'nenhuma musica pronta na biblioteca');
    // adiciona ate 2 musicas (a pasta e a do zip)
    const toAdd = Math.min(2, addable);
    for (let i = 0; i < toAdd; i++) {
      const btn = page.locator('button:has-text("Carregar no Setlist")').first();
      await btn.click();
      await page.locator('button:has-text("Adicionado ao Culto")').nth(i).waitFor({ timeout: 60000 });
    }
    await shot(page, `${S('4')}c-adicionadas`);
    assert(blobGets.length >= toAdd && blobGets.every((s) => s === 200), `downloads pelo Worker: ${JSON.stringify(blobGets)}`);
    await page.getByText('Cultos da Igreja').first().click();
    await page.locator('input[maxlength="100"]').first().fill(cultoTitulo);
    await page.getByRole('button', { name: 'Publicar culto' }).click();
    await page.getByText(/Culto publicado com \d+ m/).first().waitFor({ timeout: 20000 });
    await shot(page, `${S('4')}d-culto-publicado`);
    const setlists = await fsList(`churches/${CHURCH}/setlists`);
    const culto = setlists.find((s) => s.title === cultoTitulo);
    assert(culto && culto.items.length === toAdd, 'culto nao esta no Firestore com os itens esperados');
    ctx[`culto${sufixo}`] = { id: culto.id, items: culto.items.map((i) => ({ songId: i.songId, versionId: i.versionId })) };
    await admin.context.close(); // menos conexoes longas no emulador (cada pagina mantem um canal de escuta)
    return { linhasNaBiblioteca: catalogRows, adicionadas: toAdd, downloadsWorker: blobGets.length, statusDownloads: [...new Set(blobGets)], cultoNoFirestore: { itens: culto.items.length, revisao: culto.revision, status: culto.status } };
  });

  await check(S('5'), `Integrante: abre o culto, "Preparar e abrir offline", musica carregada no player${mode === 'semdrive' ? ' [Drive bloqueado]' : ''}`, async () => {
    const { page } = member;
    await login(page, users.member.email, password);
    await openCloudLibrary(page);
    await page.getByText('Cultos da Igreja').first().click();
    const card = page.locator('div', { has: page.getByText(cultoTitulo, { exact: true }) }).filter({ has: page.getByRole('button', { name: /Preparar e abrir offline/ }) }).last();
    await card.waitFor({ timeout: 15000 });
    await shot(page, `${S('5')}a-culto-do-integrante`);
    await card.getByRole('button', { name: /Preparar e abrir offline/ }).click();
    // Ao terminar, o app troca o repertorio pelas musicas preparadas e fecha o banco de VS.
    await page.getByText('Banco de VS na Nuvem').first().waitFor({ state: 'hidden', timeout: 90000 });
    const wanted = ctx[`culto${sufixo}`].items.length;
    const state = await playerState(page);
    await shot(page, `${S('5')}b-preparado`);
    assert(Number(state.repertorio) === wanted, `repertorio com ${state.repertorio} musicas, esperado ${wanted}`);
    const storage = await deviceStorage(page);
    const keys = cloudKeysOf(storage);
    assert(keys.length >= wanted, `IndexedDB sem as ${wanted} musicas preparadas: ${JSON.stringify(keys)}`);
    ctx[`prepared${sufixo}`] = keys;
    const play = await tryPlay(page);
    await shot(page, `${S('5')}c-tocando`);
    assert(play.changed, `o player nao saiu do estado parado: ${JSON.stringify(play)}`);
    return { repertorioAposPreparar: state.repertorio, canaisNoMixer: state.canais, musicasNoIndexedDB: keys.length, aparelho: countStores(storage), reproducao: play };
  });

  await check(S('6'), `Offline: contexto sem rede, recarrega e a musica preparada abre do IndexedDB${mode === 'semdrive' ? ' [Drive bloqueado]' : ''}`, async () => {
    const { page, context, net } = member;
    const out = await offlineReload(member, ctx[`culto${sufixo}`].items.length, ctx, sufixo);
    await shot(page, `${S('6')}a-offline-recarregado`);
    void context;
    void net;
    return out;
  });

  if (mode === 'semdrive') {
    await member.context.close();
    await check('8', 'Sem Drive: nenhuma requisicao ao Drive nas duas sessoes limpas (rotas bloqueadas e contadas)', async () => {
      const a = admin.net;
      const m = member.net;
      assert(a.driveSeen.length === 0 && a.driveBlocked.length === 0 && m.driveSeen.length === 0 && m.driveBlocked.length === 0, `pedidos ao Drive: admin=${a.driveSeen.length} integrante=${m.driveSeen.length}`);
      return { padroesBloqueados: ['*.googleapis.com/drive*', 'drive.google.com', '*.googleusercontent.com', 'docs.google.com'], pedidosAoDrive: { admin: a.driveSeen.length, integrante: m.driveSeen.length }, totalPedidos: { admin: a.requests.length, integrante: m.requests.length }, hosts: { admin: hostCounts(a), integrante: hostCounts(m) } };
    });
  }
}

async function playerState(page) {
  return page.evaluate(() => {
    const t = document.body.innerText;
    return {
      repertorio: (t.match(/(\d+)\s+M[uú]sicas?/i) ?? [])[1] ?? null,
      canais: (t.match(/CONSOLE MULTITRACK \((\d+) CANAIS\)/) ?? [])[1] ?? null,
      botaoPlay: (document.querySelector('button[title^="Reproduzir"]')?.innerText ?? '').trim(),
      tempos: t.match(/\b\d{1,2}:\d{2}(?:[.:]\d+)?\b/g)?.slice(0, 4) ?? [],
    };
  });
}
/** Aperta DAR PLAY, confere que o estado do player mudou e o tempo avanca; depois pausa. */
async function tryPlay(page) {
  const before = await playerState(page);
  await page.locator('button[title^="Reproduzir"]').first().click();
  const deadline = Date.now() + 20000;
  let a = await playerState(page);
  while (a.botaoPlay === before.botaoPlay && Date.now() < deadline) {
    await sleep(500);
    a = await playerState(page);
  }
  await sleep(2500);
  const b = await playerState(page);
  // tocando de verdade: o botao virou PAUSAR e continua assim 2,5 s depois (musica sem duracao encerraria no instante 0)
  const changed = a.botaoPlay !== before.botaoPlay && b.botaoPlay === a.botaoPlay;
  await page.locator('button[title^="Reproduzir"]').first().click();
  return { changed, botaoAntes: before.botaoPlay, botaoTocando: a.botaoPlay, botaoDepois: b.botaoPlay };
}
const countStores = (storage) => Object.fromEntries(Object.entries(storage).map(([db, st]) => [db, Object.fromEntries(Object.entries(st).map(([s, v]) => [s, v.count]))]));

/** Guarda o "app shell" (respostas do Vite) durante a sessao online para servi-lo com a rede cortada. */
function captureShell(session) {
  session.shell = new Map();
  session.page.on('response', async (r) => {
    if (!r.url().startsWith(APP) || r.status() !== 200) return;
    try {
      session.shell.set(r.url(), { headers: r.headers(), body: await r.body() });
    } catch {
      /* resposta descartada pelo navegador */
    }
  });
}
async function offlineReload(session, expectedSongs, ctx, sufixo) {
  const { page, context, net } = session;
  const before = net.requests.length;
  await context.setOffline(true);
  session.shellMatcher = (u) => u.toString().startsWith(APP);
  session.shellHandler = (route) => {
    const hit = session.shell.get(route.request().url());
    if (!hit) return route.abort('internetdisconnected');
    const headers = { ...hit.headers };
    delete headers['content-length'];
    delete headers['content-encoding'];
    delete headers['transfer-encoding'];
    return route.fulfill({ status: 200, headers, body: hit.body });
  };
  await context.route(session.shellMatcher, session.shellHandler);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText('BANCO DE VS').first().waitFor({ timeout: 30000 });
  const online = await page.evaluate(() => navigator.onLine);
  const storage = await deviceStorage(page);
  const keys = cloudKeysOf(storage);
  const wantedKeys = ctx[`prepared${sufixo}`];
  assert(wantedKeys.every((k) => keys.includes(k)), `IndexedDB perdeu musicas preparadas: ${JSON.stringify(keys)}`);
  // abre cada musica preparada pelo titulo (so le do aparelho) e toca
  const titles = ctx[`culto${sufixo}`].items.map((i) => ctx.library.find((s) => s.id === i.songId)?.title).filter(Boolean);
  const opened = [];
  for (const title of titles) {
    await page.locator('div', { hasText: title }).filter({ hasNotText: 'CONSOLE' }).last().click();
    await sleep(800);
    const st = await playerState(page);
    opened.push({ canais: st.canais });
  }
  const play = await tryPlay(page);
  const post = net.requests.slice(before).filter((r) => r.host.endsWith(`:${WORKER_PORT}`) && r.path.includes('/blobs/'));
  const failed = net.httpErrors.filter((e) => e.startsWith('FALHOU')).length;
  assert(opened.length > 0 && opened.every((o) => Number(o.canais) > 0), `musica preparada nao abriu offline: ${JSON.stringify(opened)}`);
  assert(play.changed, `nao tocou offline: ${JSON.stringify(play)}`);
  return { navigatorOnLine: online, musicasAbertasDoAparelho: opened.length, canaisPorMusica: opened.map((o) => o.canais), reproducao: play, chavesNoIndexedDB: keys.length, pedidosAoWorkerDepoisDeCortarARede: post.length, pedidosFalhosPelaRedeCortada: failed };
}

async function versionStep(browser, ctx, users) {
  void browser;
  void users;
  await check('7', 'Versao nova da mesma musica: a versao preparada fica no aparelho e o culto segue apontando para a versao fixada', async () => {
    const { page, context } = ctx.sessions.member;
    const { FirestoreRegistry } = await import(pathToFileURL(path.join(ROOT, 'tools/migrator/src/targets/registry-firestore.mjs')));
    const reg = new FirestoreRegistry({ projectId: PROJECT, tokenFile: ctx.tokenFile, baseUrl: `http://${FS_HOST}` });
    const item = ctx.culto.items[0];
    const oldVersion = item.versionId;
    const song = await reg.getSong(CHURCH, item.songId);
    const oldDoc = await reg.getVersion(CHURCH, item.songId, oldVersion);
    assert(song && oldDoc, 'musica ou versao antiga ausente');
    // versao nova: a mesma musica sem o ultimo stem de banda (muda o conjunto, logo muda o id da versao)
    const keepStems = oldDoc.stems.slice(0, -1);
    const newVersion = `vnova${crypto.createHash('sha256').update(JSON.stringify(keepStems.map((s) => s.sha256))).digest('hex').slice(0, 14)}`;
    const now = new Date();
    const created = await reg.createVersion(CHURCH, item.songId, newVersion, { createdAt: now, createdBy: reg.uid, changelog: 'Demo: segunda versao da mesma musica', sections: [], stems: keepStems });
    assert(created === 'created', `versao nova: ${created}`);
    await reg.setSong(CHURCH, item.songId, { ...song, currentVersionId: newVersion, updatedAt: now });
    assert(newVersion !== oldVersion, 'ids iguais');

    // o acervo publicado agora aponta para a versao nova; o culto continua na antiga
    const after = await reg.getSong(CHURCH, item.songId);
    assert(after.currentVersionId === newVersion, 'currentVersionId nao mudou');
    const culto = (await fsList(`churches/${CHURCH}/setlists`)).find((s) => s.id === ctx.culto.id);
    assert(culto.items.find((i) => i.songId === item.songId).versionId === oldVersion && culto.revision === 1, 'o culto deveria seguir fixado na versao antiga');

    // integrante volta online, recarrega e ainda tem a versao antiga no aparelho
    await context.unroute(ctx.sessions.member.shellMatcher, ctx.sessions.member.shellHandler);
    await context.setOffline(false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('BANCO DE VS').first().waitFor({ timeout: 30000 });
    const keys = cloudKeysOf(await deviceStorage(page));
    const oldKey = ctx.prepared.find((k) => k.includes(`${item.songId}@${oldVersion}`));
    assert(oldKey && keys.includes(oldKey), 'a versao preparada sumiu do aparelho');
    assert(!keys.some((k) => k.includes(`@${newVersion}`)), 'a versao nova nao deveria ter descido sozinha');

    // preparar o culto de novo continua baixando/mantendo a versao fixada, nao a nova
    await openCloudLibrary(page);
    await page.getByText('Cultos da Igreja').first().click();
    await page.getByRole('button', { name: /Preparar e abrir offline/ }).first().click();
    await page.getByText('Banco de VS na Nuvem').first().waitFor({ state: 'hidden', timeout: 90000 });
    const keys2 = cloudKeysOf(await deviceStorage(page));
    assert(keys2.some((k) => k.includes(`${item.songId}@${oldVersion}`)) && !keys2.some((k) => k.includes(`@${newVersion}`)), 'preparar de novo trouxe a versao errada');
    await shot(page, '7a-versao-fixada-no-aparelho');

    // e uma musica adicionada do acervo agora ja entra na versao nova (chave diferente; as duas coexistem no aparelho)
    await openCloudLibrary(page);
    await page.getByText(/Cat.logo Geral/).first().click();
    const title = ctx.library.find((s) => s.id === item.songId).title;
    const row = page.locator('div', { has: page.locator('h4', { hasText: title }) }).filter({ has: page.locator('button:has-text("Carregar no Setlist")') }).last();
    await row.locator('button:has-text("Carregar no Setlist")').click();
    await page.locator('button:has-text("Adicionado ao Culto")').first().waitFor({ timeout: 60000 });
    const keys3 = cloudKeysOf(await deviceStorage(page));
    assert(keys3.some((k) => k.includes(`@${newVersion}`)) && keys3.some((k) => k.includes(`@${oldVersion}`)), `as duas versoes deveriam coexistir: ${JSON.stringify(keys3)}`);
    await shot(page, '7b-duas-versoes-no-aparelho');
    return { versaoAntiga: oldVersion.slice(0, 8), versaoNova: newVersion.slice(0, 8), stemsAntiga: oldDoc.stems.length, stemsNova: keepStems.length, cultoRevisao: culto.revision, cultoVersaoFixada: true, chavesNoAparelhoAntes: keys.length, chavesNoAparelhoDepois: keys2.length, aposAdicionarDoAcervo: { versaoNovaPresente: true, versaoAntigaPresente: true, total: keys3.length }, acervoApontaParaNova: true };
  });
  await ctx.sessions.member.context.close();
}

let exitCode = 0;
try {
  fs.mkdirSync(DEMO, { recursive: true });
  await main();
} catch (e) {
  exitCode = 1;
  log(`ABORTADO: ${e?.stack ?? e}`);
} finally {
  killAll();
  fs.mkdirSync(EVID, { recursive: true });
  fs.writeFileSync(path.join(EVID, 'resultado.json'), JSON.stringify({ geradoEm: new Date().toISOString(), projeto: PROJECT, passos: results }, null, 2));
  log('--- resumo ---');
  for (const r of results) console.log(`${r.status}  passo ${r.step}  ${r.name}`);
  log(`evidencias: ${EVID}`);
  process.exitCode = exitCode || (results.some((r) => r.status === 'FAIL') ? 1 : 0);
}
