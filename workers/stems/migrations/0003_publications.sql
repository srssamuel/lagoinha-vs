-- Biblioteca publica do catalogo: publicacao conferida pelo Worker (o unico que decide o que e servido sem login).
-- etag de cada parte do multipart: permite retomar o envio em outro carregamento da pagina.
ALTER TABLE upload_parts ADD COLUMN etag TEXT;

-- Momento em que o Worker conferiu o sha256 do objeto pelo proprio R2 (PUT ou verificacao do multipart).
ALTER TABLE blobs ADD COLUMN verified_at TEXT;

CREATE TABLE publications (
  song_id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  status TEXT NOT NULL,            -- 'published' | 'withdrawn'
  manifest TEXT NOT NULL,          -- JSON canonico dos stems publicados (sha256, nome, tipo, tamanho)
  manifest_sha256 TEXT NOT NULL,
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL,
  withdrawn_by TEXT,
  withdrawn_at TEXT
);

-- Hashes da versao publicada de cada musica (consulta exata no download publico e na exclusao).
CREATE TABLE publication_blobs (
  song_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (song_id, sha256)
);
CREATE INDEX publication_blobs_by_sha ON publication_blobs (sha256);

-- Historico imutavel: nada aqui e apagado nem reescrito.
CREATE TABLE publication_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  action TEXT NOT NULL,            -- 'publish' | 'withdraw'
  manifest_sha256 TEXT NOT NULL,
  by_uid TEXT NOT NULL,
  at TEXT NOT NULL
);
