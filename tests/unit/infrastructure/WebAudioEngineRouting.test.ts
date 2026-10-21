import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebAudioEngine } from '../../../src/infrastructure/audio/WebAudioEngine';
import type { StemAudioNodes } from '../../../src/infrastructure/audio/AudioRoutingGraph';
import { RoutingMode } from '../../../src/domain/value-objects/AudioRouting';
import {
  createGraphAudioContext,
  FakeNode,
  finalInputsReachedFrom,
  GraphAudioContext,
  makeSong
} from './helpers/graphAudioContext';

/**
 * Teste de ponta a ponta do motor real (módulos extraídos ligados): o grafo gravado prova que
 * click e guia não chegam ao FOH no Split nem no 4CH, nem pelos stems nem pelo metrônomo procedural.
 */
describe('WebAudioEngine — roteamento IEM/PA com módulos extraídos', () => {
  let g: GraphAudioContext;
  let engine: WebAudioEngine;

  const finalMerger = () => g.nodes.find((n) => n.kind === 'merger' && n.inputs === 4) as FakeNode;
  const strips = () =>
    (engine as unknown as { stemNodes: Map<string, StemAudioNodes> }).stemNodes;

  beforeEach(() => {
    vi.useFakeTimers();
    g = createGraphAudioContext();
    const AudioContextMock = vi.fn().mockImplementation(() => g.ctx);
    vi.stubGlobal('window', {
      AudioContext: AudioContextMock,
      webkitAudioContext: AudioContextMock,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id)
    });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi.fn(async () => []),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    engine = new WebAudioEngine();
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const reachByType = (song: ReturnType<typeof makeSong>, type: string) => {
    const stem = song.stems.find((s) => s.type === type)!;
    return finalInputsReachedFrom(strips().get(stem.id)!.gainNode as unknown as FakeNode, finalMerger());
  };

  it.each<[RoutingMode, number[], number[]]>([
    ['SPLIT_IEM_PA', [0], [0]],
    ['MULTI_4CH_DISCRETE', [2], [3]]
  ])('%s: click -> %j, guia -> %j e nenhum dos dois no FOH', async (mode, clickOut, guideOut) => {
    const song = makeSong(['click', 'guide', 'drums', 'keys']);
    await engine.loadSong(song);
    engine.setRoutingMode(mode);

    expect([...reachByType(song, 'click')]).toEqual(clickOut);
    expect([...reachByType(song, 'guide')]).toEqual(guideOut);
    // Controle positivo: a banda chega ao PA, então o rastreador enxerga o FOH
    expect(reachByType(song, 'drums').has(1)).toBe(true);
  });

  it('o play() com metrônomo procedural liga o click só ao fone (Split) ou à saída 3 (4CH)', async () => {
    for (const [mode, expected] of [
      ['SPLIT_IEM_PA', [0]],
      ['MULTI_4CH_DISCRETE', [2]]
    ] as const) {
      g = createGraphAudioContext();
      const AudioContextMock = vi.fn().mockImplementation(() => g.ctx);
      vi.stubGlobal('window', {
        AudioContext: AudioContextMock,
        webkitAudioContext: AudioContextMock,
        setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
        clearTimeout: (id: number) => clearTimeout(id)
      });
      engine = new WebAudioEngine();

      // Sem audioUrl no stem de click => metrônomo procedural assume
      await engine.loadSong(makeSong(['click', 'drums']));
      engine.setRoutingMode(mode);
      engine.play();
      expect(engine.getState().isPlaying).toBe(true);

      const before = g.nodes.length;
      g.setTime(0.4); // primeiro tempo em 0,5 s entra na janela de 150 ms
      vi.advanceTimersByTime(30);

      const clickGains = g.nodesSince(before).filter((n) => n.kind === 'gain');
      expect(clickGains.length).toBeGreaterThan(0);
      for (const gain of clickGains) {
        expect([...finalInputsReachedFrom(gain, finalMerger())]).toEqual(expected);
      }
      engine.stop();
    }
  });

  it('contagem prévia: toca a música só depois dos tempos da contagem', async () => {
    await engine.loadSong(makeSong(['click', 'drums']));
    engine.setCountInBars(1);
    expect(engine.getState().countInBars).toBe(1);

    engine.play();
    let state = engine.getState();
    expect(state.isPlaying).toBe(true);
    expect(state.isCountingIn).toBe(true);
    expect(state.countInBeat).toBe(1);

    vi.advanceTimersByTime(1500);
    expect(engine.getState().countInBeat).toBe(4);
    expect(engine.getState().isCountingIn).toBe(true);

    vi.advanceTimersByTime(500);
    state = engine.getState();
    expect(state.isCountingIn).toBe(false);
    expect(state.isPlaying).toBe(true);

    // pausar durante a contagem cancela o início da música
    engine.stop();
    engine.play();
    expect(engine.getState().isCountingIn).toBe(true);
    engine.pause();
    vi.advanceTimersByTime(5000);
    expect(engine.getState().isCountingIn).toBe(false);
    expect(engine.getState().isPlaying).toBe(false);
  });
});
