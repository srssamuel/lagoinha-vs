/** Acesso ao D1 (registro de origem). Escrito so pelo Worker; todo SQL usa parametros ligados. */

export interface BlobRow {
  scope: string;
  sha256: string;
  size: number;
  content_type: string | null;
  original_name: string | null;
  integrity: 'r2-sha256' | 'client-declared';
  uploaded_by: string;
  uploaded_at: string;
  /** Preenchido quando o proprio R2 conferiu o sha256 (PUT unico ou verificacao do multipart). */
  verified_at?: string | null;
}

export interface UploadRow {
  upload_id: string;
  scope: string;
  sha256: string;
  uid: string;
  size: number | null;
  content_type: string | null;
  created_at: string;
}

export interface SourceInput {
  kind: 'drive' | 'app' | 'zip-entry';
  sourceId: string;
  path: string | null;
  name: string | null;
  modifiedAt: string | null;
  size: number | null;
  md5: string | null;
}

export function getBlob(db: D1Database, scope: string, sha256: string): Promise<BlobRow | null> {
  return db.prepare('SELECT * FROM blobs WHERE scope = ?1 AND sha256 = ?2').bind(scope, sha256).first<BlobRow>();
}

export function insertBlobStatement(db: D1Database, row: BlobRow): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO blobs (scope, sha256, size, content_type, original_name, integrity, uploaded_by, uploaded_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    )
    .bind(row.scope, row.sha256, row.size, row.content_type, row.original_name, row.integrity, row.uploaded_by, row.uploaded_at);
}

export async function insertBlob(db: D1Database, row: BlobRow): Promise<void> {
  await insertBlobStatement(db, row).run();
}

export function getUpload(db: D1Database, uploadId: string): Promise<UploadRow | null> {
  return db.prepare('SELECT * FROM uploads WHERE upload_id = ?1').bind(uploadId).first<UploadRow>();
}

