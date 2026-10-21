// Mede o custo da analise de tom no Chromium: tempo total, pico de memoria e responsividade (tarefas longas, atraso
// do laco de eventos medido por um batimento de 10 ms na propria pagina), com e sem CPU 4x mais lenta (Emulation.setCPUThrottlingRate).
//   node scripts/key-bench.mjs --out <dir> [--runs 3] [--seconds 300]
// "antes" = AudioKeyAnalyzer/SongKeyDetector do commit 6c99b70 (mixdown e cromagrama na thread principal);
// "depois" = versao atual (cromagrama em Worker). Estes stems sao SINTETICOS (progressao F-Bb-C-F, 4 stems estereo
// de --seconds): o custo depende de duracao e formato, nao do conteudo. NAO mede tablet real.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const OUT = opt('out');
const RUNS = Number(opt('runs', '3'));
const SECONDS = Number(opt('seconds', '300'));
if (!OUT) throw new Error('uso: key-bench.mjs --out <dir>');
fs.mkdirSync(OUT, { recursive: true });
const SR = 44100;

function makeWavs() {
  const dir = path.join(OUT, 'stems-sinteticos');
  fs.mkdirSync(dir, { recursive: true });
  const chords = [65, 70, 72, 65]; // F Bb C F
  const voicings = [
    (r) => [r - 24], // baixo
    (r) => [r - 12, r - 8, r - 5],
    (r) => [r, r + 4, r + 7, r + 12],
    (r) => [r - 12, r, r + 4, r + 7]
  ];
  const files = [];
  voicings.forEach((voicing, s) => {
    const file = path.join(dir, `stem-${s}.wav`);
    files.push(file);
    if (fs.existsSync(file)) return;
    const n = SR * SECONDS;
    const pcm = new Int16Array(n * 2);
    const seg = SR * 3;
    for (let i = 0; i < n; i++) {
      const chord = chords[Math.floor(i / seg) % chords.length];
      const t = (i % seg) / SR;
      let v = 0;
      for (const note of voicing(chord)) {
        const f = 440 * 2 ** ((note - 69) / 12);
        v += Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t);
      }
      const env = 0.12 * Math.exp(-0.6 * t) * 0.9 + 0.02;
      const x = Math.max(-1, Math.min(1, (v * env) / 3)) * 32767;
      pcm[2 * i] = x;
      pcm[2 * i + 1] = x * (s % 2 ? 0.9 : 1);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.byteLength, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(SR, 24);
    header.writeUInt32LE(SR * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36);
    header.writeUInt32LE(pcm.byteLength, 40);
    fs.writeFileSync(file, Buffer.concat([header, Buffer.from(pcm.buffer)]));
  });
  return files;
}

/** Soma do conjunto de trabalho dos processos do navegador (raiz + descendentes), a cada ~150 ms. */
function startMemorySampler(rootPid) {
  const script = `$root=${rootPid}; while($true){ $all=Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize; $set=@{}; $set[[uint32]$root]=1; do { $n=0; foreach($p in $all){ if($set.ContainsKey([uint32]$p.ParentProcessId) -and -not $set.ContainsKey([uint32]$p.ProcessId)){ $set[[uint32]$p.ProcessId]=1; $n++ } } } while($n -gt 0); $sum=0; foreach($p in $all){ if($set.ContainsKey([uint32]$p.ProcessId)){ $sum+=$p.WorkingSetSize } }; "$([DateTimeOffset]::Now.ToUnixTimeMilliseconds()),$sum"; Start-Sleep -Milliseconds 100 }`;
  const child = spawn('powershell', ['-NoProfile', '-Command', script], { stdio: ['ignore', 'pipe', 'ignore'] });
  const samples = [];
  child.stdout.on('data', (d) => {
    for (const line of String(d).split(/\r?\n/)) {
      const [t, b] = line.split(',');
      if (t && b) samples.push({ t: Number(t), mb: Number(b) / 1048576 });
    }
  });
  return { samples, stop: () => child.kill() };
}

const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

