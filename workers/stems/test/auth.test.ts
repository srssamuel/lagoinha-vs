import { beforeAll, describe, expect, it } from 'vitest';
import { fromFirestoreFields } from '../src/firestore';
import { applyMigrations, call, generateKeys, mintToken, mockJwks, type TestKeys } from './helpers';

const SHA = 'a'.repeat(64);
const PATH = `/v1/churches/igreja-a/blobs/${SHA}`;

let keys: TestKeys;
let other: TestKeys;

beforeAll(async () => {
  keys = await generateKeys();
  other = await generateKeys();
  mockJwks(keys);
  await applyMigrations();
});

describe('GET /health', () => {
  it('responde sem token', async () => {
    const response = await call('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, version: 'dev' });
  });
});

describe('autenticacao (contrato, secoes 3 e 8.2): tudo 401 {"error":"unauthenticated"}', () => {
  async function expect401(token: string | null, headers: Record<string, string> = {}) {
    const response = await call(PATH, { method: 'HEAD', token, headers });
    expect(response.status).toBe(401);
    const get = await call(PATH, { token, headers });
    expect(await get.json()).toEqual({ error: 'unauthenticated' });
  }

  it('sem token', () => expect401(null));
  it('cabecalho que nao e Bearer', () => expect401(null, { authorization: 'Basic abc' }));
  it('lixo no lugar do token', () => expect401('nao.e.um-jwt'));
  it('token anonimo', async () => expect401(await mintToken(keys, { uid: 'u1', provider: 'anonymous' })));
  it('token de outro projeto (iss e aud)', async () =>
    expect401(
      await mintToken(keys, { uid: 'u1', iss: 'https://securetoken.google.com/outro', aud: 'outro' })
    ));
  it('aud errado', async () => expect401(await mintToken(keys, { uid: 'u1', aud: 'outro' })));
  it('iss errado', async () => expect401(await mintToken(keys, { uid: 'u1', iss: 'https://evil.example/demo-lagoinha-vs' })));
  it('expirado', async () => expect401(await mintToken(keys, { uid: 'u1', exp: Math.floor(Date.now() / 1000) - 5 })));
  it('emitido no futuro', async () =>
    expect401(await mintToken(keys, { uid: 'u1', iat: Math.floor(Date.now() / 1000) + 3600 })));
  it('assinatura de outra chave com o mesmo kid', async () =>
    expect401(await mintToken(keys, { uid: 'u1', signWith: other.privateKey })));
  it('kid desconhecido', async () => expect401(await mintToken(keys, { uid: 'u1', kid: 'nao-existe' })));
  it('alg diferente de RS256', async () => expect401(await mintToken(keys, { uid: 'u1', alg: 'HS256' })));
  it('alg none', async () => expect401(await mintToken(keys, { uid: 'u1', alg: 'none' })));
  it('sub vazio', async () => expect401(await mintToken(keys, { uid: '' })));
});

describe('roteamento e CORS', () => {
  it('rota desconhecida e 404, mesmo sem token', async () => {
    expect((await call('/v1/nada')).status).toBe(404);
    expect((await call('/')).status).toBe(404);
  });

  it('id de igreja invalido e hash invalido sao 400 (com token valido)', async () => {
    const token = await mintToken(keys, { uid: 'u1' });
    expect((await call(`/v1/churches/IGREJA_X/blobs/${SHA}`, { token })).status).toBe(400);
    expect((await call(`/v1/churches/igreja-a/blobs/${'A'.repeat(64)}`, { token })).status).toBe(400);
    expect((await call(`/v1/churches/igreja-a/blobs/curto`, { token })).status).toBe(400);
  });

  it('preflight so libera origens da lista', async () => {
    const ok = await call(PATH, { method: 'OPTIONS', origin: 'http://localhost:5173' });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(ok.headers.get('access-control-allow-headers')).toContain('authorization');
    const bad = await call(PATH, { method: 'OPTIONS', origin: 'https://evil.example' });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('respostas de erro tambem levam CORS da origem permitida', async () => {
    const ok = await call(PATH, { origin: 'https://lagoinha-vs-jp.web.app' });
    expect(ok.status).toBe(401);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://lagoinha-vs-jp.web.app');
    const bad = await call(PATH, { origin: 'https://evil.example' });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('conversao de valores do Firestore REST', () => {
  it('converte os tipos usados nas regras e nas versoes', () => {
    const data = fromFirestoreFields({
      status: { stringValue: 'active' },
      n: { integerValue: '42' },
      d: { doubleValue: 1.5 },
      ok: { booleanValue: true },
      nada: { nullValue: null },
      at: { timestampValue: '2026-10-21T00:00:00Z' },
      stems: {
        arrayValue: {
          values: [{ mapValue: { fields: { sha256: { stringValue: 'abc' }, size: { integerValue: '7' } } } }]
        }
      },
      vazio: { arrayValue: {} }
    });
    expect(data).toEqual({
      status: 'active',
      n: 42,
      d: 1.5,
      ok: true,
      nada: null,
      at: '2026-10-21T00:00:00Z',
      stems: [{ sha256: 'abc', size: 7 }],
      vazio: []
    });
  });
});
