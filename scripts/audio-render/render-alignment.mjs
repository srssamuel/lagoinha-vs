// Render REAL do grafo de producao (PitchShifterDspNode + AudioRoutingGraph) num OfflineAudioContext do Chromium
// e medicao automatica de descontinuidade, clipping, silencio, alinhamento temporal e estado final.
//
//   node scripts/audio-render/render-alignment.mjs [--tag antes|depois] [--check] [--quick] [--out <pasta>]
//
// --check  : sai com codigo 1 se algum criterio de aceite falhar (uso como teste de regressao).
// --quick  : matriz reduzida (usada pelo teste do Vitest).
// Saida (fora do git): %LOCALAPPDATA%\lagoinha-vs\relatorios\audio\<tag>\ (WAVs, PNGs, resultados.json).
// O stem de violao real vem de violao_real_20s.wav nessa mesma pasta (copiado do acervo, somente leitura); sem ele
// o cenario "violao" e pulado. Nada aqui escreve em G:.
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const TAG = arg('--tag', 'atual');
const CHECK = args.includes('--check');
const QUICK = args.includes('--quick');
const LOCAL = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
const BASE = arg('--out', path.join(LOCAL, 'lagoinha-vs', 'relatorios', 'audio'));
const OUT = path.join(BASE, TAG);
fs.mkdirSync(OUT, { recursive: true });
const SR = 48000;
const PITCH_LAT = 0.021; // PITCH_PATH_LATENCY_SEC: latencia constante dos stems (e somada ao click procedural)

// ------------------------------------------------------------------ bundle + navegador
async function bundle() {
  const req = createRequire(path.join(ROOT, 'package.json'));
  // esbuild que acompanha o vite (nao e dependencia direta)
  const esbuild = req('esbuild');
  const r = await esbuild.build({
    entryPoints: [path.join(ROOT, 'scripts', 'audio-render', 'entry.js')],
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', logLevel: 'error'
  });
  return r.outputFiles[0].text;
}
async function loadPlaywright() {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return createRequire(path.join(root, 'noop.js'))('playwright');
}

// ------------------------------------------------------------------ utilidades de sinal
const b64 = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString('base64');
const fromB64 = (s) => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice(); };
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2147483648 - 1; }; }

function writeWav(file, chans, sr) {
  const n = chans[0].length, nc = chans.length;
  const buf = Buffer.alloc(44 + n * nc * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * nc * 4, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(nc, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * nc * 4, 28); buf.writeUInt16LE(nc * 4, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36);
  buf.writeUInt32LE(n * nc * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) buf.writeFloatLE(chans[c][i], 44 + (i * nc + c) * 4);
  fs.writeFileSync(file, buf);
}
function readWavMono(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), nc: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + Math.min(sz, b.length - p - 8)); break; }
    p += 8 + sz + (sz & 1);
  }
  if (!fmt || !data || fmt.tag !== 3 || fmt.bits !== 32) throw new Error('WAV float32 esperado: ' + file);
  const n = Math.floor(data.length / 4 / fmt.nc), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readFloatLE(i * fmt.nc * 4);
  return { data: out, sr: fmt.sr };
}

function mkBurst(rand, len, tau) { const a = new Float32Array(len); for (let i = 0; i < len; i++) a[i] = rand() * Math.exp(-i / (tau * SR)); return a; }
function signals(seconds) {
  const n = Math.round(seconds * SR);
  const sine = new Float32Array(n), chord = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    sine[i] = 0.4 * Math.sin(2 * Math.PI * 440 * t);
    chord[i] = 0.15 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.18 * t) + Math.sin(2 * Math.PI * 329.63 * t));
  }
  const mkClicks = (period, first, seed) => {
    const x = new Float32Array(n), rand = lcg(seed), times = [];
    for (let t = first; t < seconds - 0.2; t += period) {
      const b = mkBurst(rand, Math.round(0.03 * SR), 0.004);
      const s = Math.round(t * SR);
      for (let i = 0; i < b.length && s + i < n; i++) x[s + i] += 0.6 * b[i];
      times.push(s / SR);
    }
    return { x, times };
  };
  const c120 = mkClicks(0.5, 0.25, 7);      // 120 BPM
  const dense = mkClicks(0.12, 0.25, 11);   // transicoes: um ataque a cada 120 ms (janela de analise de 100 ms nao se sobrepoe)
  return { sine, chord, clicks120: c120.x, clicks120Times: c120.times, dense: dense.x, denseTimes: dense.times };
}

