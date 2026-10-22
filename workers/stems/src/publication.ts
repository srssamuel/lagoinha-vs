import { authorizeAdmin, authorizeWrite } from './authz';
import type { Env } from './env';
import { getDocument, patchDocument } from './firestore';
import { HttpError, forbidden, json, notFound } from './http';
import type { VerifiedToken } from './jwt';
import {
  getBlob,
  getPublication,
  isInPublishedVersion,
  markVerifiedStatement,
  publish,
  withdraw,
  deleteBlobStatements
} from './registry';
import { type Route, type Scope, r2Key, validIdSegment } from './route';
import { withReservation } from './reservation';

const STEM_TYPES = new Set(['click', 'guide', 'drums', 'loop', 'bass', 'violao', 'guitars', 'strings', 'keys', 'pad', 'vocals', 'fx']);
const CATALOG_RIGHTS = new Set(['own', 'licensed_redistributable']);
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_STEMS = 64;

const nowIso = (): string => new Date().toISOString();

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 409 com o motivo e o arquivo: o painel mostra exatamente o que falta conferir. */
function blocked(reason: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: reason, ...extra }, 409);
}

// ---------- conferencia do multipart pelo R2 ----------

/**
 * O multipart e montado sem checksum do R2 (`client-declared`). Aqui o Worker regrava o objeto inteiro
 * numa chave temporaria com `sha256` exigido: quem confere o conteudo e o proprio R2, nao o cliente nem o
 * ETag do multipart. Os bytes passam por stream (sem custo de CPU do Worker para o hash).
 * Confere: promove para r2-sha256. Nao confere: o objeto e o registro saem e o painel envia de novo.
 */
export async function verifyBlob(_request: Request, env: Env, auth: VerifiedToken, route: Extract<Route, { type: 'verify' }>) {
  await authorizeWrite(env, auth.raw, auth.uid, route.scope);
  const current = await getBlob(env.REGISTRY, route.scope.key, route.sha256);
  if (!current) throw notFound('blob_not_found');
  if (current.integrity === 'r2-sha256') {
    return json({ ok: true, integrity: 'r2-sha256', verifiedAt: current.verified_at ?? current.uploaded_at, size: current.size });
  }

  return withReservation(env, route.scope, route.sha256, async () => {
    const row = await getBlob(env.REGISTRY, route.scope.key, route.sha256);
    if (!row) throw notFound('blob_not_found');
    if (row.integrity === 'r2-sha256') {
      return json({ ok: true, integrity: 'r2-sha256', verifiedAt: row.verified_at ?? row.uploaded_at, size: row.size });
    }
    const key = r2Key(route.scope, route.sha256);
    const object = await env.STEMS.get(key);
    if (!object) throw notFound('blob_not_found');
    if (object.size !== row.size) {
      await object.body.cancel().catch(() => undefined);
      throw new HttpError(409, 'size_mismatch');
    }

    const probeKey = `${route.scope.r2Prefix}/verify/${route.sha256}`;
    const { readable, writable } = new FixedLengthStream(object.size);
    const piping = object.body.pipeTo(writable);
    let verified = true;
    try {
      await env.STEMS.put(probeKey, readable, { sha256: route.sha256 });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!/checksum|sha-?256|10037/i.test(message)) throw err;
      verified = false;
    } finally {
      await piping.catch(() => undefined);
      await env.STEMS.delete(probeKey).catch(() => undefined);
    }

    if (!verified) {
      // Conteudo nao bate com o hash declarado: nada fica registrado com esse nome.
      await env.STEMS.delete(key);
      await env.REGISTRY.batch(deleteBlobStatements(env.REGISTRY, route.scope.key, route.sha256));
      return json({ error: 'sha256_mismatch' }, 422);
    }
    const at = nowIso();
    await markVerifiedStatement(env.REGISTRY, route.scope.key, route.sha256, at).run();
    return json({ ok: true, integrity: 'r2-sha256', verifiedAt: at, size: row.size });
  });
}

// ---------- publicacao ----------

interface ManifestStem {
  sha256: string;
  name: string;
  type: string;
  size: number;
}

/** Manifesto canonico: so os campos que definem o que e servido, na ordem da versao. */
function manifestOf(stems: unknown): ManifestStem[] | string {
  if (!Array.isArray(stems) || stems.length === 0) return 'no_stems';
  if (stems.length > MAX_STEMS) return 'too_many_stems';
  const out: ManifestStem[] = [];
  for (const raw of stems) {
    const s = raw as Record<string, unknown> | null;
    if (
      !s ||
      typeof s.sha256 !== 'string' ||
      !SHA256.test(s.sha256) ||
      typeof s.name !== 'string' ||
      s.name === '' ||
      s.name.length > 255 ||
      typeof s.type !== 'string' ||
      !STEM_TYPES.has(s.type) ||
      typeof s.size !== 'number' ||
      !Number.isInteger(s.size) ||
      s.size < 1
    ) {
      return 'invalid_stem';
    }
    out.push({ sha256: s.sha256, name: s.name, type: s.type, size: s.size });
  }
  if (!out.some((s) => s.type !== 'click' && s.type !== 'guide')) return 'no_band_stem';
  return out;
}

function catalogScope(route: { scope: Scope }): void {
  if (route.scope.kind !== 'catalog') throw notFound();
}

