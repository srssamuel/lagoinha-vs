// reconcile: contabiliza TODOS os itens e prova que a soma bate com o inventario (arquivos e bytes).
// Versao completa (com nomes) fica fora do git; docs/migracao/ recebe so os totais.
import fs from 'node:fs';
import path from 'node:path';
import { todayStamp } from './reports.mjs';

const OK = ['verified', 'associated', 'published'];
const norm = (r) => (r ?? '(sem motivo)').replace(/\d+/g, 'N');

export function bucketOf(f) {
  if (f.state === 'failed') return 'failed';
  if (f.state === 'excluded') return 'excluded';
  if (f.state === 'pending') return 'pendingDecision';
  if (['discovered', 'hashed', 'uploaded'].includes(f.state)) return 'queued';
  if (OK.includes(f.state)) {
    if (f.category === 'song_zip') return 'viaEntries';
    return f.existed ? 'existingVerified' : 'migratedVerified';
  }
  return 'unknown';
}

export function runReconcile({ cfg, db, docDir, date }) {
  const stamp = date ?? todayStamp();
  const inv = db.prepare('SELECT run_id, totals FROM inventory_runs ORDER BY run_id DESC LIMIT 1').get();
  if (!inv) throw new Error('sem inventario: rode o inventory primeiro');
  const invTotals = JSON.parse(inv.totals);

  const files = db.prepare(`SELECT key, source_id, path, size, state, reason, category, existed, trashed, last_seen_run, sha256 FROM files WHERE kind = 'file' AND is_current = 1`).all();
  const entries = db.prepare(`SELECT key, size, state, reason, category, existed FROM files WHERE kind = 'zip-entry' AND is_current = 1`).all();

  const buckets = {};
  const add = (b, name, f) => {
    const x = (b[name] ??= { files: 0, bytes: 0 });
    x.files++;
    x.bytes += Number(f.size);
  };
  const reasons = {};
  const byCategory = {};
  let notSeen = 0;
  let excludedWithoutReason = 0;
  const detail = [];
  for (const f of files) {
    const b = bucketOf(f);
    add(buckets, b, f);
    if (f.last_seen_run !== inv.run_id) notSeen++;
    if (b === 'excluded' && !f.reason) excludedWithoutReason++;
    const rk = `${b} | ${norm(f.reason)}`;
    (reasons[rk] ??= { files: 0, bytes: 0 });
    reasons[rk].files++;
    reasons[rk].bytes += Number(f.size);
    const ck = `${f.category ?? '(sem categoria)'} | ${f.state}`;
    (byCategory[ck] ??= { files: 0, bytes: 0 });
    byCategory[ck].files++;
    byCategory[ck].bytes += Number(f.size);
    detail.push({ key: f.key, sourceId: f.source_id, path: f.path, size: f.size, state: f.state, bucket: b, reason: f.reason, category: f.category, sha256: f.sha256 });
  }
  const sum = Object.values(buckets).reduce((a, x) => ({ files: a.files + x.files, bytes: a.bytes + x.bytes }), { files: 0, bytes: 0 });
  const expected = { files: invTotals.cloud.filesTotal, bytes: invTotals.cloud.bytesTotal };

  const entryBuckets = {};
  for (const e of entries) add(entryBuckets, bucketOf(e), e);
  const entrySum = Object.values(entryBuckets).reduce((a, x) => ({ files: a.files + x.files, bytes: a.bytes + x.bytes }), { files: 0, bytes: 0 });

  const localOnly = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(size),0) b FROM local_only WHERE is_dir = 0 AND last_seen_run = ?`).get(inv.run_id);
  const songs = db.prepare(`SELECT status, COUNT(*) c FROM songs GROUP BY status`).all();
  const songKinds = db.prepare(`SELECT kind, COUNT(*) c FROM songs GROUP BY kind`).all();

  const checks = {
    filesSumMatchesInventory: sum.files === expected.files,
    bytesSumMatchesInventory: sum.bytes === expected.bytes,
    allItemsSeenInLastInventory: notSeen === 0,
    everyExcludedHasReason: excludedWithoutReason === 0,
    noUnclassifiedBucket: !buckets.unknown,
  };
  const ok = Object.values(checks).every(Boolean);
  const summary = {
    generatedAt: new Date().toISOString(), inventoryRun: inv.run_id, expected, sum, checks, ok, buckets, reasons, byCategory,
    zipEntries: { total: entries.length, buckets: entryBuckets, sum: entrySum },
    outsideDrive: { localOnlyFiles: localOnly.c, localOnlyBytes: localOnly.b },
    songs: { byStatus: Object.fromEntries(songs.map((s) => [s.status, s.c])), byKind: Object.fromEntries(songKinds.map((s) => [s.kind, s.c])) },
  };

  fs.mkdirSync(cfg.reportsDir, { recursive: true });
  const full = path.join(cfg.reportsDir, `reconcile-${stamp}.json`);
  fs.writeFileSync(full, JSON.stringify({ summary, items: detail }, null, 1));
  fs.mkdirSync(docDir, { recursive: true });
  const docPath = path.join(docDir, `reconcile-${stamp}.md`);
  fs.writeFileSync(docPath, renderReconcileDoc(summary, stamp), 'utf8');
  return { ok, summary, fullPath: full, docPath };
}

const fmt = (n) => Number(n).toLocaleString('pt-BR');
const LABEL = {
  migratedVerified: 'Migrados e verificados (enviados nesta migracao)',
  existingVerified: 'Ja existentes no destino e verificados',
  viaEntries: 'Pacotes compactados cujo conteudo migrou como entradas',
  queued: 'Na fila (descobertos/hash/enviados, ainda sem verificacao)',
  pendingDecision: 'Pendentes (fora do escopo atual ou aguardando decisao)',
  failed: 'Falhos',
  excluded: 'Excluidos com justificativa',
  unknown: 'Sem bucket (erro)',
};

function renderReconcileDoc(s, stamp) {
  const rows = Object.entries(s.buckets).map(([k, v]) => `| ${LABEL[k] ?? k} | ${fmt(v.files)} | ${fmt(v.bytes)} |`);
  const entryRows = Object.entries(s.zipEntries.buckets).map(([k, v]) => `| ${LABEL[k] ?? k} | ${fmt(v.files)} | ${fmt(v.bytes)} |`);
  const reasonRows = Object.entries(s.reasons).sort((a, b) => b[1].files - a[1].files).map(([k, v]) => `| ${k} | ${fmt(v.files)} | ${fmt(v.bytes)} |`);
  const catRows = Object.entries(s.byCategory).sort().map(([k, v]) => `| ${k} | ${fmt(v.files)} | ${fmt(v.bytes)} |`);
  return `# Reconciliacao da migracao (${stamp})