// ------------------------------------------------------------------ analise
const movAvgAbs = (x, w) => { const e = new Float32Array(x.length); let acc = 0; for (let i = 0; i < x.length; i++) { acc += Math.abs(x[i]); if (i >= w) acc -= Math.abs(x[i - w]); e[i] = acc / Math.min(i + 1, w); } return e; };
const idx = (t) => Math.round(t * SR);
function maxStep(x, a, b) { let m = 0; for (let i = Math.max(1, a); i < Math.min(b, x.length); i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return m; }
function rms(x, a, b) { let s = 0, n = 0; for (let i = Math.max(0, a); i < Math.min(b, x.length); i++) { s += x[i] * x[i]; n++; } return Math.sqrt(s / Math.max(1, n)); }
const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
function peakDb(x) { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return db(p); }
function hpBiquad(x, fc) { // Butterworth 2a ordem passa-alta
  const w0 = 2 * Math.PI * fc / SR, c = Math.cos(w0), al = Math.sin(w0) / Math.SQRT2;
  const b0 = (1 + c) / 2, b1 = -(1 + c), b2 = (1 + c) / 2, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; y[i] = v; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; }
  return y;
}
/** Menor janela RMS de 10 ms (dB) em relacao ao RMS da regiao toda: mede buracos de nivel. */
function minDipDb(x, a, b) {
  const W = idx(0.01), all = db(rms(x, a, b)); let m = Infinity;
  for (let s = a; s + W <= b; s += W) m = Math.min(m, db(rms(x, s, s + W)) - all);
  return m;
}
/** Frequencia media (Hz) por cruzamentos ascendentes por zero com interpolacao: imune a modulacao de amplitude. */
function zeroCrossFreq(x, a, b) {
  let first = null, last = null, n = 0;
  for (let i = Math.max(1, a); i < Math.min(b, x.length); i++) if (x[i - 1] < 0 && x[i] >= 0) { const t = (i - 1 + (0 - x[i - 1]) / (x[i] - x[i - 1])) / SR; if (first === null) first = t; last = t; n++; }
  return n > 1 ? (n - 1) / (last - first) : NaN;
}
function energy(x, a, b) { let s = 0; for (let i = Math.max(0, a); i < Math.min(b, x.length); i++) s += x[i] * x[i]; return s; }

function fftMag(re, im) { // radix-2 in-place; devolve nada, preenche re/im
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
      re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}
/** Picos espectrais (Hz) numa janela Hann de 1 s com zero-padding (resolucao ~0.37 Hz) + interpolacao parabolica. */
function spectralPeaks(x, a, count, fmin = 100, fmax = 1200) {
  const N = 1 << 17, re = new Float64Array(N), im = new Float64Array(N), L = SR;
  for (let i = 0; i < L; i++) re[i] = (x[a + i] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (L - 1)));
  fftMag(re, im);
  const m = new Float64Array(N / 2); for (let i = 0; i < N / 2; i++) m[i] = Math.hypot(re[i], im[i]);
  const lo = Math.floor(fmin * N / SR), hi = Math.ceil(fmax * N / SR), peaks = [];
  for (let i = lo + 1; i < hi; i++) if (m[i] > m[i - 1] && m[i] >= m[i + 1] && m[i] > 0) peaks.push(i);
  peaks.sort((p, q) => m[q] - m[p]);
  const chosen = [];
  for (const p of peaks) { if (chosen.every((c) => Math.abs(c - p) > 20 * N / SR / 10)) chosen.push(p); if (chosen.length >= count) break; }
  return chosen.map((p) => { const a1 = Math.log(m[p - 1]), b1 = Math.log(m[p]), c1 = Math.log(m[p + 1]); const d = 0.5 * (a1 - c1) / (a1 - 2 * b1 + c1); return (p + d) * SR / N; }).sort((p, q) => p - q);
}

/** Atrasos de ataque (ms): primeiro cruzamento de 20% do pico local da envoltoria (1 ms) e centroide de energia. */
function onsetDelays(out, inp, times, win = 0.09) {
  const eo = movAvgAbs(out, 48), ei = movAvgAbs(inp, 48), res = [];
  for (const t of times) {
    const a = idx(t) - idx(0.002), b = idx(t) + idx(win);
    if (b >= out.length) continue;
    const pk = (e) => { let p = 0; for (let i = a; i < b; i++) p = Math.max(p, e[i]); return p; };
    const first = (e, p) => { for (let i = a; i < b; i++) if (e[i] >= 0.2 * p) return i; return -1; };
    const pi = pk(ei), po = pk(eo);
    if (pi <= 0 || po < 0.02 * pi) { res.push({ t, onset: null, centroid: null, gain: po / (pi || 1) }); continue; }
    const cen = (x) => { let s = 0, w = 0; for (let i = a; i < b; i++) { const e = x[i] * x[i]; s += e * i; w += e; } return w > 0 ? s / w : NaN; };
    res.push({ t, onset: (first(eo, po) - first(ei, pi)) / SR * 1000, centroid: (cen(out) - cen(inp)) / SR * 1000, gain: po / pi });
  }
  return res;
}
const stats = (v) => { const a = v.filter((x) => Number.isFinite(x)); if (!a.length) return null; const m = a.reduce((s, x) => s + x, 0) / a.length; return { n: a.length, mean: +m.toFixed(2), min: +Math.min(...a).toFixed(2), max: +Math.max(...a).toFixed(2), std: +Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length).toFixed(2) }; };

/** Lag (ms) que maximiza a correlacao normalizada entre envoltorias (1 kHz) de saida e referencia; positivo = saida atrasada. */
function envLagMs(out, ref, t0, t1, maxLagMs = 120) {
  const dec = 48, env = (x) => { const e = movAvgAbs(x, 96), r = []; for (let i = idx(t0); i < Math.min(idx(t1), x.length); i += dec) r.push(e[i]); return Float64Array.from(r); };
  const a = env(out), b = env(ref), n = a.length, L = maxLagMs;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  const corr = (lag) => { let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { const j = i - lag; if (j < 0 || j >= n) continue; const x = a[i] - ma, y = b[j] - mb; s += x * y; sa += x * x; sb += y * y; } return s / Math.sqrt(sa * sb || 1); };
  let best = -2, bl = 0; const cs = {};
  for (let l = -L; l <= L; l++) { cs[l] = corr(l); if (cs[l] > best) { best = cs[l]; bl = l; } }
  const y0 = cs[bl - 1] ?? best, y2 = cs[bl + 1] ?? best, d = (y0 - y2) / (2 * (y0 - 2 * best + y2) || 1);
  return { lagMs: +(bl + (Number.isFinite(d) ? d : 0)).toFixed(2), corr: +best.toFixed(3) };
}
/** Correlacao cruzada de amostras (sinais de mesma frequencia): lag em amostras. */
function sampleLag(a, b, t0, t1, maxLag = 480) {
  const s = idx(t0), e = Math.min(idx(t1), a.length - maxLag - 1);
  let best = -Infinity, bl = 0;
  for (let l = -maxLag; l <= maxLag; l++) { let c = 0; for (let i = s; i < e; i++) c += a[i + l] * b[i]; if (c > best) { best = c; bl = l; } }
  return bl;
}

