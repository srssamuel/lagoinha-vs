import type { Env } from './env';
import { HttpError, unauthenticated } from './http';

type FsValue = Record<string, unknown>;

/** Converte o formato de valores tipados da REST do Firestore para JS puro. */
export function fromFirestoreValue(value: FsValue): unknown {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue === true;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('stringValue' in value) return String(value.stringValue);
  if ('timestampValue' in value) return String(value.timestampValue);
  if ('referenceValue' in value) return String(value.referenceValue);
  if ('bytesValue' in value) return String(value.bytesValue);
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: FsValue[] } | undefined)?.values ?? [];
    return values.map(fromFirestoreValue);
  }
  if ('mapValue' in value) {
    return fromFirestoreFields((value.mapValue as { fields?: Record<string, FsValue> } | undefined)?.fields);
  }
  return undefined;
}

export function fromFirestoreFields(fields: Record<string, FsValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) out[key] = fromFirestoreValue(value);
  return out;
}

export type DocResult =
  | { status: 'ok'; data: Record<string, unknown> }
  | { status: 'denied' }
  | { status: 'missing' };

/** Valor gravado pelo Worker: texto, numero ou instante (timestampValue). */
export type FsWrite = string | number | { timestamp: string };

function toFirestoreValue(value: FsWrite): FsValue {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { timestampValue: value.timestamp };
}

/**
 * Atualiza so os campos indicados (updateMask), com o token DO USUARIO: as regras continuam decidindo.
 * Exige que o documento exista (currentDocument.exists=true): o Worker nunca cria musica.
 */
export async function patchDocument(
  env: Env,
  userToken: string,
  path: string,
  fields: Record<string, FsWrite>
): Promise<'ok' | 'denied' | 'missing'> {
  const params = new URLSearchParams({ 'currentDocument.exists': 'true' });
  for (const key of Object.keys(fields)) params.append('updateMask.fieldPaths', key);
  const url = `${env.FIRESTORE_BASE}/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}?${params}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${userToken}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFirestoreValue(v)]))
      }),
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new HttpError(502, 'upstream_error');
  }
  await response.body?.cancel().catch(() => undefined);
  if (response.ok) return 'ok';
  if (response.status === 403) return 'denied';
  // currentDocument.exists=true sem documento: 404 (producao) ou 400 FAILED_PRECONDITION (emulador)
  if (response.status === 404 || response.status === 400) return 'missing';
  if (response.status === 401) throw unauthenticated();
  throw new HttpError(502, 'upstream_error');
}

/**
 * Le um documento com o token DO USUARIO: quem decide e firestore.rules. O Worker nao tem
 * credencial propria do Firestore. `path` so recebe segmentos ja validados pelo roteador.
 */
export async function getDocument(env: Env, userToken: string, path: string): Promise<DocResult> {
  const url = `${env.FIRESTORE_BASE}/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${userToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new HttpError(502, 'upstream_error');
  }
  if (response.status === 200) {
    const body = (await response.json().catch(() => null)) as { fields?: Record<string, FsValue> } | null;
    if (!body) throw new HttpError(502, 'upstream_error');
    return { status: 'ok', data: fromFirestoreFields(body.fields) };
  }
  // Libera o corpo sem le-lo.
  await response.body?.cancel().catch(() => undefined);
  if (response.status === 403) return { status: 'denied' };
  if (response.status === 404) return { status: 'missing' };
  if (response.status === 401) throw unauthenticated();
  throw new HttpError(502, 'upstream_error');
}
