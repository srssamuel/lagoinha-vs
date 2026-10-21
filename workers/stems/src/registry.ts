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
      `INSERT INTO blobs (scope, sha256, size, content_type, original_name, integrity, uploaded_by, uploaded_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (scope, sha256) DO UPDATE SET size = excluded.size, content_type = excluded.content_type,
         original_name = excluded.original_name, integrity = excluded.integrity,
         uploaded_by = excluded.uploaded_by, uploaded_at = excluded.uploaded_at`
    )
    .bind(row.scope, row.sha256, row.size, row.content_type, row.original_name, row.integrity, row.uploaded_by, row.uploaded_at);
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

export async function recordPart(db: D1Database, uploadId: string, partNumber: number, size: number): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO upload_parts (upload_id, part_number, size) VALUES (?1, ?2, ?3)')
    .bind(uploadId, partNumber, size)
    .run();
}

export function deleteUploadWithPartsStatements(db: D1Database, uploadId: string): D1PreparedStatement[] {
  return [
    db.prepare('DELETE FROM upload_parts WHERE upload_id = ?1').bind(uploadId),
    db.prepare('DELETE FROM uploads WHERE upload_id = ?1').bind(uploadId)
  ];
}
