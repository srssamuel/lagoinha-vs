// Prints dos estados do tom (nao identificado, ambiguo, estimado, confirmado, do nome) em 768x1024 e 1440x900.
//   node scripts/key-shots.mjs --out <dir>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--out');
const OUT = i >= 0 ? process.argv[i + 1] : null;
if (!OUT) throw new Error('uso: key-shots.mjs --out <dir>');
fs.mkdirSync(OUT, { recursive: true });

const vite = await import(pathToFileURL(path.join(ROOT, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);
const server = await vite.createServer({
  root: ROOT, configFile: false, logLevel: 'error',
  optimizeDeps: { entries: ['scripts/key-bench/ui.html'] },
  server: { port: 5198, strictPort: false }
});
await server.listen();
const base = `http://localhost:${server.config.server.port}`;
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: true }).trim();
const pw = createRequire(path.join(globalRoot, 'noop.js'))('playwright');
const browser = await pw.chromium.launch({ headless: true });
try {
  for (const [w, h] of [[768, 1024], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    for (const state of ['unknown', 'ambiguous', 'estimated', 'confirmed', 'named']) {
      await page.goto(`${base}/scripts/key-bench/ui.html?state=${state}`);
      await page.waitForSelector('[data-key-status]');
      await page.waitForTimeout(300);
      const file = path.join(OUT, `tom-${state}-${w}x${h}.png`);
      await page.screenshot({ path: file });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const smallTargets = await page.evaluate(() =>
        [...document.querySelectorAll('[data-key-status] button, [data-key-status] select')]
          .filter((el) => el.getBoundingClientRect().height < 44).length);
      console.log(JSON.stringify({ state, w, h, overflowHorizontal: overflow, alvosMenoresQue44px: smallTargets, file }));
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