Somente totais agregados (sem nomes, caminhos nem ids). A versao completa fica fora do git.
Inventario de referencia: execucao ${s.inventoryRun}.

## Prova de soma

| Verificacao | Resultado |
|---|---|
| Soma dos arquivos (${fmt(s.sum.files)}) = total do inventario (${fmt(s.expected.files)}) | ${s.checks.filesSumMatchesInventory ? 'OK' : 'FALHOU'} |
| Soma dos bytes (${fmt(s.sum.bytes)}) = total do inventario (${fmt(s.expected.bytes)}) | ${s.checks.bytesSumMatchesInventory ? 'OK' : 'FALHOU'} |
| Todos os itens vistos no ultimo inventario | ${s.checks.allItemsSeenInLastInventory ? 'OK' : 'FALHOU'} |
| Todo excluido tem justificativa | ${s.checks.everyExcludedHasReason ? 'OK' : 'FALHOU'} |
| Nenhum item sem bucket | ${s.checks.noUnclassifiedBucket ? 'OK' : 'FALHOU'} |

Resultado geral: **${s.ok ? 'OK' : 'FALHOU'}**.

## Arquivos do Drive por situacao (inclui a lixeira)

| Situacao | Arquivos | Bytes |
|---|---:|---:|
${rows.join('\n')}
| **Total** | **${fmt(s.sum.files)}** | **${fmt(s.sum.bytes)}** |

## Por situacao e motivo

| Situacao | Motivo | Arquivos | Bytes |
|---|---|---:|---:|
${reasonRows.map((r) => r.replace(' | ', ' | ')).join('\n')}

## Por categoria e estado

| Categoria / estado | Arquivos | Bytes |
|---|---:|---:|
${catRows.join('\n')}

## Entradas de zip (derivadas dos pacotes, nao entram na soma acima)

| Situacao | Entradas | Bytes descompactados |
|---|---:|---:|
${entryRows.join('\n') || '| (nenhuma) | 0 | 0 |'}

## Fora do Drive

- Arquivos so no disco (desktop.ini): ${fmt(s.outsideDrive.localOnlyFiles)} (${fmt(s.outsideDrive.localOnlyBytes)} bytes), fora do inventario do Drive.

## Musicas no Firestore (alvo configurado)

- Por status: ${JSON.stringify(s.songs.byStatus)}; por tipo: ${JSON.stringify(s.songs.byKind)}.
`;
}
