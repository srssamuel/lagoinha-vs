import { applyD1Migrations } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { vi } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
      EMULATOR: string;
    }
  }
}

export const PROJECT = 'demo-lagoinha-vs';
export const KID = 'test-key-1';
export const EMULATOR = env.EMULATOR === '1';

// ---------- chaves RS256 de teste e JWKS interceptado ----------

export interface TestKeys {
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
}

export async function generateKeys(): Promise<TestKeys> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  return { privateKey: pair.privateKey, publicJwk };
}

const realFetch = globalThis.fetch.bind(globalThis);

/** Serve o JWKS de teste no host ficticio de `JWKS_URL`; todo o resto passa para a rede real. */
export function mockJwks(keys: TestKeys): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url === env.JWKS_URL) {
      return new Response(JSON.stringify({ keys: [{ ...keys.publicJwk, kid: KID, use: 'sig', alg: 'RS256' }] }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' }
      });
    }
    return realFetch(input as RequestInfo, init);
  });
}

const b64url = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export interface TokenOptions {
  uid: string;
  provider?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  kid?: string;
  alg?: string;
  signWith?: CryptoKey;
}

export async function mintToken(keys: TestKeys, opts: TokenOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: opts.alg ?? 'RS256', kid: opts.kid ?? KID, typ: 'JWT' };
  const payload = {
    iss: opts.iss ?? `https://securetoken.google.com/${PROJECT}`,
    aud: opts.aud ?? PROJECT,
    auth_time: now - 10,
    user_id: opts.uid,
    sub: opts.uid,
    iat: opts.iat ?? now - 5,
    exp: opts.exp ?? now + 3600,
    firebase: { identities: {}, sign_in_provider: opts.provider ?? 'google.com' }
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    opts.signWith ?? keys.privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64url(signature)}`;
}

// ---------- chamadas ao Worker ----------

export interface CallOptions {
  method?: string;
  token?: string | null;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  origin?: string;
}

export function call(path: string, opts: CallOptions = {}): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`);
  if (opts.origin) headers.set('origin', opts.origin);
  return (exports as unknown as { default: Fetcher }).default.fetch(
    new Request(`https://stems.test${path}`, { method: opts.method ?? 'GET', headers, body: opts.body ?? null })
  );
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomBytes(size: number): Uint8Array {
  const out = new Uint8Array(size);
  // getRandomValues aceita no maximo 64 KiB por chamada
  for (let i = 0; i < size; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(size, i + 65536)));
  return out;
}

export async function applyMigrations(): Promise<void> {
  await applyD1Migrations(env.REGISTRY, env.TEST_MIGRATIONS);
}

// ---------- Firestore Emulator (estado preparado por REST, como dono) ----------

type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };

function toValue(v: Plain): Record<string, unknown> {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}

function toFields(obj: { [key: string]: Plain }): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
}

/** Grava um documento ignorando as regras (`Authorization: Bearer owner` do emulador). */
export async function seed(path: string, data: { [key: string]: Plain }): Promise<void> {
  const url = `${env.FIRESTORE_BASE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
  const response = await realFetch(url, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) })
  });
  if (!response.ok) throw new Error(`seed ${path} falhou: ${response.status} ${await response.text()}`);
}

export async function clearFirestore(): Promise<void> {
  const response = await realFetch(`${env.FIRESTORE_BASE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error(`limpar emulador falhou: ${response.status}`);
}

