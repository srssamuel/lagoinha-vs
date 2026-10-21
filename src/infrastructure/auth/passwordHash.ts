/**
 * Hash de senha local com PBKDF2-SHA256 (WebCrypto). Formato: `pbkdf2$<iterações>$<sal b64>$<hash b64>`.
 * Protege a senha guardada no aparelho; não substitui autenticação no servidor.
 */
const ITERATIONS = 310_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const PREFIX = 'pbkdf2';

const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    HASH_BITS
  );
  return new Uint8Array(bits);
}

/** Comparação em tempo constante (não para no primeiro byte diferente). */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export function isModernHash(stored: string | undefined): boolean {
  return Boolean(stored?.startsWith(`${PREFIX}$`));
}

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  if (!stored) return false;
  if (!isModernHash(stored)) {
    // Registro antigo (btoa da senha): confere uma vez para permitir a migração para PBKDF2.
    try {
      return stored === btoa(password);
    } catch {
      return false;
    }
  }
  const [, iterStr, saltB64, hashB64] = stored.split('$');
  const iterations = Number(iterStr);
  if (!saltB64 || !hashB64 || !Number.isFinite(iterations) || iterations < 1) return false;
  try {
    const expected = fromB64(hashB64);
    const actual = await derive(password, fromB64(saltB64), iterations);
    return equalBytes(actual, expected);
  } catch {
    return false;
  }
}

/** Token de convite imprevisível (o anterior usava Math.random). */
export function randomToken(bytes = 9): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, bytes * 2);
}
