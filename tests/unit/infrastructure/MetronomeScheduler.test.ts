import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLICK_STRIP_LATENCY_SEC, MetronomeHost, MetronomeScheduler } from '../../../src/infrastructure/audio/MetronomeScheduler';
import { PITCH_PATH_LATENCY_SEC } from '../../../src/infrastructure/audio/PitchShifterDspNode';
import { buildMasterRouting, MasterRouting } from '../../../src/infrastructure/audio/AudioRoutingGraph';
import { RoutingMode } from '../../../src/domain/value-objects/AudioRouting';
import {
  createGraphAudioContext,
  FakeNode,
  finalInputsReachedFrom,
  GraphAudioContext,
  makeSong
} from './helpers/graphAudioContext';

// Song 120 BPM, 4/4 => 0,5 s por tempo. Buffers: acento 0,045 s (1984 amostras), regular 0,030 s (1323).
const ACCENT_LEN = 1984;
const REGULAR_LEN = 1323;

describe('MetronomeScheduler — metrônomo procedural e contagem prévia', () => {
  let g: GraphAudioContext;
  let master: MasterRouting;
  let playing: boolean;
  let mode: RoutingMode;
  let playbackTime: number;
  let host: MetronomeHost & { notifyState: ReturnType<typeof vi.fn> };
  let scheduler: MetronomeScheduler;

  const clickSources = () => g.nodes.filter((n) => n.kind === 'bufferSource');
  // Tempos de início já descontada a latência constante dos stems (PITCH_PATH_LATENCY_SEC), que o click soma.
  const rawStartTimes = () =>
    clickSources().flatMap((n) => (n.start as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as number));
  const startTimes = () => rawStartTimes().map((t) => Math.round((t - PITCH_PATH_LATENCY_SEC - CLICK_STRIP_LATENCY_SEC) * 1e9) / 1e9);
  const lengths = () => clickSources().map((n) => (n.buffer as { length: number }).length);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) });

    g = createGraphAudioContext();
    master = buildMasterRouting(g.ctx, 1);
    playing = true;
    mode = 'SPLIT_IEM_PA';
    playbackTime = 0;
    const song = makeSong(['click', 'guide', 'drums']);

    host = {
      getCtx: () => g.ctx,
      getSong: () => song,
      getRoutingMode: () => mode,
      getBuses: () => ({ vsMerger: master.vsMerger, finalMerger: master.finalMerger, channelMerger: master.finalMerger }),
      isPlaying: () => playing,
      getPlaybackTime: () => playbackTime,
      notifyState: vi.fn()
    };
    scheduler = new MetronomeScheduler(host);
    scheduler.prepare(g.ctx);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('agenda no relógio do AudioContext com lookahead de 150 ms, não no do setTimeout', () => {
    scheduler.start();
    expect(scheduler.isRunning).toBe(true);
    // Primeiro tempo em 0,5 s; fora da janela de 150 ms a partir de t=0
    expect(startTimes()).toEqual([]);

    // O timer rodando sem o relógio de áudio avançar não agenda nada
    vi.advanceTimersByTime(2000);
    expect(startTimes()).toEqual([]);

    g.setTime(0.4); // 0,4 + 0,15 > 0,5 => entra na janela
    vi.advanceTimersByTime(30);
    expect(startTimes()).toEqual([0.5]);
    expect(lengths()).toEqual([ACCENT_LEN]); // tempo 1 do compasso => acento

    g.setTime(0.9);
    vi.advanceTimersByTime(30);
    g.setTime(1.4);
    vi.advanceTimersByTime(30);
    expect(startTimes()).toEqual([0.5, 1.0, 1.5]);
    expect(lengths()).toEqual([ACCENT_LEN, REGULAR_LEN, REGULAR_LEN]);
  });

  it('soma ao click a latência constante que os stems têm no PitchShifter (click no tempo da banda)', () => {
    scheduler.start();
    g.setTime(0.4);
    vi.advanceTimersByTime(30);
    expect(rawStartTimes()).toHaveLength(1);
    expect(rawStartTimes()[0]).toBeCloseTo(0.5 + PITCH_PATH_LATENCY_SEC + CLICK_STRIP_LATENCY_SEC, 9);
    expect(PITCH_PATH_LATENCY_SEC).toBeGreaterThan(0);
  });

  it('retoma o compasso certo a partir do ponto de reprodução', () => {
    playbackTime = 1.25; // 2,5 tempos: dentro do 3º tempo do compasso; próximo click em 1,5 s
    g.setTime(10);
    scheduler.start();
    // nextClickTime = 10 + (0,5 - 0,25) = 10,25: ainda fora da janela de 150 ms a partir de 10
    expect(startTimes()).toEqual([]);
    g.setTime(10.2);
    vi.advanceTimersByTime(30);
    expect(startTimes()[0]).toBeCloseTo(10.25, 6);
    // beatInBar inicial = floor(1,25/0,5) % 4 + 1 = 3 => regular
    expect(lengths()[0]).toBe(REGULAR_LEN);
  });

  it('stop() encerra o laço e para de reabastecer a janela', () => {
    g.setTime(0.4);
    scheduler.start();
    scheduler.stop();
    expect(scheduler.isRunning).toBe(false);
    const before = startTimes().length;
    g.setTime(5);
    vi.advanceTimersByTime(500);
    expect(startTimes()).toHaveLength(before);
  });

  it('não agenda nada quando o transporte parou', () => {
    g.setTime(0.4);
    playing = false;
    scheduler.start();
    vi.advanceTimersByTime(100);
    expect(startTimes()).toEqual([]);
  });

  it('o click procedural respeita o volume do stem de click (mudo => ganho 0)', () => {
    const song = host.getSong()!;
    const clickStem = song.stems.find((s) => s.type === 'click')!;
    const gainsFor = () => {
      const before = g.nodes.length;
      scheduler.scheduleClick(1, false);
      const created = g.nodesSince(before).find((n) => n.kind === 'gain')!;
      return (created.gain as { value: number }).value;
    };

    clickStem.volume = 0.7;
    expect(gainsFor()).toBe(0.7);
    clickStem.isMuted = true;
    expect(gainsFor()).toBe(0);
  });

  describe('ROTEAMENTO do click procedural: nunca no FOH', () => {
    const traceClick = (m: RoutingMode) => {
      mode = m;
      const before = g.nodes.length;
      scheduler.scheduleClick(1, true);
      const clickGain = g.nodesSince(before).find((n) => n.kind === 'gain') as FakeNode;
      return finalInputsReachedFrom(clickGain, master.finalMerger as unknown as FakeNode);
    };

    it('SPLIT_IEM_PA: só o fone L (saída 1); a entrada R do PA (saída 2) não recebe', () => {
      const reached = traceClick('SPLIT_IEM_PA');
      expect([...reached]).toEqual([0]);
      expect(reached.has(1)).toBe(false);
    });

    it('MULTI_4CH_DISCRETE: só a saída 3; nada nas saídas 1/2 do FOH', () => {
      const reached = traceClick('MULTI_4CH_DISCRETE');
      expect([...reached]).toEqual([2]);
    });

    it('o teste é capaz de falhar: se o roteamento ligasse o click à entrada 1, seria detectado', () => {
      mode = 'SPLIT_IEM_PA';
      const before = g.nodes.length;
      scheduler.scheduleClick(1, true);
      const clickGain = g.nodesSince(before).find((n) => n.kind === 'gain') as FakeNode;
      (clickGain as unknown as GainNode).connect(master.vsMerger, 0, 1); // sabotagem
      expect(finalInputsReachedFrom(clickGain, master.finalMerger as unknown as FakeNode).has(1)).toBe(true);
    });
  });

  describe('clicks já agendados (lookahead de ~170 ms): religar e cancelar', () => {
    const schedule = () => {
      const before = g.nodes.length;
      scheduler.scheduleClick(1, true);
      const created = g.nodesSince(before);
      return {
        source: created.find((n) => n.kind === 'bufferSource') as FakeNode,
        gain: created.find((n) => n.kind === 'gain') as FakeNode
      };
    };
    const reach = (gain: FakeNode) => [...finalInputsReachedFrom(gain, master.finalMerger as unknown as FakeNode)];

    it.each<[RoutingMode, RoutingMode, number[]]>([
      ['STEREO_FULL', 'SPLIT_IEM_PA', [0]],
      ['STEREO_FULL', 'MULTI_4CH_DISCRETE', [2]],
      ['SPLIT_IEM_PA', 'STEREO_FULL', [0, 1]],
      ['MULTI_4CH_DISCRETE', 'SPLIT_IEM_PA', [0]]
    ])('click agendado em %s e modo trocado para %s: alcança só %j', (from, to, expected) => {
      mode = from;
      const { gain } = schedule();
      mode = to;
      scheduler.rerouteScheduled();
      expect(reach(gain)).toEqual(expected);
    });

    it('Stereo -> Split SEM religar o pendente alcançaria o FOH (o teste enxerga o vazamento)', () => {
      mode = 'STEREO_FULL';
      const { gain } = schedule();
      mode = 'SPLIT_IEM_PA';
      expect(reach(gain)).toContain(1);
      scheduler.rerouteScheduled();
      expect(reach(gain)).not.toContain(1);
    });

    it('um click que já terminou não é religado', () => {
      mode = 'STEREO_FULL';
      const { gain } = schedule(); // toca em 1,0 + latências, dura ~45 ms
      g.setTime(2);
      mode = 'SPLIT_IEM_PA';
      scheduler.rerouteScheduled();
      expect(reach(gain)).toEqual([0, 1]);
    });

    it('stop() para e desconecta os pendentes', () => {
      const { source, gain } = schedule();
      scheduler.stop();
      expect(source.stop as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
      expect(source.edges).toEqual([]);
      expect(gain.edges).toEqual([]);
      expect(reach(gain)).toEqual([]);
    });

    it('cancelCountIn() para e desconecta os clicks da contagem', () => {
      scheduler.setCountInBars(1);
      scheduler.startCountIn(vi.fn());
      const source = clickSources()[0]!;
      scheduler.cancelCountIn();
      expect(source.stop as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
      expect(source.edges).toEqual([]);
    });

    it('cancelPending() é idempotente e tolera stop() que lança (fonte já parada)', () => {
      const { source } = schedule();
      (source.stop as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('InvalidStateError');
      });
      expect(() => {
        scheduler.cancelPending();
        scheduler.cancelPending();
      }).not.toThrow();
      expect(source.edges).toEqual([]);
    });
  });

  describe('margem de partida (when comum dos stems)', () => {
    it('com 50 ms de margem, a grade do click parte do instante de partida, não de agora', () => {
      // play em t=10: stems em 10,05 (posição 0); getPlaybackTime = -0,05 até a partida
      g.setTime(10);
      playbackTime = -0.05;
      host.getTransportLeadSec = () => 0.05;
      scheduler.start();
      g.setTime(10.45);
      vi.advanceTimersByTime(30);
      // 1º click = when + 1 tempo (0,5 s) = 10,55; sem tratar a margem sairia em 10,50
      expect(startTimes()[0]).toBeCloseTo(10.55, 9);
    });

    it('retomando em 30 s (tempo cheio): 1º click em when + 0,5 s', () => {
      g.setTime(10);
      playbackTime = 29.95;
      host.getTransportLeadSec = () => 0.05;
      scheduler.start();
      g.setTime(10.45);
      vi.advanceTimersByTime(30);
      expect(startTimes()[0]).toBeCloseTo(10.55, 9);
    });
  });

  describe('contagem prévia (count-in)', () => {
    it('limita a 0..2 compassos', () => {
      scheduler.setCountInBars(5);
      expect(scheduler.countInBars).toBe(2);
      scheduler.setCountInBars(-1);
      expect(scheduler.countInBars).toBe(0);
      scheduler.setCountInBars(1.4);
      expect(scheduler.countInBars).toBe(1);
    });

    it('1 compasso em 4/4: 4 clicks (acento só no 1º), um por tempo, depois chama onComplete', () => {
      scheduler.setCountInBars(1);
      const onComplete = vi.fn();
      scheduler.startCountIn(onComplete);

      expect(scheduler.isCountingIn).toBe(true);
      expect(scheduler.countInBeat).toBe(1);
      expect(clickSources()).toHaveLength(1);

      vi.advanceTimersByTime(500);
      expect(scheduler.countInBeat).toBe(2);
      vi.advanceTimersByTime(1000);
      expect(scheduler.countInBeat).toBe(4);
      expect(clickSources()).toHaveLength(4);
      expect(lengths()).toEqual([ACCENT_LEN, REGULAR_LEN, REGULAR_LEN, REGULAR_LEN]);
      expect(onComplete).not.toHaveBeenCalled();
      expect(host.notifyState).toHaveBeenCalledTimes(4);

      vi.advanceTimersByTime(500);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(scheduler.isCountingIn).toBe(false);
    });

    it('2 compassos: 8 clicks, com acento no 1º tempo de cada compasso', () => {
      scheduler.setCountInBars(2);
      scheduler.startCountIn(vi.fn());
      vi.advanceTimersByTime(3500);
      expect(lengths()).toEqual([
        ACCENT_LEN, REGULAR_LEN, REGULAR_LEN, REGULAR_LEN,
        ACCENT_LEN, REGULAR_LEN, REGULAR_LEN, REGULAR_LEN
      ]);
    });

    it('cancelCountIn aborta sem chamar onComplete', () => {
      scheduler.setCountInBars(1);
      const onComplete = vi.fn();
      scheduler.startCountIn(onComplete);
      scheduler.cancelCountIn();
      vi.advanceTimersByTime(5000);

      expect(onComplete).not.toHaveBeenCalled();
      expect(scheduler.isCountingIn).toBe(false);
      expect(clickSources()).toHaveLength(1);
    });

    it('se o transporte parou durante a contagem, não inicia a música', () => {
      scheduler.setCountInBars(1);
      const onComplete = vi.fn();
      scheduler.startCountIn(onComplete);
      playing = false;
      vi.advanceTimersByTime(5000);
      expect(onComplete).not.toHaveBeenCalled();
    });
  });
});
