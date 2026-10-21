// Modulo novo por arquivo de teste: o cache do JWKS comeca vazio aqui.
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../src/http';
import { authEmulatorEnabled, verifyIdToken } from '../src/jwt';
import { KID, callWithEnv, generateKeys, mintToken, mintUnsigned, type TestKeys } from './helpers';

const realFetch = globalThis.fetch.bind(globalThis);
let keys: TestKeys;
let mode: 'ok' | 'fail' = 'ok';
let jwksCalls = 0;

beforeAll(async () => {
  keys = await generateKeys();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url !== env.JWKS_URL) return realFetch(input as RequestInfo, init);
    jwksCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20)); // da tempo das chamadas concorrentes se empilharem
    if (mode === 'fail') return new Response('down', { status: 500 });
    return new Response(JSON.stringify({ keys: [{ ...keys.publicJwk, kid: KID, use: 'sig', alg: 'RS256' }] }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' }
    });
  });
});

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (err) {
    if (err instanceof HttpError) return err.status;
    throw err;
  }
}

describe('JWKS: buscas simultaneas e copia vencida', () => {
  const t0 = Date.now();
  const longToken = () => mintToken(keys, { uid: 'u1', exp: Math.floor(t0 / 1000) + 7200 });

  it('varias verificacoes ao mesmo tempo com cache vazio fazem uma unica busca', async () => {
    const token = await longToken();
    const results = await Promise.all(Array.from({ length: 8 }, () => verifyIdToken(token, env as never, t0)));
    expect(results.every((r) => r.uid === 'u1')).toBe(true);
    expect(jwksCalls).toBe(1);
  });

  it('Google fora do ar: usa a copia vencida por ate 10 min; passando disso, 503', async () => {
    mode = 'fail';
    const token = await longToken();
    const justExpired = t0 + 3600_000 + 60_000;
    expect((await verifyIdToken(token, env as never, justExpired)).uid).toBe('u1');
    expect(await status(verifyIdToken(token, env as never, t0 + 3600_000 + 11 * 60_000))).toBe(503);
  });

  it('kid desconhecido com o Google fora do ar continua 401 (nao vira 503)', async () => {
    mode = 'fail';
    const token = await mintToken(keys, { uid: 'u1', kid: 'outra', exp: Math.floor(t0 / 1000) + 7200 });
    expect(await status(verifyIdToken(token, env as never, t0 + 3600_000 + 120_000))).toBe(401);
  });
});

describe('modo emulador de autenticacao (tokens alg none)', () => {
  const emu = { ...(env as unknown as Record<string, unknown>), FIREBASE_PROJECT_ID: 'demo-lagoinha-vs', AUTH_EMULATOR: 'true' };
  const prod = { ...emu, FIREBASE_PROJECT_ID: 'lagoinha-joao-pessoa', AUTH_EMULATOR: 'true' };

  it('so liga com projeto demo-* E AUTH_EMULATOR=true', () => {
    expect(authEmulatorEnabled(emu as never)).toBe(true);
    expect(authEmulatorEnabled({ ...emu, AUTH_EMULATOR: undefined } as never)).toBe(false);
    expect(authEmulatorEnabled({ ...emu, AUTH_EMULATOR: 'false' } as never)).toBe(false);
    expect(authEmulatorEnabled(prod as never)).toBe(false);
    expect(authEmulatorEnabled({ ...prod, FIREBASE_PROJECT_ID: 'x-demo-y' } as never)).toBe(false);
  });

  it('aceita token sem assinatura no modo emulador e valida o resto como sempre', async () => {
    expect((await verifyIdToken(mintUnsigned({ uid: 'emu1' }), emu as never)).uid).toBe('emu1');
    const now = Math.floor(Date.now() / 1000);
    expect(await status(verifyIdToken(mintUnsigned({ uid: 'emu1', exp: now - 5 }), emu as never))).toBe(401);
    expect(await status(verifyIdToken(mintUnsigned({ uid: 'emu1', aud: 'outro' }), emu as never))).toBe(401);
    expect(await status(verifyIdToken(mintUnsigned({ uid: 'emu1', project: 'demo-outro' }), emu as never))).toBe(401);
    expect(await status(verifyIdToken(mintUnsigned({ uid: 'emu1', provider: 'anonymous' }), emu as never))).toBe(401);
    expect(await status(verifyIdToken(mintUnsigned({ uid: '' }), emu as never))).toBe(401);
  });

  it('projeto demo-* sem a variavel: token sem assinatura = 401', async () => {
    expect(await status(verifyIdToken(mintUnsigned({ uid: 'emu1' }), { ...emu, AUTH_EMULATOR: undefined } as never))).toBe(401);
    const response = await callWithEnv({ AUTH_EMULATOR: undefined }, '/v1/churches/igreja-a/blobs/' + 'a'.repeat(64), {
      method: 'HEAD',
      token: mintUnsigned({ uid: 'emu1' })
    });
    expect(response.status).toBe(401);
  });

  it('projeto que nao comeca com demo-: impossivel mesmo com AUTH_EMULATOR=true', async () => {
    const token = mintUnsigned({ uid: 'emu1', project: 'lagoinha-joao-pessoa' });
    expect(await status(verifyIdToken(token, prod as never))).toBe(401);
    const response = await callWithEnv(prod, '/v1/churches/igreja-a/blobs/' + 'a'.repeat(64), { method: 'HEAD', token });
    expect(response.status).toBe(401);
  });
});
