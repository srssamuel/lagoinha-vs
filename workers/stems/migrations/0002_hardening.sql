-- Endurecimento (revisao de seguranca): reserva de escrita por hash, soma das partes por upload.
CREATE TABLE reservations (
  scope TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  holder TEXT NOT NULL,          -- id aleatorio de quem segura a reserva
  created_at TEXT NOT NULL,      -- reserva mais velha que o prazo pode ser retomada (Worker caiu no meio)
  PRIMARY KEY (scope, sha256)
);

CREATE TABLE upload_parts (
  upload_id TEXT NOT NULL,
  part_number INTEGER NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (upload_id, part_number)
);

CREATE INDEX uploads_by_uid ON uploads (uid, created_at);
