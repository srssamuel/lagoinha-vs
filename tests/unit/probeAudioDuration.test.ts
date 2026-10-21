import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeAudioDuration } from '../../src/infrastructure/audio/probeAudioDuration';

interface FakeAudio {
  preload: string;
  duration: number;
  src?: string;
  onloadedmetadata: (() => void) | null;
  onerror: (() => void) | null;
  removeAttribute: (name: string) => void;
}

function stubDom(behaviour: (el: FakeAudio) => void) {
  const revoked: string[] = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const el: FakeAudio = {
        preload: '',
        duration: 0,
        onloadedmetadata: null,
        onerror: null,
        removeAttribute: () => undefined
      };
      Object.defineProperty(el, 'src', {
        set: () => queueMicrotask(() => behaviour(el))
      });
      return el;
    }
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u) => void revoked.push(u));
  return revoked;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('probeAudioDuration', () => {
  it('sem DOM (Node) devolve 0 em vez de quebrar', async () => {
    await expect(probeAudioDuration(new Blob(['x']))).resolves.toBe(0);
  });

  it('lê a duração dos metadados e libera a URL do blob', async () => {
    const revoked = stubDom((el) => {
      el.duration = 213.4;
      el.onloadedmetadata?.();
    });
    await expect(probeAudioDuration(new Blob(['x']))).resolves.toBe(213.4);
    expect(revoked).toEqual(['blob:fake']);
  });

  it('arquivo ilegível ou duração infinita viram 0 (desconhecida)', async () => {
    stubDom((el) => el.onerror?.());
    await expect(probeAudioDuration(new Blob(['x']))).resolves.toBe(0);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    stubDom((el) => {
      el.duration = Infinity;
      el.onloadedmetadata?.();
    });
    await expect(probeAudioDuration(new Blob(['x']))).resolves.toBe(0);
  });

  it('sem resposta dentro do prazo desiste com 0', async () => {
    vi.useFakeTimers();
    stubDom(() => undefined);
    const pending = probeAudioDuration(new Blob(['x']), 500);
    await vi.advanceTimersByTimeAsync(600);
    await expect(pending).resolves.toBe(0);
  });
});
