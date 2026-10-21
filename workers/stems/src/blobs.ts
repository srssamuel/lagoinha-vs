import { authorizeRead, authorizeWrite } from './authz';
import type { Env } from './env';
import { HttpError, badRequest, forbidden, json, notFound } from './http';
import type { VerifiedToken } from './jwt';
import {
  type BlobRow,
  type SourceInput,
  deleteUploadStatement,
  getBlob,
  getUpload,
  insertBlob,
  insertBlobStatement,
  insertUpload,
  upsertSource
} from './registry';
import { type Route, type Scope, r2Key, validIdSegment } from './route';

/** O plano Workers Free aceita corpo de ate 100 MB; fica folga para o envelope. */
export const MAX_BODY_BYTES = 95 * 1024 * 1024;
/** Teto de um arquivo montado por multipart (contrato nao define; evita estourar a cota do R2 por engano). */
export const MAX_BLOB_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_NAME_LENGTH = 255;
const MAX_JSON_BYTES = 64 * 1024;

type Handler<R extends Route['type']> = (
  request: Request,
  env: Env,
  auth: VerifiedToken,
  route: Extract<Route, { type: R }>
) => Promise<Response>;

// ---------- utilitarios ----------

const nowIso = (): string => new Date().toISOString();

function declaredLength(request: Request): number {
  const raw = request.headers.get('content-length');
  if (raw === null || !/^\d{1,12}$/.test(raw)) throw new HttpError(411, 'length_required');
  const length = Number(raw);
  if (length < 1) throw badRequest('empty_body');
  if (length > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large');
  return length;
}

/** Content-type gravado: so `tipo/subtipo` sem parametros; qualquer outra coisa vira octet-stream. */
function cleanContentType(value: string | null | undefined): string {
  const base = value?.split(';')[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/.test(base)
    ? base
    : 'application/octet-stream';
}

function originalName(request: Request): string | null {
  const name = request.headers.get('x-original-name');
  if (name === null || name === '') return null;
  if (name.length > MAX_NAME_LENGTH) throw badRequest('name_too_long');
  return name;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new HttpError(413, 'payload_too_large');
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // cai no erro abaixo
  }
  throw badRequest('invalid_json');
}

function isChecksumError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : '';
  return /checksum|sha-?256|10037/i.test(message);
}

/** Cada rota de escrita comeca aqui: autoriza pelo Firestore, com o token do usuario. */
async function requireWrite(env: Env, auth: VerifiedToken, scope: Scope): Promise<void> {
  await authorizeWrite(env, auth.raw, auth.uid, scope);
}

async function requireOwnUpload(env: Env, auth: VerifiedToken, route: { scope: Scope; sha256: string; uploadId: string }) {
  const row = await getUpload(env.REGISTRY, route.uploadId);
  if (!row) throw notFound('upload_not_found');
  // Mesmo uid, mesmo escopo, mesmo hash que abriram o upload.
  if (row.uid !== auth.uid || row.scope !== route.scope.key || row.sha256 !== route.sha256) throw forbidden();
  return row;
}

function blobHeaders(row: Pick<BlobRow, 'integrity'>, sha256: string): Headers {
  return new Headers({
    'x-integrity': row.integrity,
    'x-content-sha256': sha256,
    'x-content-type-options': 'nosniff'
  });
}

// ---------- blobs ----------

export const headBlob: Handler<'blob'> = async (_request, env, auth, route) => {
  await requireWrite(env, auth, route.scope);
  const row = await getBlob(env.REGISTRY, route.scope.key, route.sha256);
  if (!row) throw notFound('blob_not_found');
  const headers = blobHeaders(row, route.sha256);
  headers.set('content-length', String(row.size));
  return new Response(null, { status: 200, headers });
};

export const putBlob: Handler<'blob'> = async (request, env, auth, route) => {
  await requireWrite(env, auth, route.scope);
  const length = declaredLength(request);
  const name = originalName(request);
  const contentType = cleanContentType(request.headers.get('content-type'));

  const existing = await getBlob(env.REGISTRY, route.scope.key, route.sha256);
  if (existing) return json({ ok: true, existed: true, size: existing.size, integrity: existing.integrity }, 200);

  let stored: R2Object;
  try {
    stored = await env.STEMS.put(r2Key(route.scope, route.sha256), request.body, {
      sha256: route.sha256,
      httpMetadata: { contentType },
      customMetadata: { uploadedBy: auth.uid, ...(name ? { originalName: name } : {}) }
    });
  } catch (err) {
    if (isChecksumError(err)) throw badRequest('sha256_mismatch');
    throw err;
  }
  if (stored.size !== length) {
    // Nao deveria ocorrer (o R2 le exatamente o corpo); por seguranca nao registra.
    await env.STEMS.delete(r2Key(route.scope, route.sha256));
    throw badRequest('size_mismatch');
  }

  await insertBlob(env.REGISTRY, {
    scope: route.scope.key,
    sha256: route.sha256,
    size: stored.size,
    content_type: contentType,
    original_name: name,
    integrity: 'r2-sha256',
    uploaded_by: auth.uid,
    uploaded_at: nowIso()
  });
  return json({ ok: true, existed: false, size: stored.size, integrity: 'r2-sha256' }, 201);
};

