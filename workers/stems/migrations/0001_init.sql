-- Registro de origem do Worker de stems (contrato, secao 6). Escrito so pelo Worker.
CREATE TABLE blobs (
  scope TEXT NOT NULL,            -- 'church:{id}' | 'catalog'
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  content_type TEXT,
  original_name TEXT,
  integrity TEXT NOT NULL,        -- 'r2-sha256' | 'client-declared'
  uploaded_by TEXT NOT NULL,      -- uid verificado no token
  uploaded_at TEXT NOT NULL,      -- ISO, relogio do Worker
  PRIMARY KEY (scope, sha256)
);

CREATE TABLE sources (
  scope TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL,             -- 'drive' | 'app' | 'zip-entry'
  source_id TEXT NOT NULL,        -- id do arquivo no Drive, ou 'driveId!/caminho/no/zip'
  path TEXT,
  name TEXT,
  modified_at TEXT,
  size INTEGER,
  md5 TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (scope, sha256, kind, source_id)
);

CREATE TABLE uploads (
  upload_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  uid TEXT NOT NULL,
  size INTEGER,
  content_type TEXT,
  created_at TEXT NOT NULL
);