/** Janelas de analise ao redor dos comandos. */
function transitionMetrics(out, refs, wetRefs, cmds, material) {
  // Comandos a menos de 300 ms um do outro formam um cluster; cada cluster tem sua janela [primeiro-10 ms, ultimo+250 ms].
  const clusters = [];
  for (const c of cmds) { const l = clusters[clusters.length - 1]; if (l && c.t - l[l.length - 1].t < 0.3) l.push(c); else clusters.push([c]); }
  const agg = { rmsDeltaDb: 0, windowsMs: [], stepRatio: 0, maxStepOut: 0, maxStepRef: 0, hfDeltaDb: -Infinity, dipOutDb: Infinity, dipRefDb: Infinity };
  const hp = hpBiquad(out, 8000), hpRefs = refs.map((r) => hpBiquad(r, 8000));
  for (const cl of clusters) {
    const t0 = cl[0].t - 0.01, t1 = cl[cl.length - 1].t + 0.25, a = idx(t0), b = idx(t1);
    const stepRef = Math.max(...refs.map((r) => maxStep(r, a, b))), step = maxStep(out, a, b);
    const hf = (x, h) => 10 * Math.log10(Math.max(energy(h, a, b), 1e-20) / Math.max(energy(x, a, b), 1e-20));
    const hfOut = hf(out, hp), hfRef = Math.max(...refs.map((r, i) => hf(r, hpRefs[i])));
    agg.windowsMs.push([+(t0 * 1000).toFixed(0), +(t1 * 1000).toFixed(0)]);
    agg.stepRatio = Math.max(agg.stepRatio, step / Math.max(stepRef, 1e-9));
    agg.maxStepOut = Math.max(agg.maxStepOut, step); agg.maxStepRef = Math.max(agg.maxStepRef, stepRef);
    agg.hfDeltaDb = Math.max(agg.hfDeltaDb, hfOut - hfRef);
    // nivel da janela inteira vs estados estacionarios (silencio inesperado ou excesso de nivel, em qualquer material)
    const rd = db(rms(out, a, b)) - db(Math.sqrt(refs.reduce((s, r) => s + rms(r, a, b) ** 2, 0) / refs.length));
    if (Math.abs(rd) > Math.abs(agg.rmsDeltaDb)) agg.rmsDeltaDb = rd;
    // buracos de nivel (so material tonal continuo): menor janela de 10 ms vs RMS da janela; referencia = pior caso dos estados estacionarios (seco e wet)
    if (material === 'sine' || material === 'chord') {
      agg.dipOutDb = Math.min(agg.dipOutDb, minDipDb(out, a, b));
      agg.dipRefDb = Math.min(agg.dipRefDb, ...[...refs, ...wetRefs].map((r) => minDipDb(r, a, b)));
    }
  }
  const r2 = (v) => (Number.isFinite(v) ? +v.toFixed(2) : null);
  return { windowsMs: agg.windowsMs, maxStepOut: +agg.maxStepOut.toFixed(5), maxStepRef: +agg.maxStepRef.toFixed(5), stepRatio: r2(agg.stepRatio), hfDeltaDb: r2(agg.hfDeltaDb), rmsDeltaDb: r2(agg.rmsDeltaDb), dipOutDb: r2(agg.dipOutDb), dipRefDb: r2(agg.dipRefDb), peakDb: +peakDb(out).toFixed(2), material };
}