export async function insertUpload(db: D1Database, row: UploadRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO uploads (upload_id, scope, sha256, uid, size, content_type, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(row.upload_id, row.scope, row.sha256, row.uid, row.size, row.content_type, row.created_at)
    .run();
}

export function deleteUploadStatement(db: D1Database, uploadId: string): D1PreparedStatement {
  return db.prepare('DELETE FROM uploads WHERE upload_id = ?1').bind(uploadId);
}

export async function upsertSource(
  db: D1Database,
  scope: string,
  sha256: string,
  uid: string,
  now: string,
  s: SourceInput
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sources (scope, sha256, kind, source_id, path, name, modified_at, size, md5, recorded_by, recorded_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT (scope, sha256, kind, source_id) DO UPDATE SET
         path = excluded.path, name = excluded.name, modified_at = excluded.modified_at,
         size = excluded.size, md5 = excluded.md5, recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at`
    )
    .bind(scope, sha256, s.kind, s.sourceId, s.path, s.name, s.modifiedAt, s.size, s.md5, uid, now)
    .run();
}


// ---------- reserva de escrita (corrida complete x PUT x delete) ----------

const RESERVATION_TTL_MS = 15 * 60 * 1000;

/** INSERT condicional: so um escritor por (scope, sha256); reserva vencida pode ser retomada. */
export async function acquireReservation(db: D1Database, scope: string, sha256: string, holder: string): Promise<boolean> {
  const now = Date.now();
  const result = await db
    .prepare(
      `INSERT INTO reservations (scope, sha256, holder, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (scope, sha256) DO UPDATE SET holder = excluded.holder, created_at = excluded.created_at
       WHERE reservations.created_at < ?5`
    )
    .bind(scope, sha256, holder, new Date(now).toISOString(), new Date(now - RESERVATION_TTL_MS).toISOString())
    .run();
  return result.meta.changes === 1;
}

export async function releaseReservation(db: D1Database, scope: string, sha256: string, holder: string): Promise<void> {
  await db
    .prepare('DELETE FROM reservations WHERE scope = ?1 AND sha256 = ?2 AND holder = ?3')
    .bind(scope, sha256, holder)
    .run();
}

/** Grava o blob como r2-sha256 mesmo se havia um registro client-declared (promocao). */
export function upsertBlobStatement(db: D1Database, row: BlobRow): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO blobs (scope, sha256, size, content_type, original_name, integrity, uploaded_by, uploaded_at, verified_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT (scope, sha256) DO UPDATE SET size = excluded.size, content_type = excluded.content_type,
         original_name = excluded.original_name, integrity = excluded.integrity,
         uploaded_by = excluded.uploaded_by, uploaded_at = excluded.uploaded_at, verified_at = excluded.verified_at`
    )
    .bind(
      row.scope,
      row.sha256,
      row.size,
      row.content_type,
      row.original_name,
      row.integrity,
      row.uploaded_by,
      row.uploaded_at,
      row.verified_at ?? null
    );
}

export function deleteBlobStatements(db: D1Database, scope: string, sha256: string): D1PreparedStatement[] {
  return [
    db.prepare('DELETE FROM sources WHERE scope = ?1 AND sha256 = ?2').bind(scope, sha256),
    db.prepare('DELETE FROM blobs WHERE scope = ?1 AND sha256 = ?2').bind(scope, sha256)
  ];
}

// ---------- limites do multipart ----------

export const MAX_OPEN_UPLOADS_PER_UID = 3;
const OPEN_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_UPLOAD_MS = 7 * 24 * 60 * 60 * 1000; // o R2 aborta multipart incompleto em 7 dias

export async function countOpenUploads(db: D1Database, uid: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM uploads WHERE uid = ?1 AND created_at > ?2')
    .bind(uid, new Date(Date.now() - OPEN_WINDOW_MS).toISOString())
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Limpeza oportunista das linhas de uploads abandonados (o R2 ja descartou as partes). */
export async function purgeStaleUploads(db: D1Database): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
  await db.batch([
    db.prepare('DELETE FROM upload_parts WHERE upload_id IN (SELECT upload_id FROM uploads WHERE created_at < ?1)').bind(cutoff),
    db.prepare('DELETE FROM uploads WHERE created_at < ?1').bind(cutoff)
  ]);
}

export async function sumPartsExcept(db: D1Database, uploadId: string, partNumber: number): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(size), 0) AS total FROM upload_parts WHERE upload_id = ?1 AND part_number <> ?2')
    .bind(uploadId, partNumber)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

export async function recordPart(
  db: D1Database,
  uploadId: string,
  partNumber: number,
  size: number,
  etag: string
): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO upload_parts (upload_id, part_number, size, etag) VALUES (?1, ?2, ?3, ?4)')
    .bind(uploadId, partNumber, size, etag)
    .run();
}

export interface PartRow {
  part_number: number;
  size: number;
  etag: string | null;
}

/** Partes ja recebidas de um upload (retomada depois de recarregar a pagina). */
export async function listParts(db: D1Database, uploadId: string): Promise<PartRow[]> {
  const result = await db
    .prepare('SELECT part_number, size, etag FROM upload_parts WHERE upload_id = ?1 ORDER BY part_number')
    .bind(uploadId)
    .all<PartRow>();
  return result.results;
}

/** Conferencia do multipart pelo R2: o registro passa a r2-sha256 so depois do checksum do proprio R2. */
export function markVerifiedStatement(db: D1Database, scope: string, sha256: string, now: string): D1PreparedStatement {
  return db
    .prepare("UPDATE blobs SET integrity = 'r2-sha256', verified_at = ?3 WHERE scope = ?1 AND sha256 = ?2")
    .bind(scope, sha256, now);
}

// ---------- publicacao do catalogo ----------

export interface PublicationRow {
  song_id: string;
  version_id: string;
  status: 'published' | 'withdrawn';
  manifest: string;
  manifest_sha256: string;
  published_by: string;
  published_at: string;
  withdrawn_by: string | null;
  withdrawn_at: string | null;
}

