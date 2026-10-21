import { authorizeAdmin, authorizeRead, authorizeWrite } from './authz';
import type { Env } from './env';
import { HttpError, badRequest, forbidden, json, notFound } from './http';
import type { VerifiedToken } from './jwt';
import {
  type BlobRow,
  MAX_OPEN_UPLOADS_PER_UID,
  type SourceInput,
  acquireReservation,
  countOpenUploads,
  deleteBlobStatements,
  deleteUploadWithPartsStatements,
  getBlob,
  getUpload,
  insertBlobStatement,
  insertUpload,
  purgeStaleUploads,
  recordPart,
  releaseReservation,
  sumPartsExcept,
  upsertBlobStatement,
  upsertSource
} from './registry';
import { type Route, type Scope, r2Key, validIdSegment } from './route';

/** O plano Workers Free aceita corpo de ate 100 MB; fica folga para o envelope. */
export const MAX_BODY_BYTES = 95 * 1024 * 1024;
/** Teto de um arquivo montado por multipart (evita estourar a cota do R2 por engano). */
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

/** Le o corpo JSON com teto de 64 KB: confere content-length e conta os bytes lidos (chunked). */
async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d{1,12}$/.test(declared) || Number(declared) > MAX_JSON_BYTES)) {
    throw new HttpError(413, 'payload_too_large');
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError(413, 'payload_too_large');
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
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

/**
 * Um escritor por (escopo, hash) de cada vez: PUT, complete do multipart e exclusao disputam a mesma
 * reserva (INSERT condicional no D1). Quem perde recebe 409; ninguem apaga ou sobrescreve o objeto
 * que outro acabou de conferir.
 */
async function withReservation<T>(env: Env, scope: Scope, sha256: string, fn: () => Promise<T>): Promise<T> {
  const holder = crypto.randomUUID();
  if (!(await acquireReservation(env.REGISTRY, scope.key, sha256, holder))) throw new HttpError(409, 'in_progress');
  try {
    return await fn();
  } finally {
    await releaseReservation(env.REGISTRY, scope.key, sha256, holder).catch(() => undefined);
  }
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

  const alreadyVerified = (row: BlobRow | null): Response | null =>
    row && row.integrity === 'r2-sha256'
      ? json({ ok: true, existed: true, size: row.size, integrity: row.integrity }, 200)
      : null;

  const early = alreadyVerified(await getBlob(env.REGISTRY, route.scope.key, route.sha256));
  if (early) return early;

  // Registro ausente OU client-declared (multipart nao conferido): o PUT regrava com sha256 conferido
  // pelo R2 e promove para r2-sha256, entao ninguem consegue "pre-reservar" um hash com conteudo falso.
  return withReservation(env, route.scope, route.sha256, async () => {
    const current = await getBlob(env.REGISTRY, route.scope.key, route.sha256);
    const verified = alreadyVerified(current);
    if (verified) return verified;

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
      // Nao deveria ocorrer; sob a reserva nenhum objeto conferido pode estar neste caminho, so o nosso.
      if (!current) await env.STEMS.delete(r2Key(route.scope, route.sha256));
      throw badRequest('size_mismatch');
    }

    await upsertBlobStatement(env.REGISTRY, {
      scope: route.scope.key,
      sha256: route.sha256,
      size: stored.size,
      content_type: contentType,
      original_name: name,
      integrity: 'r2-sha256',
      uploaded_by: auth.uid,
      uploaded_at: nowIso()
    }).run();
    return json({ ok: true, existed: false, promoted: current !== null, size: stored.size, integrity: 'r2-sha256' }, 201);
  });
};

/** Exclusao: so admin da igreja (ou curador, no catalogo). Remove o objeto, o registro e as origens. */
export const deleteBlob: Handler<'blob'> = async (_request, env, auth, route) => {
  await authorizeAdmin(env, auth.raw, auth.uid, route.scope);
  return withReservation(env, route.scope, route.sha256, async () => {
    if (!(await getBlob(env.REGISTRY, route.scope.key, route.sha256))) throw notFound('blob_not_found');
    await env.STEMS.delete(r2Key(route.scope, route.sha256));
    await env.REGISTRY.batch(deleteBlobStatements(env.REGISTRY, route.scope.key, route.sha256));
    return new Response(null, { status: 204 });
  });
};

