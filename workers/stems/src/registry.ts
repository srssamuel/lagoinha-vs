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
