// Amostra de tom: compara (a) o parser de nome e (b) a analise de audio com o tom verdadeiro.
//   node scripts/key-sample.mjs plan  --manifest <manifest.db> --root <raiz do Drive> --ids s409ea3,... --out <dir>
//   node scripts/key-sample.mjs run   --out <dir> [--no-cache]
// SOMENTE LEITURA na origem: o manifesto abre com readOnly e o Drive so e lido pelo ffmpeg. Saidas (plano com nomes,
// PCM mono em cache, resultados) ficam em --out, fora do git. Este script nao contem nome de musica nem caminho do acervo.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const OUT = opt('out');
if (!OUT || !['plan', 'run', 'names'].includes(cmd)) {
  console.error('uso: key-sample.mjs plan|run|names --out <dir> [...]');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const TONAL_ORDER = ['bass', 'keys', 'pad', 'violao', 'guitars', 'strings', 'vocals'];
const SR = 44100;
const SECONDS = 120;

/** Parser antigo (anterior a 6c99b70): so o fim "- X" ou "Tom X"; sem casar, o app assumia G. */
function legacyRegexKey(name) {
  const s = name.replace(/\.zip$/i, '').trim();
  const m = /[-–]\s*([A-G][#b]?m?)\s*$/i.exec(s) || /\btom\s+([A-G][#b]?m?)\b/i.exec(s);
  return m ? m[1] : null;
}

async function bundle(entry, outfile, extra = {}) {
  const esbuild = await import(pathToFileURL(path.join(ROOT, 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent', ...extra });
}

if (cmd === 'names') {
  // Tabela (a): parser de nome x tom do manifesto do migrador (que le o tom do nome e grava nulo quando nao ha).
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(opt('manifest'), { readOnly: true });
  const rows = db.prepare("select song_id, kind, original_key, source_path from songs where status != 'duplicate' and kind='song'").all();
  db.close();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'key-names-'));
  try {
    await bundle(path.join(ROOT, 'src/domain/services/SongKeyDetector.ts'), path.join(tmp, 'novo.mjs'));
    fs.writeFileSync(path.join(tmp, 'antigo.ts'), execFileSync('git', ['show', '6c99b70:src/domain/services/SongKeyDetector.ts'], { cwd: ROOT, encoding: 'utf8' }));
    await bundle(path.join(tmp, 'antigo.ts'), path.join(tmp, 'antigo.mjs'));
    const novo = await import(pathToFileURL(path.join(tmp, 'novo.mjs')).href);
    const antigo = await import(pathToFileURL(path.join(tmp, 'antigo.mjs')).href);
    const table = rows.map((r) => {
      // O migrador procura o tom do nome mais fundo para o mais raso; o mesmo vale aqui para os tres parsers.
      const parts = r.source_path.replace(/\.zip!.*$/i, '.zip').split('/').filter(Boolean).reverse();
      const name = parts[0];
      const firstKey = (fn) => parts.map(fn).find(Boolean) ?? null;
      const truth = r.original_key ?? null;
      const rx = firstKey(legacyRegexKey);
      return { id: r.song_id.slice(0, 7), name, truth, regexAntiga: rx, appAntigo: rx ?? 'G(fallback)', parser6c99b70: firstKey(antigo.parseKeyFromName), parserNovo: firstKey(novo.parseKeyFromName) };
    });
    const hit = (k) => table.filter((x) => x.truth && x[k] === x.truth).length;
    const withKey = table.filter((x) => x.truth);
    const noKey = table.filter((x) => !x.truth);
    const summary = {
      musicas: table.length, comTomNoNome: withKey.length, semTomNoNome: noKey.length,
      acertos: { appAntigoComFallbackG: hit('appAntigo'), parser6c99b70: hit('parser6c99b70'), parserNovo: hit('parserNovo') },
      semTom_afirmouTom: { appAntigoComFallbackG: noKey.length, parser6c99b70: noKey.filter((x) => x.parser6c99b70).length, parserNovo: noKey.filter((x) => x.parserNovo).length },
      comTom_erradoOuNulo: { parser6c99b70: withKey.filter((x) => x.parser6c99b70 !== x.truth).length, parserNovo: withKey.filter((x) => x.parserNovo !== x.truth).length }
    };
    fs.writeFileSync(path.join(OUT, 'tabela-parser.json'), JSON.stringify({ summary, table }, null, 1));
    console.log(JSON.stringify(summary, null, 1));
    console.log('divergencias do parser novo (id | verdade | novo):');
    for (const x of table.filter((y) => (y.truth ?? null) !== (y.parserNovo ?? null))) console.log(`${x.id} | ${x.truth} | ${x.parserNovo}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(0);
}
if (cmd === 'plan') {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(opt('manifest'), { readOnly: true });
  const root = opt('root');
  const ids = opt('ids').split(',');
  const plan = [];
  for (const prefix of ids) {
    const song = db.prepare('select song_id, title, source_path from songs where song_id like ?').get(`${prefix}%`);
    if (!song) continue;
    const files = db
      .prepare("select stem_type, ext, local_rel, size from files where song_id=? and local_present=1 and real_kind='audio' and kind='file'")
      .all(song.song_id);
    const tonal = files
      .filter((f) => TONAL_ORDER.includes(f.stem_type))
      .sort((a, b) => TONAL_ORDER.indexOf(a.stem_type) - TONAL_ORDER.indexOf(b.stem_type))
      .slice(0, 4);
    const nameSource = song.source_path.split('/').filter(Boolean).pop() ?? song.title;
    plan.push({
      id: song.song_id.slice(0, 7),
      name: nameSource,
      stemTypes: Object.fromEntries(files.map((f) => [f.stem_type, 1])),
      stems: tonal.map((f) => ({ type: f.stem_type, src: path.join(root, ...f.local_rel.split('/')) }))
    });
  }
  db.close();
  fs.writeFileSync(path.join(OUT, 'plano.json'), JSON.stringify(plan, null, 1));
  console.log(`plano: ${plan.length} musicas, ${plan.reduce((n, p) => n + p.stems.length, 0)} stems`);
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'key-sample-'));
  try {
    await bundle(path.join(ROOT, 'src/domain/services/SongKeyDetector.ts'), path.join(tmp, 'novo.mjs'));
    const oldSrc = execFileSync('git', ['show', '6c99b70:src/domain/services/SongKeyDetector.ts'], { cwd: ROOT, encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'antigo.ts'), oldSrc);
    await bundle(path.join(tmp, 'antigo.ts'), path.join(tmp, 'antigo.mjs'));
    const novo = await import(pathToFileURL(path.join(tmp, 'novo.mjs')).href);
    const antigo = await import(pathToFileURL(path.join(tmp, 'antigo.mjs')).href);
    const planName = opt('plan', 'plano.json');
    const plan = JSON.parse(fs.readFileSync(path.join(OUT, planName), 'utf8'));
    const cacheDir = path.join(OUT, 'amostra');
    fs.mkdirSync(cacheDir, { recursive: true });
    const noCache = args.includes('--no-cache');

    const pcmOf = (stem, id, idx) => {
      const cache = path.join(cacheDir, `${id}-${idx}.f32`);
      if (!noCache && fs.existsSync(cache)) return new Float32Array(fs.readFileSync(cache).buffer.slice(0));
      const r = spawnSync('ffmpeg', ['-v', 'error', '-t', String(SECONDS), '-i', stem.src, '-ac', '1', '-ar', String(SR), '-f', 'f32le', 'pipe:1'], {
        maxBuffer: 1 << 29
      });
      if (r.status !== 0) throw new Error(`ffmpeg falhou (${id}-${idx})`);
      fs.writeFileSync(cache, r.stdout);
      return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.byteLength));
    };

    const results = [];
    for (const item of plan) {
      const mix = new Float32Array(SR * SECONDS);
      let used = 0;
      item.stems.forEach((stem, idx) => {
        const pcm = pcmOf(stem, item.id, idx);
        const n = Math.min(pcm.length, mix.length);
        used = Math.max(used, n);
        for (let i = 0; i < n; i++) mix[i] += pcm[i];
      });
      const t0 = performance.now();
      const est = used > 0 ? novo.detectKeyFromPcm(mix.subarray(0, used), SR) : null;
      const ms = Math.round(performance.now() - t0);
      const nameNow = novo.parseKeyFromName(item.name);
      results.push({
        id: item.id,
        name: item.name,
        stems: item.stems.map((s) => s.type),
        nameRegexAntiga: legacyRegexKey(item.name),
        nameParser6c99b70: antigo.parseKeyFromName(item.name),
        nameParserNovo: nameNow,
        audio: est && { key: est.key, candidates: est.candidates, ambiguous: est.ambiguous, correlation: +est.correlation.toFixed(3), margin: +est.margin.toFixed(3), ranking: est.ranking },
        ms
      });
    }
    const resName = planName.replace('plano', 'resultados');
    fs.writeFileSync(path.join(OUT, resName), JSON.stringify(results, null, 1));
    console.log(`resultados: ${results.length} musicas -> ${path.join(OUT, resName)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
