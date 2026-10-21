import { badRequest, notFound } from './http';

export type Scope =
  | { kind: 'church'; churchId: string; key: string; r2Prefix: string }
  | { kind: 'catalog'; key: 'catalog'; r2Prefix: string };

export type Route =
  | { type: 'blob'; scope: Scope; sha256: string }
  | { type: 'multipart-create'; scope: Scope; sha256: string }
  | { type: 'multipart-part'; scope: Scope; sha256: string; uploadId: string; partNumber: number }
  | { type: 'multipart-complete'; scope: Scope; sha256: string; uploadId: string }
  | { type: 'multipart-abort'; scope: Scope; sha256: string; uploadId: string }
  | { type: 'sources'; scope: Scope; sha256: string };

const SHA256 = /^[0-9a-f]{64}$/;
const CHURCH_ID = /^[a-z0-9-]{1,64}$/;

/** Montado pelo Worker a partir da rota: o cliente nunca informa chave ou escopo no corpo. */
export function r2Key(scope: Scope, sha256: string): string {
  return `${scope.r2Prefix}/blobs/${sha256}`;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw badRequest();
  }
}

/** Interpreta `/v1/...`. Metodo e tratado por quem chama (405 se nao existir para a rota). */
export function parseRoute(pathname: string, method: string): Route {
  const segments = pathname.split('/').filter((s, i) => !(i === 0 && s === ''));
  if (segments[0] !== 'v1') throw notFound();
  let rest = segments.slice(1);

  let scope: Scope;
  if (rest[0] === 'catalog') {
    scope = { kind: 'catalog', key: 'catalog', r2Prefix: 'catalog' };
    rest = rest.slice(1);
  } else if (rest[0] === 'churches' && rest[1] !== undefined) {
    const churchId = decode(rest[1]);
    if (!CHURCH_ID.test(churchId)) throw badRequest('invalid_church_id');
    scope = { kind: 'church', churchId, key: `church:${churchId}`, r2Prefix: `churches/${churchId}` };
    rest = rest.slice(2);
  } else {
    throw notFound();
  }

  if (rest[0] !== 'blobs' || rest[1] === undefined) throw notFound();
  const sha256 = decode(rest[1]);
  if (!SHA256.test(sha256)) throw badRequest('invalid_sha256');
  const tail = rest.slice(2).map(decode);

  if (tail.length === 0) return { type: 'blob', scope, sha256 };
  if (tail.length === 1 && tail[0] === 'sources') return { type: 'sources', scope, sha256 };
  if (tail[0] === 'multipart') {
    if (tail.length === 1) return { type: 'multipart-create', scope, sha256 };
    const uploadId = tail[1] as string;
    if (uploadId === '' || uploadId.length > 1024) throw badRequest('invalid_upload_id');
    if (tail.length === 2) return { type: 'multipart-abort', scope, sha256, uploadId };
    if (tail.length === 3) {
      if (tail[2] === 'complete') return { type: 'multipart-complete', scope, sha256, uploadId };
      if (/^\d{1,5}$/.test(tail[2] as string)) {
        const partNumber = Number(tail[2]);
        if (partNumber >= 1 && partNumber <= 10000) return { type: 'multipart-part', scope, sha256, uploadId, partNumber };
      }
      throw badRequest('invalid_part_number');
    }
  }
  void method;
  throw notFound();
}

const ID_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

/** songId / versionId vao direto no caminho do Firestore: so caracteres seguros. */
export function validIdSegment(value: string | null): value is string {
  return value !== null && ID_SEGMENT.test(value);
}