/** Estado da publicacao para o painel (curador): o que o Worker serve hoje e por que. */
export async function publicationStatus(env: Env, auth: VerifiedToken, route: Extract<Route, { type: 'publication' }>) {
  catalogScope(route);
  await authorizeWrite(env, auth.raw, auth.uid, route.scope);
  const row = await getPublication(env.REGISTRY, route.songId);
  if (!row) return json({ status: 'unpublished' });
  return json({
    status: row.status,
    versionId: row.version_id,
    manifestSha256: row.manifest_sha256,
    publishedAt: row.published_at,
    withdrawnAt: row.withdrawn_at
  });
}

/**
 * Publicar (curador). O Worker confere, nesta ordem:
 * 1. musica e versao lidas do Firestore com o token do curador (as regras decidem o acesso);
 * 2. direitos de redistribuicao, BPM conhecido e manifesto consistente;
 * 3. cada arquivo registrado no catalogo, com sha256 conferido pelo R2 e tamanho igual ao da versao.
 * So entao grava a publicacao no D1 (o que passa a ser servido sem login) e marca a musica no Firestore.
 * Repetir e seguro: a mesma versao gera o mesmo manifesto e a mesma publicacao.
 */
export async function publishSong(request: Request, env: Env, auth: VerifiedToken, route: Extract<Route, { type: 'publication' }>) {
  catalogScope(route);
  await authorizeWrite(env, auth.raw, auth.uid, route.scope);
  const versionId = new URL(request.url).searchParams.get('version');
  if (!validIdSegment(versionId)) throw new HttpError(400, 'version_required');

  const song = await getDocument(env, auth.raw, `catalog/${route.songId}`);
  if (song.status === 'denied') throw forbidden();
  if (song.status === 'missing') throw notFound('song_not_found');
  const version = await getDocument(env, auth.raw, `catalog/${route.songId}/versions/${versionId}`);
  if (version.status === 'denied') throw forbidden();
  if (version.status === 'missing') throw notFound('version_not_found');

  const rights = song.data.rightsClass;
  const license = song.data.licenseRef as Record<string, unknown> | undefined;
  if (typeof rights !== 'string' || !CATALOG_RIGHTS.has(rights) || !license || typeof license.holder !== 'string' || license.holder === '') {
    return blocked('rights_missing');
  }
  const bpm = song.data.bpm;
  if (typeof bpm !== 'number' || !(bpm > 30 && bpm < 300)) return blocked('bpm_pending');

  const manifest = manifestOf(version.data.stems);
  if (typeof manifest === 'string') return blocked(manifest);
  for (const stem of manifest) {
    const blob = await getBlob(env.REGISTRY, route.scope.key, stem.sha256);
    if (!blob) return blocked('blob_missing', { sha256: stem.sha256, name: stem.name });
    if (blob.integrity !== 'r2-sha256') return blocked('not_verified', { sha256: stem.sha256, name: stem.name });
    if (blob.size !== stem.size) return blocked('size_mismatch', { sha256: stem.sha256, name: stem.name });
  }

  const canonical = JSON.stringify(manifest);
  const manifestSha256 = await sha256Hex(canonical);
  const existing = await getPublication(env.REGISTRY, route.songId);
  const unchanged =
    existing?.status === 'published' && existing.version_id === versionId && existing.manifest_sha256 === manifestSha256;
  const at = unchanged ? existing.published_at : nowIso();
  if (!unchanged) {
    await publish(
      env.REGISTRY,
      {
        song_id: route.songId,
        version_id: versionId,
        manifest: canonical,
        manifest_sha256: manifestSha256,
        published_by: auth.uid,
        published_at: at
      },
      [...new Set(manifest.map((s) => s.sha256))]
    );
  }

  // Metadado por ultimo: se falhar, o painel repete e o D1 ja esta certo (nao duplica nada).
  const written = await patchDocument(env, auth.raw, `catalog/${route.songId}`, {
    status: 'published',
    currentVersionId: versionId,
    publishedManifestSha256: manifestSha256,
    pendingReason: '',
    publishedAt: { timestamp: at },
    updatedAt: { timestamp: nowIso() }
  });
  if (written !== 'ok') return json({ error: 'metadata_not_saved', published: true, versionId, manifestSha256 }, 502);
  return json({ ok: true, status: 'published', versionId, manifestSha256, publishedAt: at, stems: manifest.length });
}

/** Retirar (curador): o Worker para de servir sem login na hora; nada e apagado. */
export async function withdrawSong(_request: Request, env: Env, auth: VerifiedToken, route: Extract<Route, { type: 'publication' }>) {
  catalogScope(route);
  await authorizeAdmin(env, auth.raw, auth.uid, route.scope);
  const current = await getPublication(env.REGISTRY, route.songId);
  if (!current) throw notFound('not_published');
  const at = current.status === 'withdrawn' ? (current.withdrawn_at ?? nowIso()) : nowIso();
  if (current.status !== 'withdrawn') await withdraw(env.REGISTRY, current, auth.uid, at);
  const written = await patchDocument(env, auth.raw, `catalog/${route.songId}`, {
    status: 'withdrawn',
    pendingReason: 'retirada da biblioteca publica',
    updatedAt: { timestamp: nowIso() }
  });
  if (written !== 'ok') return json({ error: 'metadata_not_saved', withdrawn: true }, 502);
  return json({ ok: true, status: 'withdrawn', versionId: current.version_id, withdrawnAt: at });
}

/** Exclusao fisica de arquivo do catalogo so depois de retirar a publicacao que o usa. */
export async function assertDeletable(env: Env, scope: Scope, sha256: string): Promise<void> {
  if (scope.kind === 'catalog' && (await isInPublishedVersion(env.REGISTRY, sha256))) {
    throw new HttpError(409, 'published_blob');
  }
}
