import { describe, expect, it, vi } from 'vitest';
import {
  PITCH_PATH_LATENCY_SEC,
  PitchShifterDspNode
} from '../../../src/infrastructure/audio/PitchShifterDspNode';
import { createTimelineContext, SAMPLE_RATE, TimelineParam } from './helpers/timelineParam';

/**
 * Regressão do relato de palco "ao trocar o tom fica dando um click".
 * O AudioParam falso (helpers/timelineParam) AVALIA a linha do tempo de automação no relógio do
 * AudioContext, então dá para medir o maior salto entre duas amostras consecutivas: degrau 0 -> 1 = clique;
 * rampa de 30ms = ~0.0008 por amostra. A prova no áudio renderizado de verdade (Chromium) está em
 * scripts/audio-render/render-alignment.mjs.
 */

interface Internals {
  dryGain: { gain: TimelineParam };
  wetGain: { gain: TimelineParam };
  dryDelay: { delayTime: TimelineParam };
  delayA: { delayTime: TimelineParam };
  delayB: { delayTime: TimelineParam };
  modGainA: { gain: TimelineParam };
  sawShaperA: { curve: Float32Array };
  sawShaperB: { curve: Float32Array };
}

const internals = (n: PitchShifterDspNode) => n as unknown as Internals;
/** Comandos agendam a partir de agora + antecedência (nunca no passado do thread de áudio). */
const LEAD = PitchShifterDspNode.commandLeadSec;

/** Ganho do caminho por onde a amostra do delay A passa (delay = base + profundidade * serra). */
const delayDepthAt = (n: Internals, t: number) => [n.delayA.delayTime.valueAt(t), n.modGainA.gain.valueAt(t)];

