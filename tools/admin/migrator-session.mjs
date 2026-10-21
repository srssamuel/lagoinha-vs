// Sessao do migrador com a nuvem real: login Google do dono (navegador) + renovacao do ID token.
//   node tools/admin/migrator-session.mjs login
//   node tools/admin/migrator-session.mjs refresh [--loop]
// Segredos: o refresh token fica so em session.json e o ID token so em id-token.txt, ambos com ACL do usuario
// atual; nenhum dos dois (nem a apiKey) vai para stdout, log ou arquivo versionado.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PROJECT_ID = 'lagoinha-joao-pessoa';
export const APP_ID = '1:697356545258:web:647df73ca756a204e37b93';
export const AUTH_DOMAIN = 'lagoinha-joao-pessoa.firebaseapp.com';
const SDK_VERSION = '12.19.0';
const REFRESH_EVERY_MS = 45 * 60 * 1000;
const MAX_BODY = 16 * 1024;

export function migracaoDir(env = process.env) {
  if (env.LAGOINHA_MIGRACAO_DIR) return env.LAGOINHA_MIGRACAO_DIR;
  const base = env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'lagoinha-vs', 'migracao');
}

/** Restringe o arquivo ao usuario atual (Windows: icacls; demais: chmod 600). */
export function lockFile(file) {
  if (process.platform === 'win32') {
    const user = process.env.USERNAME;
    if (!user) throw new Error('USERNAME ausente: nao da para ajustar a ACL');
    const r = spawnSync('icacls', [file, '/inheritance:r', '/grant:r', `${user}:F`], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('icacls falhou ao restringir o arquivo');
  } else {
    fs.chmodSync(file, 0o600);
  }
}

/** Grava com ACL restrita ANTES do conteudo e troca por rename (leitor nunca ve arquivo parcial). */
export function writeSecret(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, '');
  try {
    lockFile(tmp);
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

function safeEq(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function loginPage({ nonce, apiKey }) {
  const cfg = JSON.stringify({ apiKey, authDomain: AUTH_DOMAIN, projectId: PROJECT_ID, appId: APP_ID });
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Sessao do migrador</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px system-ui;margin:3rem auto;max-width:28rem;padding:0 1rem}button{font:inherit;padding:.7rem 1.2rem;cursor:pointer}#s{margin-top:1rem}</style>
</head><body>
<h1>Sessao do migrador</h1>
<p>Entre com a conta Google de dono do Lagoinha VS. Nenhum acesso ao Drive e pedido.</p>
<button id="b" type="button">Entrar com Google</button>
<p id="s" role="status"></p>
<script type="module" nonce="${nonce}">
import { initializeApp } from 'https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js';
const cfg = ${cfg};
const nonce = ${JSON.stringify(nonce)};
const s = document.getElementById('s');
document.getElementById('b').addEventListener('click', async () => {
  try {
    const auth = getAuth(initializeApp(cfg));
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    const { user } = await signInWithPopup(auth, p);
    const r = await fetch('/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nonce': nonce },
      body: JSON.stringify({ refreshToken: user.refreshToken, uid: user.uid, email: user.email })
    });
    s.textContent = r.ok ? 'Sessao gravada. Pode fechar esta aba.' : 'O servidor local recusou (' + r.status + ').';
  } catch (e) {
    s.textContent = 'Falha no login: ' + (e && e.code ? e.code : 'erro');
  }
});
</script></body></html>`;
}

/**
 * Servidor do login. `onSession({refreshToken, uid, email})` roda so com nonce correto e origem local.
 * Retorna { server, nonce, listen(): Promise<port> }.
 */
export function createLoginServer({ apiKey, onSession, startPort = 5180, nonce = crypto.randomBytes(24).toString('base64url') }) {
  let port = 0;
  const hostOk = (h) => h === `localhost:${port}` || h === `127.0.0.1:${port}`;
  const originOk = (o) => o === `http://localhost:${port}` || o === `http://127.0.0.1:${port}`;
  const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
    res.end(body);
  };

  const server = http.createServer((req, res) => {
    if (!hostOk(req.headers.host)) return send(res, 403, 'host invalido');
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method === 'GET' && url.pathname === '/') {
      // O signInWithPopup do Firebase carrega apis.google.com/js/api.js para o iframe do authDomain.
      const csp = `default-src 'none'; script-src 'nonce-${nonce}' https://www.gstatic.com https://apis.google.com; connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://www.googleapis.com; frame-src https://*.firebaseapp.com https://accounts.google.com; style-src 'unsafe-inline'`;
      return send(res, 200, loginPage({ nonce, apiKey }), 'text/html; charset=utf-8', { 'content-security-policy': csp });
    }
    if (req.method === 'POST' && url.pathname === '/session') {
      if (!originOk(req.headers.origin) || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
        return send(res, 403, 'origem recusada');
      }
      if (!safeEq(req.headers['x-nonce'] ?? '', nonce)) return send(res, 403, 'nonce invalido');
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { send(res, 413, 'corpo grande demais'); req.destroy(); } else chunks.push(c);
      });
      req.on('end', async () => {
        if (res.writableEnded) return;
        let b;
        try { b = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, 'json invalido'); }
        if (![b?.refreshToken, b?.uid, b?.email].every((v) => typeof v === 'string' && v)) return send(res, 400, 'campos ausentes');
        try {
          await onSession({ refreshToken: b.refreshToken, uid: b.uid, email: b.email });
          send(res, 200, 'ok');
        } catch {
          send(res, 500, 'falha ao gravar');
        }
      });
      return undefined;
    }
    return send(res, 404, 'nao encontrado');
  });

  const listen = () => new Promise((resolve, reject) => {
    let p = startPort;
    const attempt = () => {
      server.once('error', (e) => {
        if (e.code === 'EADDRINUSE' && p < startPort + 50) { p += 1; attempt(); } else reject(e);
      });
      server.listen(p, '127.0.0.1', () => { port = p; server.removeAllListeners('error'); resolve(p); });
    };
    attempt();
  });
  return { server, nonce, listen };
}

