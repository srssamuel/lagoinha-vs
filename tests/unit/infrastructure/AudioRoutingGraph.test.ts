import { describe, it, expect } from 'vitest';
import {
  applyStemRoutingGains,
  buildMasterRouting,
  connectClickToBus,
  connectTestTone,
  createStemChannelStrip,
  StemAudioNodes,
  stereoWidthFor
} from '../../../src/infrastructure/audio/AudioRoutingGraph';
import { MixerBusService } from '../../../src/application/services/MixerBusService';
import { RoutingMode } from '../../../src/domain/value-objects/AudioRouting';
import {
  createGraphAudioContext,
  FakeNode,
  finalInputsReachedFrom,
  gainOf,
  makeSong,
  FakeParam
} from './helpers/graphAudioContext';

const edgeTo = (from: FakeNode, to: FakeNode, output = 0, input = 0) =>
  from.edges.some((e) => e.dest === to && e.output === output && e.input === input);

function buildRoutedSong(mode: RoutingMode) {
  const g = createGraphAudioContext();
  const master = buildMasterRouting(g.ctx, 1);
  const song = makeSong(['click', 'guide', 'drums', 'keys']);
  const strips = new Map<string, StemAudioNodes>();
  song.stems.forEach((stem) => {
    strips.set(stem.id, createStemChannelStrip(g.ctx, stem, 0, master));
  });
  const apply = (m: RoutingMode) => {
    MixerBusService.evaluateAllStems(song.stems, m).forEach(({ stemId, gains }) => {
      const stem = song.stems.find((s) => s.id === stemId)!;
      applyStemRoutingGains(strips.get(stemId)!, gains, 0, stereoWidthFor(m, stem.type, stem.pan));
    });
  };
  apply(mode);
  return { g, master, song, strips, apply };
}

