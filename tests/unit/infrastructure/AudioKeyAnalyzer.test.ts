import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeKeyFromStems, isAbortError } from '../../../src/infrastructure/audio/AudioKeyAnalyzer';

const SR = 44100;
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Acordes (listas de notas MIDI) de 1,5 s cada, com harmônicos. */
function render(chords: number[][]): Float32Array {
  const per = Math.floor(SR * 1.5);
  const out = new Float32Array(per * chords.length);
  chords.forEach((notes, c) => {
    for (const n of notes) {
      const f = hz(n);
      for (let i = 0; i < per; i++) {
        const t = i / SR;
        out[c * per + i]! +=
          (0.1 * Math.exp(-1.2 * t) * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t))) / notes.length;
      }
    }
  });
  return out;
}
const triad = (root: number, minor = false) => [root - 12, root, root + (minor ? 3 : 4), root + 7];

let active = 0;
let maxActive = 0;
function stubWebAudio(pcm: Float32Array) {
  class FakeOfflineCtx {
    async decodeAudioData(): Promise<unknown> {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { length: pcm.length, numberOfChannels: 1, getChannelData: () => pcm };
    }
  }
  vi.stubGlobal('OfflineAudioContext', FakeOfflineCtx);
}
const stems = (n = 1) => Array.from({ length: n }, () => ({ type: 'bass' as const, blob: new Blob([new Uint8Array(8)]) }));

afterEach(() => {
  vi.unstubAllGlobals();
  active = 0;
  maxActive = 0;
});

describe('analyzeKeyFromStems — tom pelo áudio com procedência (sem Worker no Node: caminho em linha)', () => {
  it('análise conclusiva vira tom estimado e não confirmado', async () => {
    stubWebAudio(render([triad(65), triad(70), triad(72), triad(65)])); // I-IV-V-I em Fá
    const info = await analyzeKeyFromStems(stems());
    expect(info).toMatchObject({ origin: 'audio', estimated: true, confirmed: false });
    expect(info.value ?? info.candidates).toBeTruthy();
  });

  it('sem Web Audio ou só com stems não tonais: sem tom (nunca "G")', async () => {
    expect((await analyzeKeyFromStems(stems())).value).toBeNull();
    stubWebAudio(render([triad(65)]));
    const drums = [{ type: 'drums' as const, blob: new Blob([new Uint8Array(8)]) }];
    expect(await analyzeKeyFromStems(drums)).toMatchObject({ value: null, origin: null });
  });

  it('cancelamento antes de começar rejeita com AbortError e não decodifica', async () => {
    stubWebAudio(render([triad(65)]));
    const controller = new AbortController();
    controller.abort();
    await expect(analyzeKeyFromStems(stems(), { signal: controller.signal })).rejects.toSatisfy(isAbortError);
    expect(maxActive).toBe(0);
  });

  it('fila: duas músicas analisadas ao mesmo tempo nunca decodificam em paralelo', async () => {
    stubWebAudio(render([triad(65), triad(70)]));
    await Promise.all([analyzeKeyFromStems(stems(2)), analyzeKeyFromStems(stems(2))]);
    expect(maxActive).toBe(1);
  });

  it('progresso termina em 100%', async () => {
    stubWebAudio(render([triad(65), triad(70)]));
    const seen: number[] = [];
    await analyzeKeyFromStems(stems(), { onProgress: (p) => seen.push(p.fraction) });
    expect(seen.at(-1)).toBe(1);
  });
});

describe('analyzeKeyFromStems: falha do Worker', () => {
  it('Worker que não carrega ou quebra vira "sem tom", não exceção', async () => {
    stubWebAudio(render([triad(65), triad(70), triad(72), triad(65)]));
    class BrokenWorker {
      onmessage: ((e: unknown) => void) | null = null;
      onerror: ((e: { message: string }) => void) | null = null;
      constructor() {
        setTimeout(() => this.onerror?.({ message: 'falha ao carregar o módulo' }), 0);
      }
      postMessage() {}
      terminate() {}
    }
    vi.stubGlobal('Worker', BrokenWorker);
    const info = await analyzeKeyFromStems(stems());
    expect(info).toMatchObject({ value: null, origin: null });
  });
});
