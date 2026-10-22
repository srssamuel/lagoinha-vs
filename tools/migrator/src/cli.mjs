#!/usr/bin/env node
// Uso: node src/cli.mjs <inventory|classify|migrate|reconcile> [opcoes]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverDriveFsDbs, loadConfig, requireSource } from './config.mjs';
import { openManifest } from './db.mjs';
import { copyMetadataDb, removeTemp, readDriveTree } from './drivefs.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[k] = true;
      else {
        out[k] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function resolveDriveFsDb(cfg) {
  if (cfg.driveFsDb) return cfg.driveFsDb;
  for (const cand of discoverDriveFsDbs()) {
    const tmp = copyMetadataDb(cand);
    try {
      readDriveTree(tmp.dbPath, cfg.rootId);
      return cand;
    } catch {
      /* outra conta */
    } finally {
      removeTemp(tmp.dir);
    }
  }
  throw new Error('SQLite de metadados do Drive para desktop nao encontrado (defina MIGRATOR_DRIVEFS_DB)');
}

function parsePrior(s) {
  if (!s || s === true) return null;
  return Object.fromEntries(String(s).split(',').map((kv) => kv.split('=')).map(([k, v]) => [k, Number(v)]));
}

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  const cfg = loadConfig(process.env);
  if (!cmd || args.help) {
    console.log('comandos: inventory | add-local <arquivo> | classify | migrate [--pilot] [--target local|worker] [--registry local|firestore] [--abort-after N] [--concurrency N] [--retry-failed] [--assume-time-signature 4/4] | reconcile');
    return 0;
  }
  const db = openManifest(cfg.manifestPath);
  try {
    if (cmd === 'inventory') {
      requireSource(cfg);
      cfg.driveFsDb = resolveDriveFsDb(cfg);
      const { runInventory } = await import('./inventory.mjs');
      const { writeInventoryDoc } = await import('./reports.mjs');
      const prior = parsePrior(args.prior) ?? cfg.prior ?? null;
      const res = await runInventory({ cfg, db, log, prior, readHeaders: !args['no-headers'] });
      log(`inventario concluido (run ${res.runId}): ${JSON.stringify(res.counters)}`);
      fs.mkdirSync(cfg.reportsDir, { recursive: true });
      fs.writeFileSync(path.join(cfg.reportsDir, `inventory-totals-${res.runId}.json`), JSON.stringify(res.totals, null, 2));
      const docDir = args['doc-dir'] ?? path.join(REPO_ROOT, 'docs', 'migracao');
      const docPath = writeInventoryDoc(res.totals, docDir, args.date);
      log(`documento agregado: ${docPath}`);
      console.log(JSON.stringify(res.totals, null, 2));
      return 0;
    }
    if (cmd === 'add-local') {
      const file = args._[1];
      if (!file) throw new Error('uso: add-local <arquivo> (com um MIGRATION_HOME proprio, fora do inventario do Drive)');
      const { registerLocalFile } = await import('./local.mjs');
      const res = await registerLocalFile({ cfg, db, filePath: file });
      log(`${res.created ? 'registrado' : 'ja registrado'}: item ${res.key} (md5 ${res.md5})`);
      return 0;
    }
    if (cmd === 'classify') {
      const { runClassify } = await import('./classify.mjs');
      const res = await runClassify({ cfg, db, log });
      console.log(JSON.stringify(res, null, 2));
      return 0;
    }
    if (cmd === 'migrate') {
      const { runMigrate } = await import('./migrate.mjs');
      const { makeTargets } = await import('./targets/index.mjs');
      const targets = makeTargets(cfg, { storage: args.target ?? 'local', registry: args.registry ?? 'local', log });
      const ac = new AbortController();
      process.once('SIGINT', () => ac.abort());
      const res = await runMigrate({
        cfg, db, log, ...targets, pilot: !!args.pilot, signal: ac.signal,
        abortAfter: args['abort-after'] ? Number(args['abort-after']) : undefined,
        assumeTimeSignature: args['assume-time-signature'] ? String(args['assume-time-signature']) : undefined,
        concurrency: args.concurrency ? Number(args.concurrency) : 1,
        retryFailed: !!args['retry-failed'],
      });
      console.log(JSON.stringify(res, null, 2));
      return res.failed ? 2 : 0;
    }
    if (cmd === 'reconcile') {
      const { runReconcile } = await import('./reconcile.mjs');
      const res = runReconcile({ cfg, db, docDir: args['doc-dir'] ?? path.join(REPO_ROOT, 'docs', 'migracao'), date: args.date });
      console.log(JSON.stringify(res.summary, null, 2));
      return res.ok ? 0 : 3;
    }
    console.error(`comando desconhecido: ${cmd}`);
    return 1;
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e.stack ?? e);
      process.exit(1);
    },
  );
}
