import type { Env } from './env';
import { HttpError, unauthenticated } from './http';

export interface VerifiedToken {
  /** uid do Firebase (claim `sub`) */
  uid: string;
  /** Token bruto: so repassado ao Firestore, nunca registrado em log nem gravado. */
  raw: string;
}

const MAX_TOKEN_LENGTH = 8192;
const CLOCK_SKEW_SEC = 60;
const DEFAULT_JWKS_TTL_SEC = 3600;
/** Chave desconhecida so provoca nova busca do JWKS depois deste intervalo (evita amplificacao). */
const MIN_REFETCH_MS = 60_000;

interface JwksCache {
  url: string;
  keys: Map<string, CryptoKey>;
  expiresAt: number;
  fetchedAt: number;
}

let jwksCache: JwksCache | null = null;

function b64urlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw unauthenticated();
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(part: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // cai no erro abaixo
  }
  throw unauthenticated();
}

function maxAgeSeconds(cacheControl: string | null): number {
  const match = cacheControl?.match(/max-age=(\d+)/i);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 24 * 3600) : DEFAULT_JWKS_TTL_SEC;
}

async function refreshJwks(env: Env, now: number): Promise<JwksCache> {
  let response: Response;
  try {
    response = await fetch(env.JWKS_URL, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new HttpError(503, 'auth_unavailable');
  }
  if (!response.ok) throw new HttpError(503, 'auth_unavailable');
  const body = (await response.json().catch(() => null)) as { keys?: unknown } | null;
  if (!body || !Array.isArray(body.keys)) throw new HttpError(503, 'auth_unavailable');

  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys as Array<Record<string, unknown>>) {
    if (jwk.kty !== 'RSA' || typeof jwk.kid !== 'string') continue;
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', n: jwk.n as string, e: jwk.e as string, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      keys.set(jwk.kid, key);
    } catch {
      // chave malformada: ignora
    }
  }
  jwksCache = {
    url: env.JWKS_URL,
    keys,
    expiresAt: now + maxAgeSeconds(response.headers.get('cache-control')) * 1000,
    fetchedAt: now
  };
  return jwksCache;
}

async function getKey(kid: string, env: Env, now: number): Promise<CryptoKey | null> {
  let cache = jwksCache && jwksCache.url === env.JWKS_URL ? jwksCache : null;
  if (!cache || now >= cache.expiresAt) cache = await refreshJwks(env, now);
  const known = cache.keys.get(kid);
  if (known) return known;
  if (now - cache.fetchedAt >= MIN_REFETCH_MS) cache = await refreshJwks(env, now);
  return cache.keys.get(kid) ?? null;
}

/**
 * Valida um ID token do Firebase (contrato, secao 3). Qualquer falha de token vira 401;
 * so a indisponibilidade do JWKS vira 503.
 */
export async function verifyIdToken(token: string, env: Env, now = Date.now()): Promise<VerifiedToken> {
  if (!token || token.length > MAX_TOKEN_LENGTH) throw unauthenticated();
  const parts = token.split('.');
  if (parts.length !== 3) throw unauthenticated();
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  const header = decodeJson(headerPart);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid === '') throw unauthenticated();

  const key = await getKey(header.kid, env, now);
  if (!key) throw unauthenticated();

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`)
  );
  if (!valid) throw unauthenticated();

  const claims = decodeJson(payloadPart);
  const nowSec = Math.floor(now / 1000);
  const issuer = `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`;
  if (claims.iss !== issuer || claims.aud !== env.FIREBASE_PROJECT_ID) throw unauthenticated();
  if (typeof claims.exp !== 'number' || claims.exp <= nowSec) throw unauthenticated();
  if (typeof claims.iat !== 'number' || claims.iat > nowSec + CLOCK_SKEW_SEC) throw unauthenticated();
  if (typeof claims.sub !== 'string' || claims.sub === '' || claims.sub.length > 128) throw unauthenticated();
  if (typeof claims.auth_time === 'number' && claims.auth_time > nowSec + CLOCK_SKEW_SEC) throw unauthenticated();

  const firebase = claims.firebase;
  const provider =
    firebase && typeof firebase === 'object' ? (firebase as Record<string, unknown>).sign_in_provider : undefined;
  // Mais estrito que o contrato: ausente tambem e recusado (tokens reais do Firebase sempre trazem o campo).
  if (typeof provider !== 'string' || provider === 'anonymous') throw unauthenticated();

  return { uid: claims.sub, raw: token };
}
