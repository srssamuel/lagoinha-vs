import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regressão de alinhamento e de estalos no ÁUDIO RENDERIZADO do grafo de produção (sem mocks de AudioParam):
 * roda scripts/audio-render/render-alignment.mjs --check --quick, que empacota o TS de produção com esbuild,
 * renderiza num OfflineAudioContext do Chromium (Playwright global) e mede descontinuidade, clipping, estado
 * final, alinhamento transposto x Pitch Lock (ataque e centroide) e vazamento de click/guia para o FOH.
 *
 * Sem Playwright/Chromium (ex.: CI sem navegador) ou com SKIP_AUDIO_RENDER=1 o teste aparece como SKIP explícito
 * ("PULADO: ..." no relatório do Vitest) e emite console.warn; nunca como PASS. Com REQUIRE_AUDIO_RENDER=1 a
 * ausência do Playwright FALHA o teste (use na CI que deve provar o áudio renderizado).
 * Matriz completa e WAVs/imagens: `node scripts/audio-render/render-alignment.mjs`.
 */
function playwrightAvailable(): boolean {
  if (process.env.SKIP_AUDIO_RENDER === '1') return false;
  const npm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' });
  const root = npm.stdout?.trim();
  if (!root) return false;
  try {
    createRequire(path.join(root, 'noop.js'))('playwright');
    return true;
  } catch {
    return false;
  }
}

const required = process.env.REQUIRE_AUDIO_RENDER === '1';
const available = playwrightAvailable();
if (!available) {
  console.warn(
    "[AudioAlignmentRender] PULADO: Playwright ausente (ou SKIP_AUDIO_RENDER=1): o render real do Chromium NÃO foi executado, " +
      'logo alinhamento, estalos e vazamento de click/guia não foram verificados no áudio renderizado.' +
      (required ? ' REQUIRE_AUDIO_RENDER=1: o teste vai falhar.' : '')
  );
}

describe('Render real do grafo de áudio (Chromium, OfflineAudioContext)', () => {
  // Visível no relatório: ausente + obrigatório = falha; ausente + opcional = skip com nome "PULADO: ..."
  if (!available && required) {
    it('REQUIRE_AUDIO_RENDER=1: Playwright precisa estar disponível', () => {
      expect.fail('PULADO não é aceito com REQUIRE_AUDIO_RENDER=1: Playwright/Chromium ausente (ou SKIP_AUDIO_RENDER=1)');
    });
  } else if (!available) {
    it.skip('PULADO: Playwright ausente - render real do Chromium não executado (REQUIRE_AUDIO_RENDER=1 torna isto uma falha)', () => {});
  }

  it.skipIf(!available)(
    'sem estalo na troca de tom, alinhamento transposto x Pitch Lock dentro da tolerância e click/guia fora do FOH',
    () => {
      const script = path.resolve(__dirname, '..', '..', '..', 'scripts', 'audio-render', 'render-alignment.mjs');
      const r = spawnSync(process.execPath, [script, '--check', '--quick', '--tag', 'vitest'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        timeout: 170_000
      });
      const failures = (r.stdout ?? '').split('\n').filter((l) => l.startsWith('FAIL'));
      expect(failures, `${failures.join('\n')}\n${r.stderr ?? ''}`).toEqual([]);
      expect(r.status, r.stderr ?? '').toBe(0);
    },
    180_000
  );
});