describe('AudioRoutingGraph — montagem da cadeia de roteamento/DSP', () => {
  it('barramento mestre: VS L/R -> master gain -> limiter -> analyser -> splitter -> saída 1/2 -> destination', () => {
    const g = createGraphAudioContext();
    const m = buildMasterRouting(g.ctx, 0.8);
    const node = (n: unknown) => n as unknown as FakeNode;

    expect(gainOf(node(m.masterGain))).toBe(0.8);
    expect(edgeTo(node(m.vsMerger), node(m.masterGain))).toBe(true);
    expect(edgeTo(node(m.masterGain), node(m.masterLimiter))).toBe(true);
    expect(edgeTo(node(m.masterLimiter), node(m.masterAnalyser))).toBe(true);
    expect(edgeTo(node(m.masterAnalyser), node(m.vsSplitter))).toBe(true);
    expect(edgeTo(node(m.vsSplitter), node(m.finalMerger), 0, 0)).toBe(true);
    expect(edgeTo(node(m.vsSplitter), node(m.finalMerger), 1, 1)).toBe(true);
    expect(edgeTo(node(m.finalMerger), g.destination)).toBe(true);

    // Limiter brickwall e analisador do RTA
    const limiter = node(m.masterLimiter);
    expect((limiter.threshold as FakeParam).value).toBe(-1);
    expect((limiter.ratio as FakeParam).value).toBe(20);
    expect((limiter.release as FakeParam).value).toBe(0.08);
    expect(m.masterAnalyser.fftSize).toBe(128);
    expect(m.masterFreqData).toHaveLength(64);

    // Merger final de 4 canais e splitter/merger do VS de 2
    expect(node(m.finalMerger).inputs).toBe(4);
    expect(node(m.vsMerger).inputs).toBe(2);
  });

  it('channel strip: ch1/2 entram no VS bus, ch3/ch4 vão direto às saídas 3 e 4 sem passar pelo limiter', () => {
    const g = createGraphAudioContext();
    const m = buildMasterRouting(g.ctx, 1);
    const stem = makeSong(['keys']).stems[0]!;
    const strip = createStemChannelStrip(g.ctx, stem, 0, m);
    const n = (x: unknown) => x as unknown as FakeNode;

    expect(edgeTo(n(strip.leftGain), n(m.vsMerger), 0, 0)).toBe(true);
    expect(edgeTo(n(strip.rightGain), n(m.vsMerger), 0, 1)).toBe(true);
    expect(edgeTo(n(strip.ch3Gain), n(m.finalMerger), 0, 2)).toBe(true);
    expect(edgeTo(n(strip.ch4Gain), n(m.finalMerger), 0, 3)).toBe(true);

    // Cadeia de inserts em ordem
    expect(edgeTo(n(strip.highPassFilter), n(strip.eqLow))).toBe(true);
    expect(edgeTo(n(strip.eqLow), n(strip.eqMid))).toBe(true);
    expect(edgeTo(n(strip.eqMid), n(strip.eqHigh))).toBe(true);
    expect(edgeTo(n(strip.eqHigh), n(strip.tubeSaturator))).toBe(true);
    expect(edgeTo(n(strip.tubeSaturator), n(strip.compressor))).toBe(true);
    expect(edgeTo(n(strip.compressor), n(strip.gainNode))).toBe(true);
    expect(edgeTo(n(strip.pitchShifter.output), n(strip.highPassFilter))).toBe(true);

    // Nada do stem toca as entradas 0/1 do merger final sem passar pelo VS bus
    const direct = [strip.gainNode, strip.leftGain, strip.rightGain].flatMap((x) =>
      n(x).edges.filter((e) => e.dest === n(m.finalMerger))
    );
    expect(direct).toHaveLength(0);
    expect(strip.source).toBeNull();
  });

  it('ganhos por canal são aplicados com os valores calculados por modo', () => {
    const g = createGraphAudioContext();
    const m = buildMasterRouting(g.ctx, 1);
    const stem = makeSong(['click']).stems[0]!;
    const strip = createStemChannelStrip(g.ctx, stem, 0, m);

    applyStemRoutingGains(strip, { ch1_vsL: 0.1, ch2_vsR: 0.2, ch3_click: 0.3, ch4_guide: 0.4, leftGain: 0, rightGain: 0 }, 0);
    expect([strip.leftGain, strip.rightGain, strip.ch3Gain, strip.ch4Gain].map((x) => x.gain.value)).toEqual([
      0.1, 0.2, 0.3, 0.4
    ]);
  });

  it('estéreo por stem: L e R do stem entram por uma matriz de largura antes de leftGain/rightGain', () => {
    const g = createGraphAudioContext();
    const m = buildMasterRouting(g.ctx, 1);
    const stem = makeSong(['keys']).stems[0]!;
    const strip = createStemChannelStrip(g.ctx, stem, 0, m);
    const n = (x: unknown) => x as unknown as FakeNode;

    expect(edgeTo(n(strip.gainNode), n(strip.stereoSplitter))).toBe(true);
    expect(edgeTo(n(strip.stereoSplitter), n(strip.lToLeft), 0)).toBe(true);
    expect(edgeTo(n(strip.stereoSplitter), n(strip.rToRight), 1)).toBe(true);
    expect(edgeTo(n(strip.stereoSplitter), n(strip.rToLeft), 1)).toBe(true);
    expect(edgeTo(n(strip.stereoSplitter), n(strip.lToRight), 0)).toBe(true);
    // O gainNode não liga mais direto em leftGain/rightGain (aquilo somava o stem em mono)
    expect(edgeTo(n(strip.gainNode), n(strip.leftGain))).toBe(false);
    expect(edgeTo(n(strip.gainNode), n(strip.rightGain))).toBe(false);
    expect(n(strip.gainNode).channelCount).toBe(2);
    expect(n(strip.gainNode).channelCountMode).toBe('explicit');

    const matrix = () => [strip.lToLeft, strip.rToLeft, strip.lToRight, strip.rToRight].map((x) => x.gain.value);
    const gains = { ch1_vsL: 1, ch2_vsR: 1, ch3_click: 0, ch4_guide: 0, leftGain: 1, rightGain: 1 };
    applyStemRoutingGains(strip, gains, 0, 1);
    expect(matrix()).toEqual([1, 0, 0, 1]);
    applyStemRoutingGains(strip, gains, 0, 0);
    expect(matrix()).toEqual([0.5, 0.5, 0.5, 0.5]); // igual ao downmix mono anterior
    applyStemRoutingGains(strip, gains, 0); // padrão = soma mono
    expect(matrix()).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it('largura estéreo por modo: split e click/guia em mono; modos estéreo fecham com o pan', () => {
    expect(stereoWidthFor('SPLIT_IEM_PA', 'keys', 0)).toBe(0);
    expect(stereoWidthFor('STEREO_FULL', 'click', 0)).toBe(0);
    expect(stereoWidthFor('MULTI_4CH_DISCRETE', 'guide', 0)).toBe(0);
    expect(stereoWidthFor('STEREO_FULL', 'keys', 0)).toBe(1);
    expect(stereoWidthFor('MULTI_4CH_DISCRETE', 'drums', 0)).toBe(1);
    expect(stereoWidthFor('STEREO_FULL', 'guitars', -0.25)).toBe(0.75);
    expect(stereoWidthFor('STEREO_FULL', 'guitars', 1)).toBe(0);
  });

  it('click procedural: SPLIT só no fone L; 4CH só na saída 3; Stereo Full em L e R', () => {
    const g = createGraphAudioContext();
    const m = buildMasterRouting(g.ctx, 1);
    const buses = { vsMerger: m.vsMerger, finalMerger: m.finalMerger, channelMerger: m.finalMerger };
    const gain = (mode: RoutingMode) => {
      const click = g.ctx.createGain();
      connectClickToBus(click, mode, buses);
      return click as unknown as FakeNode;
    };

    const split = gain('SPLIT_IEM_PA');
    expect(split.edges.map((e) => [e.dest, e.input])).toEqual([[m.vsMerger, 0]]);

    const discrete = gain('MULTI_4CH_DISCRETE');
    expect(discrete.edges.map((e) => [e.dest, e.input])).toEqual([[m.finalMerger, 2]]);

    const stereo = gain('STEREO_FULL' as RoutingMode);
    expect(stereo.edges.map((e) => e.input)).toEqual([0, 1]);
  });

  it('tom de teste: SPLIT manda click/guia (ch 3/4) ao fone L e o resto ao PA R; 4CH é discreto', () => {
    const g = createGraphAudioContext();
    const m = buildMasterRouting(g.ctx, 1);
    const route = (mode: RoutingMode, channel: number) => {
      const tone = g.ctx.createGain() as unknown as FakeNode;
      connectTestTone(tone as unknown as GainNode, mode, channel, m.finalMerger);
      return tone.edges.map((e) => e.input);
    };

    expect(route('SPLIT_IEM_PA', 2)).toEqual([0]);
    expect(route('SPLIT_IEM_PA', 3)).toEqual([0]);
    expect(route('SPLIT_IEM_PA', 0)).toEqual([1]);
    expect(route('MULTI_4CH_DISCRETE', 2)).toEqual([2]);
    expect(route('MULTI_4CH_DISCRETE', 3)).toEqual([3]);
  });

  describe('ROTEAMENTO: click e guia nunca chegam ao FOH (falha se vazar)', () => {
    it('SPLIT_IEM_PA: click e guia só alcançam o fone (entrada 0); a banda alcança o PA R (entrada 1)', () => {
      const { master, song, strips } = buildRoutedSong('SPLIT_IEM_PA');
      const final = master.finalMerger as unknown as FakeNode;
      const reach = (type: string) =>
        finalInputsReachedFrom(strips.get(song.stems.find((s) => s.type === type)!.id)!.gainNode as unknown as FakeNode, final);

      expect([...reach('click')]).toEqual([0]);
      expect([...reach('guide')]).toEqual([0]);
      // Controle positivo: o rastreador enxerga o PA quando há sinal para ele
      expect(reach('drums').has(1)).toBe(true);
      expect(reach('keys').has(1)).toBe(true);
    });

    it('MULTI_4CH_DISCRETE: click só na saída 3, guia só na 4, zero em 1/2 (FOH); a banda só em 1/2', () => {
      const { master, song, strips } = buildRoutedSong('MULTI_4CH_DISCRETE');
      const final = master.finalMerger as unknown as FakeNode;
      const reach = (type: string) =>
        finalInputsReachedFrom(strips.get(song.stems.find((s) => s.type === type)!.id)!.gainNode as unknown as FakeNode, final);

      expect([...reach('click')]).toEqual([2]);
      expect([...reach('guide')]).toEqual([3]);
      expect([...reach('drums')].sort()).toEqual([0, 1]);
      expect([...reach('keys')].sort()).toEqual([0, 1]);
    });

    it('trocar de modo ao vivo não abre rota para o FOH', () => {
      const { master, song, strips, apply } = buildRoutedSong('MULTI_4CH_DISCRETE');
      const final = master.finalMerger as unknown as FakeNode;
      const foh = (type: string) => {
        const reached = finalInputsReachedFrom(
          strips.get(song.stems.find((s) => s.type === type)!.id)!.gainNode as unknown as FakeNode,
          final
        );
        return reached.has(1) || (reached.has(0) && type !== 'click' && type !== 'guide' ? true : false);
      };

      apply('SPLIT_IEM_PA');
      expect(foh('click')).toBe(false);
      expect(foh('guide')).toBe(false);
      apply('MULTI_4CH_DISCRETE');
      expect(foh('click')).toBe(false);
      expect(foh('guide')).toBe(false);
    });

    it('o teste é capaz de falhar: com o ganho R do click aberto à mão o vazamento é detectado', () => {
      const { master, song, strips } = buildRoutedSong('SPLIT_IEM_PA');
      const final = master.finalMerger as unknown as FakeNode;
      const click = strips.get(song.stems.find((s) => s.type === 'click')!.id)!;

      click.rightGain.gain.value = 1; // sabotagem: abre a rota R do click
      expect(finalInputsReachedFrom(click.gainNode as unknown as FakeNode, final).has(1)).toBe(true);
    });
  });
});