export function getPublication(db: D1Database, songId: string): Promise<PublicationRow | null> {
  return db.prepare('SELECT * FROM publications WHERE song_id = ?1').bind(songId).first<PublicationRow>();
}

/** Grava a publicacao, troca os hashes servidos e registra o evento, numa unica transacao do D1. */
export async function publish(
  db: D1Database,
  row: Pick<PublicationRow, 'song_id' | 'version_id' | 'manifest' | 'manifest_sha256' | 'published_by' | 'published_at'>,
  shas: string[]
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO publications (song_id, version_id, status, manifest, manifest_sha256, published_by, published_at)
         VALUES (?1, ?2, 'published', ?3, ?4, ?5, ?6)
         ON CONFLICT (song_id) DO UPDATE SET version_id = excluded.version_id, status = 'published',
           manifest = excluded.manifest, manifest_sha256 = excluded.manifest_sha256,
           published_by = excluded.published_by, published_at = excluded.published_at,
           withdrawn_by = NULL, withdrawn_at = NULL`
      )
      .bind(row.song_id, row.version_id, row.manifest, row.manifest_sha256, row.published_by, row.published_at),
    db.prepare('DELETE FROM publication_blobs WHERE song_id = ?1').bind(row.song_id),
    ...shas.map((sha) =>
      db.prepare('INSERT OR IGNORE INTO publication_blobs (song_id, sha256) VALUES (?1, ?2)').bind(row.song_id, sha)
    ),
    db
      .prepare(
        `INSERT INTO publication_events (song_id, version_id, action, manifest_sha256, by_uid, at)
         VALUES (?1, ?2, 'publish', ?3, ?4, ?5)`
      )
      .bind(row.song_id, row.version_id, row.manifest_sha256, row.published_by, row.published_at)
  ]);
}

/** Retirada: o Worker para de servir sem login; manifesto e arquivos ficam para republicar. */
export async function withdraw(db: D1Database, current: PublicationRow, uid: string, now: string): Promise<void> {
  await db.batch([
    db
      .prepare("UPDATE publications SET status = 'withdrawn', withdrawn_by = ?2, withdrawn_at = ?3 WHERE song_id = ?1")
      .bind(current.song_id, uid, now),
    db.prepare('DELETE FROM publication_blobs WHERE song_id = ?1').bind(current.song_id),
    db
      .prepare(
        `INSERT INTO publication_events (song_id, version_id, action, manifest_sha256, by_uid, at)
         VALUES (?1, ?2, 'withdraw', ?3, ?4, ?5)`
      )
      .bind(current.song_id, current.version_id, current.manifest_sha256, uid, now)
  ]);
}

/** O download publico so sai se o hash estiver na versao publicada desta musica. */
export async function isPubliclyServed(db: D1Database, songId: string, versionId: string, sha256: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM publications p JOIN publication_blobs b ON b.song_id = p.song_id
       WHERE p.song_id = ?1 AND p.version_id = ?2 AND p.status = 'published' AND b.sha256 = ?3`
    )
    .bind(songId, versionId, sha256)
    .first<{ ok: number }>();
  return row !== null;
}

/** Exclusao fisica de um arquivo publicado e recusada: primeiro retirar a publicacao. */
export async function isInPublishedVersion(db: D1Database, sha256: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM publication_blobs WHERE sha256 = ?1 LIMIT 1')
    .bind(sha256)
    .first<{ ok: number }>();
  return row !== null;
}

export function deleteUploadWithPartsStatements(db: D1Database, uploadId: string): D1PreparedStatement[] {
  return [
    db.prepare('DELETE FROM upload_parts WHERE upload_id = ?1').bind(uploadId),
    db.prepare('DELETE FROM uploads WHERE upload_id = ?1').bind(uploadId)
  ];
}