describe('PitchShifterDspNode — troca de tom sem clique', () => {
  it('rampeia dry/wet no relógio do AudioContext ao sair do tom original (0 -> +2)', () => {
    const { ctx, setTime } = createTimelineContext();
    const shifter = new PitchShifterDspNode(ctx, true);
    const n = internals(shifter);
    setTime(10);
    shifter.setSemitones(2);

    expect(n.wetGain.gain.valueAt(10 + LEAD)).toBeCloseTo(0, 6);
    expect(n.wetGain.gain.valueAt(10 + LEAD + PitchShifterDspNode.crossfadeSec)).toBeCloseTo(1, 6);
    expect(n.dryGain.gain.valueAt(10 + LEAD + PitchShifterDspNode.crossfadeSec)).toBeCloseTo(0, 6);
    // Degrau (clique) teria salto 1.0 entre duas amostras
    expect(n.wetGain.gain.maxStep(9.99, 10.1)).toBeLessThan(0.01);
    expect(n.dryGain.gain.maxStep(9.99, 10.1)).toBeLessThan(0.01);
  });

  it('volta ao tom original (+2 -> 0) com rampa, sem degrau', () => {
    const { ctx, setTime } = createTimelineContext();
    const shifter = new PitchShifterDspNode(ctx, true);
    const n = internals(shifter);
    setTime(1);
    shifter.setSemitones(2);
    setTime(5);
    shifter.setSemitones(0);
    expect(n.dryGain.gain.valueAt(5.2)).toBeCloseTo(1, 6);
    expect(n.wetGain.gain.valueAt(5.2)).toBeCloseTo(0, 6);
    expect(n.wetGain.gain.maxStep(4.99, 5.2)).toBeLessThan(0.01);
    expect(n.dryGain.gain.maxStep(4.99, 5.2)).toBeLessThan(0.01);
  });

  it('inverte o sentido (+2 -> -2) só com o wet em silêncio e sem trocar as curvas de serra', () => {
    const { ctx, setTime } = createTimelineContext();
    const shifter = new PitchShifterDspNode(ctx, true);
    const n = internals(shifter);
    setTime(1);
    shifter.setSemitones(2);
    const curveA = n.sawShaperA.curve;
    const curveB = n.sawShaperB.curve;
    const [baseUp, depthUp] = delayDepthAt(n, 2);

    setTime(20);
    shifter.setSemitones(-2);

    // Curvas não são trocadas com áudio passando (era o salto de delay d -> 48ms - d)
    expect(n.sawShaperA.curve).toBe(curveA);
    expect(n.sawShaperB.curve).toBe(curveB);

    // Direção do delay muda, mas em todo instante em que ela difere da anterior o wet está em 0
    const [baseDown, depthDown] = delayDepthAt(n, 21);
    expect([baseDown, depthDown]).not.toEqual([baseUp, depthUp]);
    let swapAt = -1;
    for (let t = 19.99; t <= 20.2; t += 1 / SAMPLE_RATE) {
      const [b, d] = delayDepthAt(n, t);
      if (b !== baseUp || d !== depthUp) {
        swapAt = t;
        break;
      }
    }
    expect(swapAt).toBeGreaterThan(20);
    expect(n.wetGain.gain.valueAt(swapAt)).toBeLessThan(1e-3);
    expect(n.wetGain.gain.valueAt(20 + LEAD + PitchShifterDspNode.crossfadeSec)).toBeCloseTo(0, 6);
    expect(n.wetGain.gain.valueAt(20.2)).toBeCloseTo(1, 6);
    expect(n.wetGain.gain.maxStep(19.99, 20.2)).toBeLessThan(0.01);
    expect(n.dryGain.gain.maxStep(19.99, 20.2)).toBeLessThan(0.01);
  });

  /** Em todo instante em que a direção do delay muda, o wet precisa estar em silêncio. */
  const expectSwapsOnlyInSilence = (n: Internals, from: number, to: number) => {
    let [prevBase, prevDepth] = delayDepthAt(n, from);
    for (let t = from; t <= to; t += 1 / SAMPLE_RATE) {
      const [b, d] = delayDepthAt(n, t);
      if (b !== prevBase || d !== prevDepth) expect(n.wetGain.gain.valueAt(t)).toBeLessThan(1e-3);
      prevBase = b;
      prevDepth = d;
    }
  };

  it.each([
    ['volta a +2', 2],
    ['volta ao original', 0]
  ])('troca rápida +2 -> -2 e %s dentro do crossfade não troca a direção com o wet audível', (_label, last) => {
    const { ctx, setTime } = createTimelineContext();
    const shifter = new PitchShifterDspNode(ctx, true);
    const n = internals(shifter);
    setTime(1);
    shifter.setSemitones(2);
    setTime(20);
    shifter.setSemitones(-2);
    setTime(20.015);
    shifter.setSemitones(last);
    expectSwapsOnlyInSilence(n, 19.99, 20.3);
    expect(n.wetGain.gain.maxStep(19.99, 20.3)).toBeLessThan(0.01);
    expect(n.dryGain.gain.maxStep(19.99, 20.3)).toBeLessThan(0.01);
  });

  it('rajada de 7 comandos em 30 ms: ganhos contínuos (sem degrau nem pico) e estado final == último comando', () => {
    const { ctx, setTime } = createTimelineContext();
    const shifter = new PitchShifterDspNode(ctx, true);
    const n = internals(shifter);
    const burst: Array<[number, number]> = [
      [0, 2], [0.005, 3], [0.01, -2], [0.015, -3], [0.02, 2], [0.025, 0], [0.03, 2]
    ];
    for (const [dt, st] of burst) {
      setTime(20 + dt);
      shifter.setSemitones(st);
    }
    expectSwapsOnlyInSilence(n, 19.99, 20.6);
    // Degrau/pico de uma amostra teria salto de dezenas de vezes o de uma rampa de 30 ms (0,0008)
    expect(n.wetGain.gain.maxStep(19.99, 20.6)).toBeLessThan(0.01);
    expect(n.dryGain.gain.maxStep(19.99, 20.6)).toBeLessThan(0.01);
    // Último comando = +2: wet cheio, dry zerado, e dry + wet nunca passam de 1 (sem soma > 1 = sem pico de nível)
    expect(n.wetGain.gain.valueAt(20.6)).toBeCloseTo(1, 6);
    expect(n.dryGain.gain.valueAt(20.6)).toBeCloseTo(0, 6);
    for (let t = 19.99; t <= 20.6; t += 1 / SAMPLE_RATE) {
      const sum = n.wetGain.gain.valueAt(t) + n.dryGain.gain.valueAt(t);
      expect(sum).toBeLessThan(1.05);
      expect(sum).toBeGreaterThan(0.2);
    }
    const [base, depth] = delayDepthAt(n, 20.6);
    expect(base).toBeCloseTo(0.048, 9); // +2 = subir: delay decrescente
    expect(depth).toBeCloseTo(-0.048, 9);
  });

  it('rajada +2,-2,+2 em <30 ms: a segunda inversão volta ao sentido em vigor sem mergulhar para o dry', () => {
    const { ctx, setTime } = createTimelineContext();
    const shifter = new PitchShifterDspNode(ctx, true);
    const n = internals(shifter);
    setTime(1);
    shifter.setSemitones(2);
    for (const [dt, st] of [[0, -2], [0.015, 2]] as const) {
      setTime(20 + dt);
      shifter.setSemitones(st);
    }
    let wetMin = 1;
    for (let t = 19.99; t <= 20.4; t += 1 / SAMPLE_RATE) wetMin = Math.min(wetMin, n.wetGain.gain.valueAt(t));
    // Antes: o wet descia até 0 (rampa da inversão cancelada, mas o wet não era religado) e ficava no dry puro
    expect(wetMin).toBeGreaterThan(0.3);
    expect(n.wetGain.gain.valueAt(20.4)).toBeCloseTo(1, 6);
    expect(n.dryGain.gain.valueAt(20.4)).toBeCloseTo(0, 6);
    expect(n.wetGain.gain.maxStep(19.99, 20.4)).toBeLessThan(0.01);
    expect(n.dryGain.gain.maxStep(19.99, 20.4)).toBeLessThan(0.01);
    const [base, depth] = delayDepthAt(n, 20.4);
    expect(base).toBeCloseTo(0.048, 9); // continua subindo (+2)
    expect(depth).toBeCloseTo(-0.048, 9);
  });

  it('dispose(): uma falha no LFO não deixa input/output ligados ao grafo', () => {
    const { ctx } = createTimelineContext();
    const shifter = new PitchShifterDspNode(ctx, true);
    const inner = shifter as unknown as { lfo: { dispose: () => void } };
    inner.lfo.dispose = () => {
      throw new Error('falha no LFO');
    };
    const inputDisconnect = vi.spyOn(shifter.input, 'disconnect');
    const outputDisconnect = vi.spyOn(shifter.output, 'disconnect');
    expect(() => shifter.dispose()).not.toThrow();
    expect(inputDisconnect).toHaveBeenCalledTimes(1);
    expect(outputDisconnect).toHaveBeenCalledTimes(1);
  });

  it('mantém o mesmo atraso total de subida/descida da versão anterior (base + profundidade)', () => {
    const { ctx, setTime } = createTimelineContext();
    const shifter = new PitchShifterDspNode(ctx, true);
    const n = internals(shifter);
    setTime(1);
    shifter.setSemitones(3);
    const [baseUp, depthUp] = delayDepthAt(n, 2);
    expect(baseUp).toBeCloseTo(0.048, 9); // subir: delay = 48ms - 48ms * serra (decrescente)
    expect(depthUp).toBeCloseTo(-0.048, 9);
    setTime(3);
    shifter.setSemitones(-3);
    const [baseDown, depthDown] = delayDepthAt(n, 4);
    expect(baseDown).toBe(0); // descer: delay = 48ms * serra (crescente)
    expect(depthDown).toBeCloseTo(0.048, 9);
  });

  it('é idempotente: refreshDspChain com o mesmo tom não reagenda nada', () => {
    const { ctx, setTime } = createTimelineContext();
    const shifter = new PitchShifterDspNode(ctx, true);
    const n = internals(shifter);
    setTime(1);
    shifter.setSemitones(2);
    const before = [n.dryGain.gain.events.length, n.wetGain.gain.events.length];
    setTime(30);
    shifter.setPitchShiftable(true);
    shifter.setSemitones(2);
    expect([n.dryGain.gain.events.length, n.wetGain.gain.events.length]).toEqual(before);
  });

  it('Click/Guia/Bateria (pitch lock) seguem 100% dry em qualquer tom', () => {
    const { ctx, setTime } = createTimelineContext();
    const shifter = new PitchShifterDspNode(ctx, false);
    const n = internals(shifter);
    setTime(1);
    shifter.setSemitones(4);
    setTime(2);
    shifter.setSemitones(-3);
    expect(n.wetGain.gain.valueAt(5)).toBe(0);
    expect(n.dryGain.gain.valueAt(5)).toBe(1);
  });

  it('todo stem (transposto ou Pitch Lock) tem a mesma latência constante no caminho dry', () => {
    for (const shiftable of [true, false]) {
      const { ctx } = createTimelineContext();
      const n = internals(new PitchShifterDspNode(ctx, shiftable));
      expect(n.dryDelay.delayTime.valueAt(0)).toBe(PITCH_PATH_LATENCY_SEC); // fixo, não depende do tom nem do Pitch Lock
      expect(n.dryDelay.delayTime.valueAt(1000)).toBe(PITCH_PATH_LATENCY_SEC);
    }
    // Latência = metade da janela granular, ajustada ao compromisso ataque x centroide medido no render real
    expect(PITCH_PATH_LATENCY_SEC).toBeGreaterThan(0.015);
    expect(PITCH_PATH_LATENCY_SEC).toBeLessThan(0.03);
  });
});