// ------------------------------------------------------------------ execucao
async function main() {
  const code = await bundle();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: code });

  const SECONDS = 8;
  const sig = signals(SECONDS);
  let violao = null;
  const vf = path.join(BASE, 'violao_real_20s.wav');
  if (fs.existsSync(vf)) { const w = readWavMono(vf); violao = w.data.slice(0, SECONDS * SR); let pk = 0; for (const v of violao) pk = Math.max(pk, Math.abs(v)); const g = pk > 0 ? 0.5 / pk : 1; violao = violao.map((v) => v * g); }

  let lastState = null;
  const render = async (material, spec) => {
    const data = { sine: sig.sine, chord: sig.chord, clicks120: sig.clicks120, dense: sig.dense, violao }[material];
    const r = await page.evaluate((s) => window.AudioRender.renderScenario(s), {
      sampleRate: SR, seconds: SECONDS, mode: spec.mode ?? 'SPLIT_IEM_PA',
      // `right` (Float32Array) torna o stem estéreo: `data` vira o canal L
      stems: (spec.stems ?? [{ id: 's1', type: spec.type ?? 'violao', pitchPolicy: spec.policy }]).map(({ right, ...s }) => ({ ...s, data: b64(data), ...(right ? { dataR: b64(right) } : {}) })),
      initial: spec.initial ?? 0, commands: spec.commands ?? []
    });
    lastState = r.state;
    return r.channels.map(fromB64);
  };
  const save = (name, chans, ch = 1) => { writeWav(path.join(OUT, name + '.wav'), [chans[ch]], SR); };

  const results = { tag: TAG, quick: QUICK, generatedAt: new Date().toISOString(), sampleRate: SR, scenarios: [], latency: {}, routing: {}, checks: [] };
  const fail = (name, ok, detail) => { results.checks.push({ name, ok: !!ok, detail }); };

  // ---- 1) Latencia por caminho (ataques em 120 BPM), estado estacionario
  const paths = [
    ['transposto +2 (harmonico)', { initial: 2 }],
    ['transposto -2 (harmonico)', { initial: -2 }],
    ['sem transposicao (harmonico, 0 st)', { initial: 0 }],
    ['Pitch Lock (bateria/percussivo, +2 pedido)', { initial: 2, type: 'drums', policy: 'percussive' }]
  ];
  const warm = sig.clicks120Times.filter((t) => t > 1.0);
  for (const [name, spec] of paths) {
    const ch = await render('clicks120', spec);
    save('latencia_' + name.replace(/[^a-z0-9+-]+/gi, '_'), ch);
    const d = onsetDelays(ch[1], sig.clicks120, warm);
    results.latency[name] = { onsetMs: stats(d.map((x) => x.onset)), centroidMs: stats(d.map((x) => x.centroid)), gainMin: +Math.min(...d.map((x) => x.gain)).toFixed(2), gainMax: +Math.max(...d.map((x) => x.gain)).toFixed(2) };
  }
  // sample-lag entre dois caminhos secos (harmonico 0 st vs Pitch Lock +2): deve ser 0
  {
    const u = await render('chord', { initial: 0 });
    const l = await render('chord', { initial: 2, type: 'drums', policy: 'percussive' });
    results.latency.lagAmostrasSecoVsPitchLock = sampleLag(u[1], l[1], 1, 5);
  }
  // violao real: envoltoria (lag) e ataques detectados
  if (violao) {
    const dry = await render('violao', { initial: 0 });
    save('violao_0st', dry);
    for (const st of [2, -2]) {
      const w = await render('violao', { initial: st });
      save('violao_' + (st > 0 ? 'p' : 'm') + Math.abs(st) + 'st_estacionario', w);
      results.latency['violao real ' + (st > 0 ? '+' : '') + st + ' st vs seco (lag da envoltoria)'] = envLagMs(w[1], dry[1], 1, 7);
    }
    const lockd = await render('violao', { initial: 2, type: 'drums', policy: 'percussive' });
    results.latency['violao real Pitch Lock vs seco (amostras)'] = sampleLag(lockd[1], dry[1], 1, 7);
  }

  // ---- 2) Cenarios de comandos
  const scen = [
    ['0>+2>0', 0, [{ t: 2.0, st: 2 }, { t: 5.0, st: 0 }]],
    ['+2>-2>+2', 2, [{ t: 2.0, st: -2 }, { t: 5.0, st: 2 }]],
    ['rajada 3 comandos em 20 ms (+2,-2,+2)', 0, [{ t: 2.0, st: 2 }, { t: 2.01, st: -2 }, { t: 2.02, st: 2 }]],
    ['rajada 3 comandos em 20 ms (+2,-2,0)', 0, [{ t: 2.0, st: 2 }, { t: 2.01, st: -2 }, { t: 2.02, st: 0 }]],
    ['rajada 7 comandos em 30 ms (+2,+3,-2,-3,+2,0,+2)', 0, [{ t: 2.0, st: 2 }, { t: 2.005, st: 3 }, { t: 2.01, st: -2 }, { t: 2.015, st: -3 }, { t: 2.02, st: 2 }, { t: 2.025, st: 0 }, { t: 2.03, st: 2 }]]
  ];
  const wetCache = {};
  const materials = QUICK ? ['sine', 'dense'] : ['sine', 'chord', 'clicks120', 'dense', ...(violao ? ['violao'] : [])];
  for (const [si, [sname, initial, commands]] of scen.entries()) {
    if (QUICK && !['0>+2>0', 'rajada 3 comandos em 20 ms (+2,-2,0)'].includes(sname)) continue;
    const last = commands[commands.length - 1].st;
    for (const material of materials) {
      const slug = ('cen' + si + '_' + sname.split(' ')[0] + '_' + material).replace(/[^a-z0-9+>_-]+/gi, '_').replace(/>/g, 'p');
      const ch = await render(material, { initial, commands });
      const finalState = lastState[0];
      const refB = await render(material, { initial });
      const refA = await render(material, { initial: last });
      save(slug, ch); if (!QUICK) { save(slug + '_ref_antes', refB); save(slug + '_ref_depois', refA); }
      const out = ch[1];
      const wetRefs = [];
      if (material === 'sine' || material === 'chord') for (const st of [2, -2]) { wetCache[material + st] ??= (await render(material, { initial: st }))[1]; wetRefs.push(wetCache[material + st]); }
      const m = transitionMetrics(out, [refB[1], refA[1]], wetRefs, commands, material);
      const clipping = ch.some((c) => peakDb(c) > 0);
      const rec = { scenario: sname, material, ...m, clipping, finalState };
      // estado final == ultimo comando (apos o ultimo comando + folga)
      const tFinal = commands[commands.length - 1].t + 1.5;
      if (material === 'sine' || material === 'chord') {
        const f0s = material === 'sine' ? [440] : [220, 277.18, 329.63];
        const want = f0s.map((f) => f * Math.pow(2, last / 12));
        if (material === 'sine') {
          // frequencia media por cruzamentos por zero em 2 s (imune a modulacao de amplitude do crossfade dos taps)
          const f = zeroCrossFreq(out, idx(tFinal), idx(tFinal + 2));
          rec.finalCentsError = [+(1200 * Math.log2(f / want[0])).toFixed(1)];
        } else {
          const got = spectralPeaks(out, idx(tFinal), f0s.length, 150, 700);
          // informativo: picos espectrais sofrem com a AM do crossfade dos taps
          rec.finalCentsErrorPeaks = want.map((w, i) => (got[i] ? +(1200 * Math.log2(got[i] / w)).toFixed(1) : null));
        }
      }
      if (last === 0 && (material === 'sine' || material === 'chord')) {
        // wet em silencio: saida == entrada atrasada pela latencia constante; residuo abaixo de -70 dB
        const ref = refA[1]; let res = 0, en = 0;
        for (let i = idx(tFinal); i < idx(tFinal + 1.5); i++) { res += (out[i] - ref[i]) ** 2; en += ref[i] ** 2; }
        rec.finalResidualDb = +(10 * Math.log10((res + 1e-20) / (en + 1e-20))).toFixed(1);
      }
      rec.finalState = finalState;
      results.scenarios.push(rec);
      fail(`${sname} / ${material}: estado interno final == ultimo comando`, finalState.semitones === last && finalState.wetActive === (last !== 0) && (last === 0 || finalState.pitchUp === (last > 0)), JSON.stringify(finalState));
      // clicks120 tem 1 ataque a cada 500 ms: a janela de transicao as vezes nao contem nenhum, comparacao sem sentido
      if (material !== 'clicks120') fail(`${sname} / ${material}: nivel da janela de transicao dentro de +-3 dB dos estados estacionarios`, Math.abs(m.rmsDeltaDb) <= 3, `${m.rmsDeltaDb} dB`);
      fail(`${sname} / ${material}: sem clipping`, !clipping, `pico ${m.peakDb} dBFS`);
      if (material === 'sine' || material === 'chord') {
        fail(`${sname} / ${material}: salto <= 1.5x referencia`, m.stepRatio <= 1.5, `stepRatio ${m.stepRatio}`);
        fail(`${sname} / ${material}: HF no instante da troca (<= +6 dB sobre a referencia)`, m.hfDeltaDb <= 6, `hfDelta ${m.hfDeltaDb} dB`);
        fail(`${sname} / ${material}: sem buraco de nivel alem do estado estacionario (menor janela de 10 ms >= pior estacionario - 3 dB)`, m.dipOutDb >= m.dipRefDb - 3, `transicao ${m.dipOutDb} dB, estacionario ${m.dipRefDb} dB`);
        if (rec.finalCentsError) fail(`${sname} / ${material}: tom final == ultimo comando (erro < 25 cents; o shifter granular tem erro proprio de ate ~10 cents)`, rec.finalCentsError.every((c) => c !== null && Math.abs(c) < 25), JSON.stringify(rec.finalCentsError));
      }
      if (rec.finalResidualDb !== undefined) fail(`${sname} / ${material}: volta ao seco exata (residuo < -70 dB)`, rec.finalResidualDb < -70, `${rec.finalResidualDb} dB`);
    }
  }

  // ---- 2b) Estado estacionario com wet ligado: o LFO do shifter salta a cada ciclo (2 a 9 Hz); nao pode estalar
  for (const material of ['sine', 'chord']) {
    const dry = (await render(material, { initial: 0 }))[1];
    for (const st of [2, -2, 6, -6]) {
      const wet = (await render(material, { initial: st }))[1];
      const ratio = maxStep(wet, idx(1), idx(7)) / Math.max(maxStep(dry, idx(1), idx(7)), 1e-9);
      // a frequencia sobe com a razao (ate 1.41x em +6 st): o limite natural do salto entre amostras e a razao de pitch
      const bound = Math.max(1, Math.pow(2, st / 12)) * 1.25;
      results.scenarios.push({ scenario: `estacionario ${st > 0 ? '+' : ''}${st} st`, material, stepRatio: +ratio.toFixed(2), bound: +bound.toFixed(2) });
      fail(`estacionario ${st > 0 ? '+' : ''}${st} st / ${material}: sem estalo periodico do LFO (salto <= ${bound.toFixed(2)}x do seco)`, ratio <= bound, `stepRatio ${ratio.toFixed(2)}`);
    }
  }

  // ---- 3) Alinhamento DURANTE a transicao (ataques densos, cenario 0>+2>0)
  {
    const cmds = [{ t: 2.0, st: 2 }, { t: 5.0, st: 0 }];
    const ch = await render('dense', { initial: 0, commands: cmds });
    const lk = await render('dense', { initial: 0, commands: cmds, type: 'drums', policy: 'percussive' });
    save('alinhamento_transicao_harmonico', ch); save('alinhamento_transicao_pitchlock', lk);
    const per = (c) => onsetDelays(c[1], sig.dense, sig.denseTimes.filter((t) => t > 0.5 && t < 7.4), 0.1);
    const dh = per(ch), dl = per(lk);
    const around = (arr, c) => arr.filter((x) => x.t >= c - 0.3 && x.t <= c + 0.5).map((x) => ({ dtMs: +((x.t - c) * 1000).toFixed(0), onsetMs: x.onset === null ? null : +x.onset.toFixed(1), centroidMs: x.centroid === null ? null : +x.centroid.toFixed(1), gain: +x.gain.toFixed(2) }));
    results.transitionAlignment = { entrada2s: around(dh, 2.0), saida5s: around(dh, 5.0), pitchLockMax: stats(dl.map((x) => x.onset)) };
    const stable = (arr, a, b) => stats(arr.filter((x) => x.t > a && x.t < b).map((x) => x.centroid));
    results.transitionAlignment.centroidSecoAntes = stable(dh, 0.5, 1.8);
    results.transitionAlignment.centroidTransposto = stable(dh, 2.6, 4.9);
    results.transitionAlignment.centroidSecoDepois = stable(dh, 5.6, 7.3);
    // salto de alinhamento: variacao maxima entre eventos consecutivos do harmonico (centroide)
    let jump = 0; for (let i = 1; i < dh.length; i++) if (Number.isFinite(dh[i].centroid) && Number.isFinite(dh[i - 1].centroid)) jump = Math.max(jump, Math.abs(dh[i].centroid - dh[i - 1].centroid));
    results.transitionAlignment.maxSaltoCentroideMs = +jump.toFixed(1);
  }

  // ---- 4) Roteamento: click/guia nunca no FOH (R) em SPLIT; nunca em ch1/2 em MULTI
  {
    const mk = (id, type) => ({ id, type, pitchPolicy: type === 'click' || type === 'guide' ? 'locked' : 'harmonic' });
    const rs = await render('sine', { mode: 'SPLIT_IEM_PA', initial: 2, stems: [mk('click', 'click'), mk('guide', 'guide')] });
    results.routing.split = { R_pico_dB: +peakDb(rs[1]).toFixed(1), L_pico_dB: +peakDb(rs[0]).toFixed(1) };
    fail('SPLIT_IEM_PA: click+guia com R (FOH) em silencio absoluto', peakDb(rs[1]) < -150, `R ${peakDb(rs[1]).toFixed(1)} dBFS`);
    fail('SPLIT_IEM_PA: click+guia audiveis no L (IEM)', peakDb(rs[0]) > -30, `L ${peakDb(rs[0]).toFixed(1)} dBFS`);
    const rm = await render('sine', { mode: 'MULTI_4CH_DISCRETE', initial: 2, stems: [mk('click', 'click'), mk('guide', 'guide')] });
    results.routing.multi = rm.map((c) => +peakDb(c).toFixed(1));
    fail('MULTI_4CH: click+guia com ch1/ch2 (FOH) em silencio absoluto', peakDb(rm[0]) < -150 && peakDb(rm[1]) < -150, `ch1 ${peakDb(rm[0]).toFixed(1)} ch2 ${peakDb(rm[1]).toFixed(1)}`);
    fail('MULTI_4CH: click em ch3 e guia em ch4', peakDb(rm[2]) > -30 && peakDb(rm[3]) > -30, `ch3 ${peakDb(rm[2]).toFixed(1)} ch4 ${peakDb(rm[3]).toFixed(1)}`);
    // um stem harmonico transposto nunca vai para ch3/ch4
    const ri = await render('sine', { mode: 'MULTI_4CH_DISCRETE', initial: 2, commands: [{ t: 2, st: -2 }] });
    fail('MULTI_4CH: instrumento transposto fora de ch3/ch4', peakDb(ri[2]) < -150 && peakDb(ri[3]) < -150, `ch3 ${peakDb(ri[2]).toFixed(1)} ch4 ${peakDb(ri[3]).toFixed(1)}`);
  }

  // ---- 4b) Estéreo por stem: L do stem fica na saída L e R na saída R nos modos estéreo; split segue em mono;
  // click/guia estéreos e panoramizados continuam fora do FOH
  {
    const silence = new Float32Array(SECONDS * SR);
    const keysLOnly = (extra = {}) => ({ id: 'k', type: 'keys', pitchPolicy: 'harmonic', right: silence, ...extra });
    const st = (c) => c.map((x) => +peakDb(x).toFixed(1));
    results.routing.stereo = {};
    for (const mode of ['STEREO_FULL', 'MULTI_4CH_DISCRETE']) {
      for (const initial of [0, 2]) {
        const r = await render('sine', { mode, initial, stems: [keysLOnly()] });
        results.routing.stereo[`${mode} ${initial} st, stem so com L`] = st(r);
        fail(`${mode} ${initial > 0 ? '+' : ''}${initial} st: stem estéreo com conteúdo só em L não vaza para a saída R (separação >= 60 dB)`, peakDb(r[0]) - peakDb(r[1]) >= 60, `L ${peakDb(r[0]).toFixed(1)} R ${peakDb(r[1]).toFixed(1)} dBFS`);
        fail(`${mode} ${initial > 0 ? '+' : ''}${initial} st: o L do stem chega à saída L`, peakDb(r[0]) > -30, `L ${peakDb(r[0]).toFixed(1)} dBFS`);
      }
    }
    // Split: L e R são barramentos diferentes (fone x PA): o stem continua somado em mono nos dois
    const sp = await render('sine', { mode: 'SPLIT_IEM_PA', initial: 0, stems: [keysLOnly()] });
    results.routing.stereo['SPLIT_IEM_PA, stem so com L'] = st(sp);
    fail('SPLIT_IEM_PA: stem estéreo chega ao PA (R) somado em mono', peakDb(sp[1]) > -30, `R ${peakDb(sp[1]).toFixed(1)} dBFS`);
    // Stem mono centrado: mesmo nível de antes (pan de potência constante, -3,01 dB em cada lado). Referência
    // medida no próprio grafo: o mesmo stem no PA do SPLIT (ganho 1, sem pan), que inclui o ganho próprio do strip.
    const monoStem = [{ id: 'm', type: 'keys', pitchPolicy: 'harmonic' }];
    const mono = await render('sine', { mode: 'STEREO_FULL', initial: 0, stems: monoStem });
    const monoRef = await render('sine', { mode: 'SPLIT_IEM_PA', initial: 0, stems: monoStem });
    const expected = peakDb(monoRef[1]) - 3.0103;
    results.routing.stereo['STEREO_FULL, stem mono centrado'] = st(mono);
    fail('STEREO_FULL: stem mono centrado com o mesmo nível de antes nos dois lados (+-0,1 dB)', Math.abs(peakDb(mono[0]) - expected) <= 0.1 && Math.abs(peakDb(mono[1]) - expected) <= 0.1, `L ${peakDb(mono[0]).toFixed(2)} R ${peakDb(mono[1]).toFixed(2)} esperado ${expected.toFixed(2)} dBFS`);
    // Click/guia estéreos, panoramizados ao extremo: nada no FOH
    for (const pan of [-1, 0, 1]) {
      const cg = [
        { id: 'click', type: 'click', pitchPolicy: 'locked', right: sig.sine, pan },
        { id: 'guide', type: 'guide', pitchPolicy: 'locked', right: sig.sine, pan }
      ];
      const rs = await render('sine', { mode: 'SPLIT_IEM_PA', initial: 2, stems: cg });
      fail(`SPLIT_IEM_PA: click+guia estéreos (pan ${pan}) com R (FOH) em silêncio absoluto`, peakDb(rs[1]) < -150, `R ${peakDb(rs[1]).toFixed(1)} dBFS`);
      const rm = await render('sine', { mode: 'MULTI_4CH_DISCRETE', initial: 2, stems: cg });
      fail(`MULTI_4CH: click+guia estéreos (pan ${pan}) com ch1/ch2 (FOH) em silêncio absoluto`, peakDb(rm[0]) < -150 && peakDb(rm[1]) < -150, `ch1 ${peakDb(rm[0]).toFixed(1)} ch2 ${peakDb(rm[1]).toFixed(1)}`);
    }
  }

  // ---- 5) Criterios de alinhamento (tolerancia adotada; justificativa em docs/qa/alinhamento-audio-2026-10-21.md)
  //   media de ataque/centroide do caminho transposto vs Pitch Lock <= 5 ms; cada evento isolado <= 15 ms; seco == Pitch Lock (0 amostras).
  const L = results.latency;
  const TOL_MEAN_MS = Number(arg('--tol-mean', '5')), TOL_EVENT_MS = Number(arg('--tol-event', '15'));
  const lock = L['Pitch Lock (bateria/percussivo, +2 pedido)'];
  for (const name of ['transposto +2 (harmonico)', 'transposto -2 (harmonico)']) {
    const c = L[name].centroidMs, o = L[name].onsetMs;
    const dc = c.mean - lock.centroidMs.mean, dO = o.mean - lock.onsetMs.mean;
    fail(`alinhamento ${name}: centroide medio vs Pitch Lock <= ${TOL_MEAN_MS} ms`, Math.abs(dc) <= TOL_MEAN_MS, `delta ${dc.toFixed(2)} ms`);
    fail(`alinhamento ${name}: ataque medio (20% do pico) vs Pitch Lock <= ${TOL_MEAN_MS} ms`, Math.abs(dO) <= TOL_MEAN_MS, `delta ${dO.toFixed(2)} ms`);
    const lo = Math.min(o.min - lock.onsetMs.mean, c.min - lock.centroidMs.mean), hi = Math.max(o.max - lock.onsetMs.mean, c.max - lock.centroidMs.mean);
    fail(`alinhamento ${name}: nenhum evento alem de +-${TOL_EVENT_MS} ms do Pitch Lock`, lo >= -TOL_EVENT_MS && hi <= TOL_EVENT_MS, `pior evento ${lo.toFixed(1)} / +${hi.toFixed(1)} ms`);
  }
  const u = L['sem transposicao (harmonico, 0 st)'];
  fail('alinhamento sem transposicao vs Pitch Lock: identico (|delta| <= 0.1 ms)', Math.abs(u.onsetMs.mean - lock.onsetMs.mean) <= 0.1 && Math.abs(u.centroidMs.mean - lock.centroidMs.mean) <= 0.1, `${(u.centroidMs.mean - lock.centroidMs.mean).toFixed(2)} ms`);
  fail('alinhamento seco vs Pitch Lock: 0 amostras', L.lagAmostrasSecoVsPitchLock === 0, `lag ${L.lagAmostrasSecoVsPitchLock}`);
  {
    // entrando/saindo da transposicao: media do centroide transposto vs media do seco antes/depois (sem salto sistematico)
    const t = results.transitionAlignment, ent = t.centroidTransposto.mean - t.centroidSecoAntes.mean, sai = t.centroidTransposto.mean - t.centroidSecoDepois.mean;
    results.transitionAlignment.saltoMedioEntradaMs = +ent.toFixed(2); results.transitionAlignment.saltoMedioSaidaMs = +sai.toFixed(2);
    fail(`salto medio de alinhamento ao entrar na transposicao <= ${TOL_MEAN_MS} ms`, Math.abs(ent) <= TOL_MEAN_MS, `${ent.toFixed(2)} ms`);
    fail(`salto medio de alinhamento ao sair da transposicao <= ${TOL_MEAN_MS} ms`, Math.abs(sai) <= TOL_MEAN_MS, `${sai.toFixed(2)} ms`);
    fail(`Pitch Lock inalterado durante os comandos (faixa de ataque <= 0.1 ms)`, t.pitchLockMax.max - t.pitchLockMax.min <= 0.1, `${(t.pitchLockMax.max - t.pitchLockMax.min).toFixed(2)} ms`);
  }

  // ---- 6) Click procedural REAL (MetronomeScheduler): margem de partida de 50 ms, troca de modo e parada em pleno voo
  {
    const SECS = 8;
    const clickRun = async (spec) => {
      const r = await page.evaluate((s) => window.AudioRender.renderClickScenario(s), { sampleRate: SR, seconds: SECS, mode: 'SPLIT_IEM_PA', ...spec });
      return r.channels.map(fromB64);
    };
    // primeiro cruzamento de 10% do pico da janela, em ms apos o instante alvo; null se nao ha ataque
    const onsetMs = (x, tb) => { const a = idx(tb - 0.1), b = idx(tb + 0.15); let pk = 0; for (let i = a; i < b; i++) pk = Math.max(pk, Math.abs(x[i])); if (pk < 1e-4) return null; for (let i = a; i < b; i++) if (Math.abs(x[i]) > 0.1 * pk) return (i - idx(tb)) / SR * 1000; return null; };
    const beats = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((k) => 0.05 + k * 0.5);
    const stemR = (await clickRun({ withStem: true }))[1];
    const clickWith = (await clickRun({ withClick: true }))[0];
    const clickNoLead = (await clickRun({ withClick: true, ignoreLead: true }))[0];
    const deltas = (clk) => beats.map((tb) => { const a = onsetMs(clk, tb), b = onsetMs(stemR, tb); return a == null || b == null ? NaN : a - b; });
    const dOk = deltas(clickWith), dBad = deltas(clickNoLead);
    results.clickAlignment = { margemMs: 50, comMargemTratada: stats(dOk), semTratarMargem_controle: stats(dBad) };
    fail('click procedural x stem (50 ms de margem tratada): todos os 14 tempos medidos', dOk.every(Number.isFinite), `${dOk.filter(Number.isFinite).length}/14`);
    fail('click procedural x stem (50 ms de margem tratada): |media| <= 1 ms e pior tempo <= 2 ms', Math.abs(results.clickAlignment.comMargemTratada.mean) <= 1 && Math.max(...dOk.map(Math.abs)) <= 2, JSON.stringify(results.clickAlignment.comMargemTratada));
    fail('controle negativo: sem tratar a margem o click adianta ~50 ms (o teste enxerga o erro)', Math.abs(results.clickAlignment.semTratarMargem_controle.mean + 50) <= 2, JSON.stringify(results.clickAlignment.semTratarMargem_controle));

    // Stereo -> Split em pleno voo: o click do tempo 2,5 s ja estava agendado (lookahead) no destino Stereo (R = FOH)
    const swSpec = { mode: 'STEREO_FULL', switchTo: 'SPLIT_IEM_PA', switchAt: 2.46, withClick: true };
    const rOn = await clickRun(swSpec);
    const rOff = await clickRun({ ...swSpec, skipReroute: true });
    const rAfter = (ch) => peakDb(ch.slice(idx(2.461), idx(SECS)));
    results.routing.stereoParaSplit = { R_depois_dB: +rAfter(rOn[1]).toFixed(1), L_depois_dB: +rAfter(rOn[0]).toFixed(1), R_depois_semReligar_controle_dB: +rAfter(rOff[1]).toFixed(1) };
    fail('Stereo->Split com click agendado: R (FOH) em silencio absoluto depois da troca', rAfter(rOn[1]) < -150, `R ${rAfter(rOn[1]).toFixed(1)} dBFS`);
    fail('Stereo->Split: click segue audivel no L (IEM)', rAfter(rOn[0]) > -30, `L ${rAfter(rOn[0]).toFixed(1)} dBFS`);
    fail('controle negativo: sem religar os pendentes o click vazaria no R (o teste enxerga o vazamento)', rAfter(rOff[1]) > -40, `R ${rAfter(rOff[1]).toFixed(1)} dBFS`);

    // stop()/pause/seek: o click ja agendado (tempo 2,5 s) nao pode tocar depois da parada em 2,46 s
    const rs2 = await clickRun({ withClick: true, stopAt: 2.46 });
    const rs2Ctl = await clickRun({ withClick: true });
    const after = (ch) => peakDb(ch.slice(idx(2.47), idx(SECS)));
    const afterStop = Math.max(after(rs2[0]), after(rs2[1]));
    fail('controle negativo: sem parar, ha click depois de 2,47 s (a janela medida tem som)', after(rs2Ctl[0]) > -30, ` dBFS`);
    results.routing.pararComClickAgendado = { pico_depois_dB: +afterStop.toFixed(1) };
    fail('stop() com click agendado: silencio absoluto depois da parada', afterStop < -150, `${afterStop.toFixed(1)} dBFS`);
  }
  await browser.close();

  // ---- imagens (ffmpeg) para os renders principais
  if (!QUICK) {
    for (const f of fs.readdirSync(OUT).filter((n) => n.endsWith('.wav') && !n.includes('_ref_'))) {
      const base = path.join(OUT, f.replace(/\.wav$/, ''));
      spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', base + '.wav', '-filter_complex', 'showwavespic=s=1600x240:colors=0x2a6fdb', '-frames:v', '1', base + '_onda.png'], { stdio: 'ignore' });
      spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', base + '.wav', '-lavfi', 'showspectrumpic=s=1600x400:legend=0:scale=log', base + '_espectro.png'], { stdio: 'ignore' });
    }
  }
  const failed = results.checks.filter((c) => !c.ok);
  results.summary = { checks: results.checks.length, failed: failed.length };
  fs.writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ out: OUT, latency: results.latency, transitionAlignment: { ...results.transitionAlignment, entrada2s: undefined, saida5s: undefined }, routing: results.routing, summary: results.summary }, null, 1));
  for (const c of results.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  [${c.detail}]`);
  if (CHECK && failed.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(2); });
