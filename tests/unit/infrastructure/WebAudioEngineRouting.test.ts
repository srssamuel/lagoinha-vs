import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebAudioEngine } from '../../../src/infrastructure/audio/WebAudioEngine';
import { CLICK_STRIP_LATENCY_SEC, TRANSPORT_START_MARGIN_S } from '../../../src/infrastructure/audio/MetronomeScheduler';
import { PITCH_PATH_LATENCY_SEC } from '../../../src/infrastructure/audio/PitchShifterDspNode';
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
      g.setTime(0.5); // música parte em 0,05 s (when comum): 1º tempo em 0,55 s entra na janela de 150 ms
      vi.advanceTimersByTime(30);

      const clickGains = g.nodesSince(before).filter((n) => n.kind === 'gain');
      expect(clickGains.length).toBeGreaterThan(0);
      for (const gain of clickGains) {
        expect([...finalInputsReachedFrom(gain, finalMerger())]).toEqual(expected);
      }
      engine.stop();
    }
  });

  describe('clicks procedurais já agendados (lookahead) e o destino', () => {
    const bufferSources = () => g.nodes.filter((n) => n.kind === 'bufferSource');
    const startMock = (n: FakeNode) => n.start as ReturnType<typeof vi.fn>;
    const playUntilClickScheduled = async (mode: RoutingMode) => {
      await engine.loadSong(makeSong(['click', 'drums']));
      engine.setRoutingMode(mode);
      engine.play();
      // Tempo 1 em when (0,05 s) já entra na janela de 150 ms; o relógio fica antes dele (click ainda pendente)
      const clicks = bufferSources();
      expect(clicks.length).toBeGreaterThan(0);
      return clicks;
    };
    const clickGainOf = (src: FakeNode) => {
      // o ganho do click é o nó 'gain' criado logo depois da fonte
      return g.nodes[g.nodes.indexOf(src) + 1] as FakeNode;
    };

    it('Stereo -> Split com o click já agendado: o click só alcança o fone (L), nunca o FOH (R)', async () => {
      const clicks = await playUntilClickScheduled('STEREO_FULL');
      const before = [...finalInputsReachedFrom(clickGainOf(clicks[0]!), finalMerger())];
      expect(before).toEqual([0, 1]); // controle: em Stereo o click está nos dois canais

      engine.setRoutingMode('SPLIT_IEM_PA');
      for (const src of clicks) {
        expect([...finalInputsReachedFrom(clickGainOf(src), finalMerger())]).toEqual([0]);
      }
      // e os próximos agendados nascem no destino novo
      g.setTime(1.0);
      vi.advanceTimersByTime(30);
      for (const src of bufferSources()) {
        expect(finalInputsReachedFrom(clickGainOf(src), finalMerger()).has(1)).toBe(false);
      }
    });

    it('Stereo -> 4CH com o click agendado: só a saída 3', async () => {
      const clicks = await playUntilClickScheduled('STEREO_FULL');
      engine.setRoutingMode('MULTI_4CH_DISCRETE');
      for (const src of clicks) {
        expect([...finalInputsReachedFrom(clickGainOf(src), finalMerger())]).toEqual([2]);
      }
    });

    it.each(['pause', 'stop', 'seek'] as const)('%s() para e desconecta os clicks já agendados', async (action) => {
      const clicks = await playUntilClickScheduled('SPLIT_IEM_PA');
      const gains = clicks.map(clickGainOf);
      if (action === 'seek') engine.seek(20);
      else engine[action]();
      for (const src of clicks) {
        expect(startMock(src)).toHaveBeenCalledTimes(1);
        expect(src.stop as ReturnType<typeof vi.fn>).toHaveBeenCalled();
        expect(src.edges).toEqual([]);
      }
      for (const gain of gains) expect(gain.edges).toEqual([]);
    });

    it('cancelar a contagem prévia (pause) para os clicks da contagem', async () => {
      await engine.loadSong(makeSong(['click', 'drums']));
      engine.setCountInBars(1);
      engine.play();
      const clicks = bufferSources();
      expect(clicks).toHaveLength(1);
      engine.pause();
      expect(clicks[0]!.stop as ReturnType<typeof vi.fn>).toHaveBeenCalled();
      expect(clicks[0]!.edges).toEqual([]);
    });
  });

  describe('when comum de partida dos stems', () => {
    const withBuffers = (song: ReturnType<typeof makeSong>) => {
      for (const stem of song.stems) stem.audioBuffer = { duration: 60 } as AudioBuffer;
      return song;
    };
    const stemStarts = (song: ReturnType<typeof makeSong>) => {
      const buffers = new Set(song.stems.map((s) => s.audioBuffer));
      return g.nodes
        .filter((n) => n.kind === 'bufferSource' && buffers.has(n.buffer as AudioBuffer))
        .map((n) => (n.start as ReturnType<typeof vi.fn>).mock.calls[0] as [number, number]);
    };

    it('play: todos os start() recebem o mesmo when (agora + margem) e a mesma posição', async () => {
      const song = withBuffers(makeSong(['click', 'guide', 'drums', 'keys', 'bass']));
      await engine.loadSong(song);
      g.setTime(3);
      engine.play();
      const starts = stemStarts(song);
      expect(starts).toHaveLength(5);
      for (const [when, offset] of starts) {
        expect(when).toBeCloseTo(3 + TRANSPORT_START_MARGIN_S, 9);
        expect(offset).toBe(0);
      }
      expect(new Set(starts.map((s) => s[0])).size).toBe(1);
      // o relógio da música não fica negativo antes de a partida acontecer
      expect(engine.getState().currentTime).toBe(0);
    });

    it('retomada e seek: when comum com a posição de retomada/seek', async () => {
      const song = withBuffers(makeSong(['click', 'drums', 'keys']));
      await engine.loadSong(song);
      g.setTime(3);
      engine.play();
      g.setTime(5.05); // 2 s de música
      engine.pause();
      expect(engine.getState().currentTime).toBeCloseTo(2, 6);
      const n = stemStarts(song).length;

      g.setTime(6);
      engine.play();
      const resumed = stemStarts(song).slice(n);
      expect(resumed).toHaveLength(3);
      for (const [when, offset] of resumed) {
        expect(when).toBeCloseTo(6 + TRANSPORT_START_MARGIN_S, 9);
        expect(offset).toBeCloseTo(2, 6);
      }

      g.setTime(7);
      engine.seek(20);
      const sought = stemStarts(song).slice(n + 3);
      expect(sought).toHaveLength(3);
      for (const [when, offset] of sought) {
        expect(when).toBeCloseTo(7 + TRANSPORT_START_MARGIN_S, 9);
        expect(offset).toBe(20);
      }
    });

    it('o click procedural parte do mesmo when: tempo 1 em when (+ latências dos stems)', async () => {
      await engine.loadSong(makeSong(['click', 'drums']));
      g.setTime(3);
      engine.play();
      const first = g.nodes.find((n) => n.kind === 'bufferSource')!;
      const at = (first.start as ReturnType<typeof vi.fn>).mock.calls[0]![0] as number;
      expect(at).toBeCloseTo(3 + TRANSPORT_START_MARGIN_S + PITCH_PATH_LATENCY_SEC + CLICK_STRIP_LATENCY_SEC, 9);
    });
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