export function fetchApiKey() {
  const r = spawnSync(`npx firebase apps:sdkconfig WEB ${APP_ID} --project ${PROJECT_ID}`, { shell: true, encoding: 'utf8' });
  const m = /"apiKey"\s*:\s*"([^"]+)"/.exec(r.stdout || '');
  if (r.status !== 0 || !m) throw new Error('nao obtive a apiKey web (firebase CLI logado como dono?)');
  return m[1];
}

function openBrowser(url) {
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
}

export async function login({ dir = migracaoDir(), getApiKey = fetchApiKey, open = openBrowser, out = console.log, timeoutMs = 5 * 60 * 1000 } = {}) {
  const apiKey = getApiKey();
  const sessionFile = path.join(dir, 'session.json');
  let done;
  const finished = new Promise((resolve) => { done = resolve; });
  const srv = createLoginServer({
    apiKey,
    onSession: ({ refreshToken, uid, email }) => {
      writeSecret(sessionFile, JSON.stringify({ refreshToken, uid, email, apiKey }, null, 2));
      done({ uid, email });
    }
  });
  const port = await srv.listen();
  const url = `http://localhost:${port}/`;
  out(`Abrindo ${url} (entre com a conta Google de dono)...`);
  open(url);
  const timer = setTimeout(() => done(null), timeoutMs);
  const result = await finished;
  clearTimeout(timer);
  await new Promise((resolve) => { srv.server.close(resolve); srv.server.closeAllConnections?.(); });
  if (!result) throw new Error('tempo esgotado sem login');
  out(`Sessao gravada. uid=${result.uid} email=${result.email}`);
  return result;
}

export class RefreshError extends Error {
  constructor(msg, fatal) { super(msg); this.fatal = fatal; }
}

export async function refreshOnce({ dir = migracaoDir(), fetchImpl = fetch } = {}) {
  const sessionFile = path.join(dir, 'session.json');
  if (!fs.existsSync(sessionFile)) throw new RefreshError('session.json ausente: rode "login" primeiro', true);
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  const res = await fetchImpl(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(session.apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }).toString()
  });
  let body = {};
  try { body = await res.json(); } catch { /* corpo nao-JSON */ }
  if (!res.ok) {
    const code = typeof body?.error?.message === 'string' ? body.error.message.split(/[ :]/)[0] : `HTTP_${res.status}`;
    throw new RefreshError(`renovacao recusada: ${code}`, res.status === 400 || res.status === 401 || res.status === 403);
  }
  const idToken = body.id_token;
  if (typeof idToken !== 'string' || !idToken) throw new RefreshError('resposta sem id_token', false);
  writeSecret(path.join(dir, 'id-token.txt'), idToken);
  if (body.refresh_token && body.refresh_token !== session.refreshToken) {
    writeSecret(sessionFile, JSON.stringify({ ...session, refreshToken: body.refresh_token }, null, 2));
  }
  return { expiresInSec: Number(body.expires_in) || 3600 };
}

export async function refresh({ loop = false, dir, fetchImpl, out = console.log, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), signal } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      await refreshOnce({ dir, fetchImpl });
      attempt = 0;
      out(`${new Date().toISOString()} ID token renovado.`);
      if (!loop) return;
      await sleep(REFRESH_EVERY_MS);
    } catch (e) {
      if (!loop || e.fatal) throw e;
      attempt += 1;
      const wait = Math.min(5000 * 2 ** (attempt - 1), 5 * 60 * 1000);
      out(`${new Date().toISOString()} falha na renovacao (${e.message}); nova tentativa em ${Math.round(wait / 1000)}s.`);
      await sleep(wait);
    }
    if (signal?.aborted) return;
  }
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const [cmd, ...rest] = argv;
  if (cmd === 'login') return void (await login(deps));
  if (cmd === 'refresh') return void (await refresh({ loop: rest.includes('--loop'), ...deps }));
  console.error('uso: migrator-session.mjs login | refresh [--loop]');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`erro: ${e.message}`); process.exitCode = 1; });
}
