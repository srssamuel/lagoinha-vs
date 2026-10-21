import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLoginServer, refresh, refreshOnce, main, writeSecret } from '../migrator-session.mjs';

const FAKE_REFRESH = 'rt-segredo-de-teste-123';
const FAKE_ID = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1MSJ9.idtoken-segredo-456';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mig-sess-'));

async function startServer() {
  const got = [];
  const srv = createLoginServer({ apiKey: 'AIza-fake', onSession: (s) => got.push(s), startPort: 5290 });
  const port = await srv.listen();
  const post = (headers, body = { refreshToken: FAKE_REFRESH, uid: 'u1', email: 'a@b.c' }) =>
    fetch(`http://127.0.0.1:${port}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}`, ...headers },
      body: JSON.stringify(body)
    });
  const close = () => new Promise((r) => { srv.server.close(r); srv.server.closeAllConnections(); });
  return { srv, port, got, post, close };
}

test('nonce errado e recusado com 403 e nada e gravado', async () => {
  const s = await startServer();
  try {
    const r = await s.post({ origin: `http://127.0.0.1:${s.port}`, 'x-nonce': 'errado' });
    assert.equal(r.status, 403);
    assert.equal(s.got.length, 0);
  } finally { await s.close(); }
});

test('POST de outra origem e recusado (mesmo com nonce certo)', async () => {
  const s = await startServer();
  try {
    const r = await s.post({ origin: 'https://evil.example', 'x-nonce': s.srv.nonce });
    assert.equal(r.status, 403);
    const semOrigem = await s.post({ 'x-nonce': s.srv.nonce });
    assert.equal(semOrigem.status, 403);
    assert.equal(s.got.length, 0);
  } finally { await s.close(); }
});

test('nonce e origem certos entregam a sessao; pagina embute o nonce', async () => {
  const s = await startServer();
  try {
    const page = await (await fetch(`http://127.0.0.1:${s.port}/`)).text();
    assert.ok(page.includes(s.srv.nonce));
    assert.ok(page.includes('Entrar com Google'));
    assert.ok(page.includes('select_account'));
    assert.ok(!page.includes('addScope'));
    const r = await s.post({ origin: `http://127.0.0.1:${s.port}`, 'x-nonce': s.srv.nonce });
    assert.equal(r.status, 200);
    assert.deepEqual(s.got, [{ refreshToken: FAKE_REFRESH, uid: 'u1', email: 'a@b.c' }]);
  } finally { await s.close(); }
});

function setup() {
  const dir = tmp();
  writeSecret(path.join(dir, 'session.json'), JSON.stringify({ refreshToken: FAKE_REFRESH, uid: 'u1', email: 'a@b.c', apiKey: 'AIza-fake' }));
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id_token: FAKE_ID, refresh_token: FAKE_REFRESH, expires_in: '3600' }), { status: 200 });
  };
  return { dir, calls, fetchImpl };
}

test('refresh grava id-token.txt com fetch simulado', async () => {
  const { dir, calls, fetchImpl } = setup();
  await refreshOnce({ dir, fetchImpl });
  assert.equal(fs.readFileSync(path.join(dir, 'id-token.txt'), 'utf8'), FAKE_ID);
  assert.ok(calls[0].url.startsWith('https://securetoken.googleapis.com/v1/token?key='));
  assert.match(calls[0].init.body, /grant_type=refresh_token/);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['id-token.txt', 'session.json']);
});

test('o token nunca aparece em stdout (CLI refresh, saida e erros)', async () => {
  const { dir, fetchImpl } = setup();
  const lines = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try {
    await refresh({ dir, fetchImpl, out: (m) => lines.push(m) });
    await main(['refresh'], { dir, fetchImpl });
    await assert.rejects(refresh({
      dir,
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: `INVALID ${FAKE_REFRESH}` } }), { status: 400 })
    }), (e) => { lines.push(e.message); return true; });
  } finally { console.log = origLog; console.error = origErr; }
  const all = lines.join('\n');
  assert.ok(lines.length >= 2);
  for (const secret of [FAKE_ID, FAKE_REFRESH, 'AIza-fake']) assert.ok(!all.includes(secret), `vazou ${secret.slice(0, 6)}`);
});

test('--loop tenta de novo com backoff apos falha de rede e nao derruba', async () => {
  const { dir, fetchImpl } = setup();
  let n = 0;
  const waits = [];
  const ctl = new AbortController();
  await refresh({
    loop: true, dir, out: () => {}, signal: ctl.signal,
    fetchImpl: async (...a) => { n += 1; if (n === 1) throw new TypeError('fetch failed'); return fetchImpl(...a); },
    sleep: async (ms) => { waits.push(ms); if (ms > 60_000) ctl.abort(); }
  });
  assert.equal(n, 2);
  assert.deepEqual(waits, [5000, 45 * 60 * 1000]);
  assert.equal(fs.readFileSync(path.join(dir, 'id-token.txt'), 'utf8'), FAKE_ID);
});
