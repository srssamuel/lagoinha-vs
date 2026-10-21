// Pagina da bancada: roda detectKeyFromStems (versao antiga ou nova) e mede tarefas longas, atraso do laco de
// eventos e latencia de clique no Stop enquanto a analise acontece.
const params = new URLSearchParams(location.search);
const mode = params.get('mode');
const mod =
  mode === 'legacy'
    ? await import(/* @vite-ignore */ params.get('legacy'))
    : await import('/src/infrastructure/audio/AudioKeyAnalyzer.ts');


window.runBench = async (urls) => {
  const types = ['bass', 'keys', 'pad', 'guitars'];
  const stems = await Promise.all(urls.map(async (u, i) => ({ type: types[i], blob: await (await fetch(u)).blob() })));
  const longtasks = [];
  const po = new PerformanceObserver((list) => longtasks.push(...list.getEntries().map((e) => e.duration)));
  po.observe({ type: 'longtask', buffered: true });
  let last = performance.now();
  let maxLag = 0;
  const hb = setInterval(() => {
    const n = performance.now();
    maxLag = Math.max(maxLag, n - last - 10);
    last = n;
  }, 10);
  window.__running = true;
  const t0 = performance.now();
  const result = await mod.detectKeyFromStems(stems);
  const totalMs = performance.now() - t0;
  window.__running = false;
  clearInterval(hb);
  await new Promise((r) => setTimeout(r, 100));
  po.disconnect();
  return {
    key: result?.key ?? null,
    totalMs,
    longTaskCount: longtasks.length,
    longTaskTotalMs: longtasks.reduce((a, b) => a + b, 0),
    longTaskMaxMs: Math.max(0, ...longtasks),
    maxLoopLagMs: maxLag
  };
};
window.__ready = true;
