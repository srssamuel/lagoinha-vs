// Bancada de medicao reproduzivel (ffmpeg): loudness EBU R128 com true peak, picos/RMS e correlacao L/R
// de cada stem e da soma de PA (sem click/guia), preservando o ganho relativo entre stems.
// Uso: node scripts/audio-bench/measure.mjs <pasta-com-wavs> [--out relatorio.json]
// Nada e normalizado nem gravado sobre os originais; a soma e calculada so em memoria pelo ffmpeg.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PRIVATE = /(click|clique|metro|guia|guide|cue|count)/i;

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg falhou (${r.status}): ${r.stderr.slice(-400)}`);
  // ebur128/astats saem no stderr; o ametadata (correlacao) sai no stdout
  return `${r.stderr}\n${r.stdout}`;
}

const num = (re, s) => {
  const m = re.exec(s);
  return m ? Number(m[1]) : null;
};

/** Mede uma entrada (arquivo ou cadeia de filtros) e devolve as metricas lidas do log do ffmpeg. */
export function measure(inputArgs, preFilter = '') {
  const chain = `${preFilter}${preFilter ? ',' : ''}asplit=3[a][b][c];[a]ebur128=peak=true:framelog=quiet[o1];[b]astats=metadata=0:measure_overall=Peak_level+RMS_level+Number_of_samples:measure_perchannel=none[o2];[c]aphasemeter=video=0,ametadata=print:key=lavfi.aphasemeter.phase:file=-[o3]`;
  const log = ffmpeg([...inputArgs, '-filter_complex', chain, '-map', '[o1]', '-f', 'null', '-', '-map', '[o2]', '-f', 'null', '-', '-map', '[o3]', '-f', 'null', '-']);
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const phases = [...log.matchAll(/lavfi\.aphasemeter\.phase=(-?[\d.]+)/g)].map((m) => Number(m[1]));
  return {
    integratedLufs: num(/I:\s+(-?[\d.]+) LUFS/, summary),
    lra: num(/LRA:\s+(-?[\d.]+) LU/, summary),
    truePeakDbfs: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/, summary.slice(summary.indexOf('True peak'))),
    samplePeakDb: num(/Overall[\s\S]*?Peak level dB:\s+(-?[\d.]+|-inf)/, log),
    rmsDb: num(/Overall[\s\S]*?RMS level dB:\s+(-?[\d.]+|-inf)/, log),
    correlationMean: phases.length ? Number((phases.reduce((a, b) => a + b, 0) / phases.length).toFixed(3)) : null,
    correlationMin: phases.length ? Math.min(...phases) : null,
  };
}

export function main(argv = process.argv.slice(2)) {
  const dir = argv[0];
  if (!dir) throw new Error('uso: measure.mjs <pasta-com-wavs> [--out arquivo.json]');
  const outIdx = argv.indexOf('--out');
  const files = fs.readdirSync(dir).filter((f) => /\.(wav|aiff?|flac|mp3)$/i.test(f) && !f.startsWith('._')).sort();
  const stems = files.map((f) => ({ file: f, private: PRIVATE.test(f), ...measure(['-i', path.join(dir, f)]) }));
  const pa = files.filter((f) => !PRIVATE.test(f));
  // soma de PA: amix sem normalizar (normalize=0) preserva o ganho relativo entre stems
  const inputs = pa.flatMap((f) => ['-i', path.join(dir, f)]);
  const mixPre = `${pa.map((_, i) => `[${i}:a]`).join('')}amix=inputs=${pa.length}:normalize=0:duration=longest`;
  const paMix = pa.length ? { stems: pa.length, ...measure(inputs, mixPre) } : null;
  // perfil "musica mono + click/guia": a mesma soma dobrada em mono (L+R)/2, para medir a perda por fase
  const paMono = pa.length ? measure(inputs, `${mixPre},pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1`) : null;
  const monoLossLu = paMix && paMono ? Number((paMix.integratedLufs - paMono.integratedLufs).toFixed(1)) : null;
  const report = { generatedAt: new Date().toISOString(), dir: path.basename(dir), stems, paMix, paMono: paMono && { ...paMono, monoLossLu } };
  if (outIdx > -1) fs.writeFileSync(argv[outIdx + 1], JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ stems: stems.map(({ file, private: p, integratedLufs, truePeakDbfs, correlationMean }) => ({ file, private: p, integratedLufs, truePeakDbfs, correlationMean })), paMix, paMono: report.paMono }, null, 2));
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