/**
 * Interpreta `Range: bytes=...` (uma unica faixa). Invalido, insatisfazivel ou multiplo = null (416).
 */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d{0,15})-(\d{0,15})$/.exec(header.trim());
  if (!match) return null;
  const [, first = '', last = ''] = match;
  if (first === '' && last === '') return null;
  if (first === '') {
    const suffix = Number(last);
    if (suffix === 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (start >= size) return null;
  if (last === '') return { start, end: size - 1 };
  const end = Number(last);
  if (end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

export const getBlobBytes: Handler<'blob'> = async (request, env, auth, route) => {
  const url = new URL(request.url);
  const songId = url.searchParams.get('song');
  const versionId = url.searchParams.get('version');
  if (!validIdSegment(songId) || !validIdSegment(versionId)) throw badRequest('song_and_version_required');

  const row = await authorizeRead(env, auth.raw, route.scope, route.sha256, songId, versionId);

  const rangeHeader = request.headers.get('range');
  let range: { start: number; end: number } | null = null;
  if (rangeHeader !== null) {
    range = parseRange(rangeHeader, row.size);
    if (!range) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${row.size}` } });
  }

  let object: R2ObjectBody | null;
  try {
    object = (await env.STEMS.get(
      r2Key(route.scope, route.sha256),
      range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : undefined
    )) as R2ObjectBody | null;
  } catch {
    throw new HttpError(502, 'upstream_error');
  }
  if (!object) throw notFound('blob_not_found');

  const headers = blobHeaders(row, route.sha256);
  headers.set('content-type', cleanContentType(object.httpMetadata?.contentType ?? row.content_type));
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  // Conteudo enviado por usuarios nunca e interpretado pelo navegador.
  headers.set('content-disposition', 'attachment');
  headers.set('content-security-policy', "default-src 'none'; sandbox");
  headers.set('cache-control', 'private, no-cache');

  if (range) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${object.size}`);
    headers.set('content-length', String(range.end - range.start + 1));
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

  // Multipart nao e conferido pelo R2: nunca pode sobrescrever um blob ja registrado.
  if (await getBlob(env.REGISTRY, route.scope.key, route.sha256)) throw new HttpError(409, 'already_exists');

  await purgeStaleUploads(env.REGISTRY);
  if ((await countOpenUploads(env.REGISTRY, auth.uid)) >= MAX_OPEN_UPLOADS_PER_UID) {
    throw new HttpError(429, 'too_many_uploads');
  }

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
  const row = await requireOwnUpload(env, auth, route);
  const length = declaredLength(request);
  // A soma das partes nao passa do tamanho declarado na abertura (reenvio da mesma parte substitui a anterior).
  if (row.size !== null && (await sumPartsExcept(env.REGISTRY, route.uploadId, route.partNumber)) + length > row.size) {
    throw new HttpError(413, 'parts_exceed_size');
  }
  const upload = env.STEMS.resumeMultipartUpload(r2Key(route.scope, route.sha256), route.uploadId);
  const part = await upload.uploadPart(route.partNumber, request.body as ReadableStream);
  await recordPart(env.REGISTRY, route.uploadId, route.partNumber, length);
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
  const dropUpload = () => env.REGISTRY.batch(deleteUploadWithPartsStatements(env.REGISTRY, route.uploadId));

  return withReservation(env, route.scope, route.sha256, async () => {
    // Sob a reserva: se alguem registrou o hash desde a abertura, este upload nao pode escrever na chave.
    if (await getBlob(env.REGISTRY, route.scope.key, route.sha256)) {
      await upload.abort().catch(() => undefined);
      await dropUpload();
      throw new HttpError(409, 'already_exists');
    }

    let object: R2Object;
    try {
      object = await upload.complete(parts);
    } catch {
      throw badRequest('invalid_parts');
    }
    if (row.size !== null && object.size !== row.size) {
      // Seguro apagar: nenhum blob registrado existe e a reserva impede PUT/exclusao concorrentes.
      await env.STEMS.delete(key);
      await dropUpload();
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
      ...deleteUploadWithPartsStatements(env.REGISTRY, route.uploadId)
    ]);
    return json({ ok: true, size: object.size, integrity: 'client-declared' }, 201);
  });
};

export const abortMultipart: Handler<'multipart-abort'> = async (_request, env, auth, route) => {
  await requireWrite(env, auth, route.scope);
  await requireOwnUpload(env, auth, route);
  const upload = env.STEMS.resumeMultipartUpload(r2Key(route.scope, route.sha256), route.uploadId);
  await upload.abort().catch(() => undefined);
  await env.REGISTRY.batch(deleteUploadWithPartsStatements(env.REGISTRY, route.uploadId));
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