async function main() {
  const wavs = makeWavs();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'key-bench-'));
  const legacyDir = path.join(tmp, 'legacy');
  for (const rel of ['services/SongKeyDetector', 'audio/AudioKeyAnalyzer']) {
    const dest = path.join(legacyDir, rel.startsWith('services') ? 'domain/services/SongKeyDetector.ts' : 'infrastructure/audio/AudioKeyAnalyzer.ts');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const git = rel.startsWith('services') ? 'src/domain/services/SongKeyDetector.ts' : 'src/infrastructure/audio/AudioKeyAnalyzer.ts';
    fs.writeFileSync(dest, execFileSync('git', ['show', `6c99b70:${git}`], { cwd: ROOT, encoding: 'utf8' }));
  }
  const vite = await import(pathToFileURL(path.join(ROOT, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);
  const server = await vite.createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    optimizeDeps: { entries: ['scripts/key-bench/index.html'] },
    server: {
      port: 5199, strictPort: false, fs: { allow: [ROOT, tmp, OUT] },
      headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }
    },
    plugins: [
      {
        name: 'bench-wavs',
        configureServer(s) {
          s.middlewares.use('/wav/', (req, res) => {
            const f = wavs[Number(req.url.replace(/\D/g, ''))];
            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
            fs.createReadStream(f).pipe(res);
          });
        }
      }
    ]
  });
  await server.listen();
  const base = `http://localhost:${server.config.server.port}`;
  const legacyUrl = `/@fs/${legacyDir.replace(/\\/g, '/')}/infrastructure/audio/AudioKeyAnalyzer.ts`;

  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: true }).trim();
  const pw = createRequire(path.join(root, 'noop.js'))('playwright');

  const rows = [];
  try {
    for (const throttle of [1, 4]) {
      for (const mode of ['legacy', 'worker']) {
        for (let run = 0; run < RUNS; run++) {
          const browser = await pw.chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] });
          const page = await (await browser.newContext({ viewport: { width: 1024, height: 768 } })).newPage();
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Performance.enable');
          await page.goto(`${base}/scripts/key-bench/index.html?mode=${mode}&legacy=${encodeURIComponent(legacyUrl)}`);
          await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
          const info = await (await browser.newBrowserCDPSession()).send('SystemInfo.getProcessInfo');
          const mem = startMemorySampler(info.processInfo.find((p) => p.type === 'browser').id);
          await new Promise((r) => setTimeout(r, 4000)); // o PowerShell do amostrador leva ~2 s para a primeira leitura
          const baseline = mem.samples.length ? median(mem.samples.map((s) => s.mb)) : 0;
          if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
          const heap = [];
          const heapTimer = setInterval(async () => {
            try {
              const m = await cdp.send('Performance.getMetrics');
              heap.push(m.metrics.find((x) => x.name === 'JSHeapUsedSize').value / 1048576);
            } catch { /* pagina ocupada */ }
          }, 200);
          const t0 = Date.now();
          const result = await page.evaluate((n) => window.runBench([0, 1, 2, 3].map((i) => `/wav/${i}`)), 4);
          const t1 = Date.now();
          clearInterval(heapTimer);
          delete result.stopHandledAt;
          await new Promise((r) => setTimeout(r, 300));
          mem.stop();
          const during = mem.samples.filter((s) => s.t >= t0 && s.t <= t1 + 200).map((s) => s.mb);
          rows.push({
            mode, cpuThrottle: throttle, run, ...result,
            browserPeakMB: Math.round(Math.max(...during, 0)),
            browserBaselineMB: Math.round(baseline),
            jsHeapPeakMB: Math.round(Math.max(0, ...heap))
          });
          console.log(JSON.stringify(rows.at(-1)));
          await browser.close();
        }
      }
    }
  } finally {
    await server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(OUT, 'bench-bruto.json'), JSON.stringify(rows, null, 1));
  const summary = [];
  for (const throttle of [1, 4]) {
    for (const mode of ['legacy', 'worker']) {
      const r = rows.filter((x) => x.mode === mode && x.cpuThrottle === throttle);
      const med = (k) => Math.round(median(r.map((x) => x[k])));
      summary.push({
        versao: mode === 'legacy' ? 'antes (thread principal)' : 'depois (Worker)', cpu: `${throttle}x`, execucoes: r.length,
        tempoTotalMs: med('totalMs'), tarefasLongas: med('longTaskCount'), tarefaLongaMaxMs: med('longTaskMaxMs'),
        atrasoLacoMedianaMs: med('maxLoopLagMs'), atrasoLacoPiorMs: Math.round(Math.max(...r.map((x) => x.maxLoopLagMs))),
        picoNavegadorMB: med('browserPeakMB'), baseNavegadorMB: med('browserBaselineMB'), picoHeapJsMB: med('jsHeapPeakMB'), tom: r[0]?.key
      });
    }
  }
  fs.writeFileSync(path.join(OUT, 'bench-resumo.json'), JSON.stringify(summary, null, 1));
  console.table(summary);
}
main().catch((e) => { console.error(e); process.exit(1); });