function resolveRange(range: R2Range, size: number): { start: number; end: number } {
  if ('suffix' in range && range.suffix !== undefined) {
    return { start: Math.max(0, size - range.suffix), end: size - 1 };
  }
  const offset = 'offset' in range && range.offset !== undefined ? range.offset : 0;
  const length = 'length' in range && range.length !== undefined ? range.length : size - offset;
  return { start: offset, end: Math.min(size - 1, offset + length - 1) };
}

export const getBlobBytes: Handler<'blob'> = async (request, env, auth, route) => {
  const url = new URL(request.url);
  const songId = url.searchParams.get('song');
  const versionId = url.searchParams.get('version');
  if (!validIdSegment(songId) || !validIdSegment(versionId)) throw badRequest('song_and_version_required');

  const row = await authorizeRead(env, auth.raw, route.scope, route.sha256, songId, versionId);

  const key = r2Key(route.scope, route.sha256);
  const wantsRange = request.headers.has('range');
  let object: R2ObjectBody | R2Object | null;
  try {
    object = await env.STEMS.get(key, wantsRange ? { range: request.headers } : undefined);
  } catch {
    // Faixa invalida / fora do arquivo.
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${row.size}` } });
  }
  if (!object) throw notFound('blob_not_found');
  if (!('body' in object)) throw notFound('blob_not_found');

  const headers = blobHeaders(row, route.sha256);
  headers.set('content-type', cleanContentType(object.httpMetadata?.contentType ?? row.content_type));
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  // Conteudo enviado por usuarios nunca e interpretado pelo navegador.
  headers.set('content-disposition', 'attachment');
  headers.set('content-security-policy', "default-src 'none'; sandbox");
  headers.set('cache-control', 'private, no-cache');

  if (wantsRange && object.range) {
    const { start, end } = resolveRange(object.range, object.size);
    headers.set('content-range', `bytes ${start}-${end}/${object.size}`);
    headers.set('content-length', String(end - start + 1));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('content-length', String(object.size));
  return new Response(object.body, { status: 200, headers });
};

// ---------- multipart ----------

export const createMultipart: Handler<'multipart-create'> = async (request, env, auth, route) => {
  await requireWrite(env, auth, route.scope);
  const body = await readJson(request);
  const size = body.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > MAX_BLOB_BYTES) {
    throw badRequest('invalid_size');
  }
  // Campos extras (scope, key, rightsClass, ...) sao ignorados de proposito.
  const contentType = cleanContentType(typeof body.contentType === 'string' ? body.contentType : null);
  const name = originalName(request);

  // Multipart nao e conferido pelo R2: nunca pode sobrescrever um blob ja registrado (r2-sha256 ou nao).
  if (await getBlob(env.REGISTRY, route.scope.key, route.sha256)) throw new HttpError(409, 'already_exists');

  const upload = await env.STEMS.createMultipartUpload(r2Key(route.scope, route.sha256), {
    httpMetadata: { contentType },
    customMetadata: { uploadedBy: auth.uid, ...(name ? { originalName: name } : {}) }
  });
  await insertUpload(env.REGISTRY, {
    upload_id: upload.uploadId,
    scope: route.scope.key,
    sha256: route.sha256,
    uid: auth.uid,
    size,
    content_type: contentType,
    created_at: nowIso()
  });
  return json({ uploadId: upload.uploadId }, 201);
};

export const putPart: Handler<'multipart-part'> = async (request, env, auth, route) => {
  await requireWrite(env, auth, route.scope);
  await requireOwnUpload(env, auth, route);
  declaredLength(request);
  const upload = env.STEMS.resumeMultipartUpload(r2Key(route.scope, route.sha256), route.uploadId);
  const part = await upload.uploadPart(route.partNumber, request.body as ReadableStream);
  return json({ etag: part.etag, partNumber: part.partNumber }, 200);
};

function parseParts(body: Record<string, unknown>): R2UploadedPart[] {
  const parts = body.parts;
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 10000) throw badRequest('invalid_parts');
  const seen = new Set<number>();
  return parts.map((p) => {
    const part = p as Record<string, unknown> | null;
    const partNumber = part?.partNumber;
    const etag = part?.etag;
    if (
      typeof partNumber !== 'number' ||
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > 10000 ||
      seen.has(partNumber) ||
      typeof etag !== 'string' ||
      etag === '' ||
      etag.length > 200
    ) {
      throw badRequest('invalid_parts');
    }
    seen.add(partNumber);
    return { partNumber, etag };
  });
}

export const completeMultipart: Handler<'multipart-complete'> = async (request, env, auth, route) => {
  await requireWrite(env, auth, route.scope);
  const row = await requireOwnUpload(env, auth, route);
  const parts = parseParts(await readJson(request));
  const key = r2Key(route.scope, route.sha256);
  const upload = env.STEMS.resumeMultipartUpload(key, route.uploadId);

  // Reconfere logo antes de gravar: outro upload pode ter registrado o hash desde a abertura.
  if (await getBlob(env.REGISTRY, route.scope.key, route.sha256)) {
    await upload.abort().catch(() => undefined);
    await deleteUploadStatement(env.REGISTRY, route.uploadId).run();
    throw new HttpError(409, 'already_exists');
  }

  let object: R2Object;
  try {
    object = await upload.complete(parts);
  } catch {
    throw badRequest('invalid_parts');
  }
  if (row.size !== null && object.size !== row.size) {
    await env.STEMS.delete(key);
    await deleteUploadStatement(env.REGISTRY, route.uploadId).run();
    throw badRequest('size_mismatch');
  }

  await env.REGISTRY.batch([
    insertBlobStatement(env.REGISTRY, {
      scope: route.scope.key,
      sha256: route.sha256,
      size: object.size,
      content_type: row.content_type,
      original_name: object.customMetadata?.originalName ?? null,
      integrity: 'client-declared',
      uploaded_by: auth.uid,
      uploaded_at: nowIso()
    }),
    deleteUploadStatement(env.REGISTRY, route.uploadId)
  ]);
  return json({ ok: true, size: object.size, integrity: 'client-declared' }, 201);
};

export const abortMultipart: Handler<'multipart-abort'> = async (_request, env, auth, route) => {
  await requireWrite(env, auth, route.scope);
  await requireOwnUpload(env, auth, route);
  const upload = env.STEMS.resumeMultipartUpload(r2Key(route.scope, route.sha256), route.uploadId);
  await upload.abort().catch(() => undefined);
  await deleteUploadStatement(env.REGISTRY, route.uploadId).run();
  return new Response(null, { status: 204 });
};

// ---------- origem ----------

function optionalString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > max) throw badRequest('invalid_source');
  return value;
}

function parseSource(body: Record<string, unknown>): SourceInput {
  const kind = body.kind;
  if (kind !== 'drive' && kind !== 'app' && kind !== 'zip-entry') throw badRequest('invalid_source');
  const sourceId = optionalString(body.sourceId, 1024);
  if (!sourceId) throw badRequest('invalid_source');
  const modifiedAt = optionalString(body.modifiedAt, 40);
  if (modifiedAt !== null && Number.isNaN(Date.parse(modifiedAt))) throw badRequest('invalid_source');
  const md5 = optionalString(body.md5, 32);
  if (md5 !== null && !/^[0-9a-fA-F]{32}$/.test(md5)) throw badRequest('invalid_source');
  const size = body.size;
  if (size !== undefined && size !== null && (typeof size !== 'number' || !Number.isInteger(size) || size < 0)) {
    throw badRequest('invalid_source');
  }
  return {
    kind,
    sourceId,
    path: optionalString(body.path, 2048),
    name: optionalString(body.name, 1024),
    modifiedAt,
    size: typeof size === 'number' ? size : null,
    md5: md5 ? md5.toLowerCase() : null
  };
}

export const recordSource: Handler<'sources'> = async (request, env, auth, route) => {
  await requireWrite(env, auth, route.scope);
  const source = parseSource(await readJson(request));
  if (!(await getBlob(env.REGISTRY, route.scope.key, route.sha256))) throw notFound('blob_not_registered');
  await upsertSource(env.REGISTRY, route.scope.key, route.sha256, auth.uid, nowIso(), source);
  return json({ ok: true }, 201);
};
