import { describe, expect, it } from 'vitest';
import { PitchShifterDspNode } from '../../../src/infrastructure/audio/PitchShifterDspNode';

/**
 * Regressão do relato de palco "ao trocar o tom fica dando um click".
 * O AudioParam falso abaixo AVALIA a linha do tempo de automação (setValueAtTime, linearRamp,
 * cancelScheduledValues) no relógio do AudioContext, então dá para medir o maior salto entre
 * duas amostras consecutivas: degrau 0 -> 1 = clique; rampa de 30ms = ~0.0008 por amostra.
 */

const SAMPLE_RATE = 44100;

interface TimelineEvent {
  type: 'set' | 'ramp';
  value: number;
  time: number;
}

class TimelineParam {
  events: TimelineEvent[] = [];
  private initial: number;
  private readonly clock: () => number;
  constructor(initial: number, clock: () => number) {
    this.initial = initial;
    this.clock = clock;
  }
  get value(): number {
    return this.valueAt(this.clock());
  }
  set value(v: number) {
    this.events = [];
    this.initial = v;
  }
  private insert(e: TimelineEvent): this {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1]!.time > e.time) i--;
    this.events.splice(i, 0, e);
    return this;
  }
  setValueAtTime(value: number, time: number) {
    return this.insert({ type: 'set', value, time });
  }
  linearRampToValueAtTime(value: number, time: number) {
    return this.insert({ type: 'ramp', value, time });
  }
  cancelScheduledValues(time: number) {
    this.events = this.events.filter((e) => e.time < time);
    return this;
  }
  valueAt(t: number): number {
    let v = this.initial;
    let tPrev = 0;
    for (const e of this.events) {
      if (e.time <= t) {
        v = e.value;
        tPrev = e.time;
        continue;
      }
      if (e.type === 'ramp') return v + ((e.value - v) * (t - tPrev)) / (e.time - tPrev);
      return v;
    }
    return v;
  }
  /** Maior |Δ| entre amostras consecutivas no intervalo. */
  maxStep(from: number, to: number): number {
    let max = 0;
    let prev = this.valueAt(from);
    for (let t = from + 1 / SAMPLE_RATE; t <= to; t += 1 / SAMPLE_RATE) {
      const v = this.valueAt(t);
      max = Math.max(max, Math.abs(v - prev));
      prev = v;
    }
    return max;
  }
}

function createTimelineContext() {
  let now = 0;
  const clock = () => now;
  const node = (extra: Record<string, unknown> = {}) => ({ connect() {}, disconnect() {}, ...extra });
  const ctx = {
    sampleRate: SAMPLE_RATE,
    get currentTime() {
      return now;
    },
    createGain: () => node({ gain: new TimelineParam(1, clock) }),
    createDelay: () => node({ delayTime: new TimelineParam(0, clock) }),
    createOscillator: () =>
      node({ type: 'sine', frequency: new TimelineParam(440, clock), start() {}, stop() {} }),
    createWaveShaper: () => node({ curve: null })
  };
  return {
    ctx: ctx as unknown as AudioContext,
    setTime: (t: number) => {
      now = t;
    }
  };
}

interface Internals {
  dryGain: { gain: TimelineParam };
  wetGain: { gain: TimelineParam };
  delayA: { delayTime: TimelineParam };
  delayB: { delayTime: TimelineParam };
  modGainA: { gain: TimelineParam };
  sawShaperA: { curve: Float32Array };
  sawShaperB: { curve: Float32Array };
}

const internals = (n: PitchShifterDspNode) => n as unknown as Internals;

/** Ganho do caminho por onde a amostra do delay A passa (delay = base + profundidade * serra). */
const delayDepthAt = (n: Internals, t: number) => [n.delayA.delayTime.valueAt(t), n.modGainA.gain.valueAt(t)];

describe('PitchShifterDspNode — troca de tom sem clique', () => {
  it('rampeia dry/wet no relógio do AudioContext ao sair do tom original (0 -> +2)', () => {
    const { ctx, setTime } = createTimelineContext();
    const shifter = new PitchShifterDspNode(ctx, true);
    const n = internals(shifter);
    setTime(10);
    shifter.setSemitones(2);

    expect(n.wetGain.gain.valueAt(10)).toBeCloseTo(0, 6);
    expect(n.wetGain.gain.valueAt(10 + PitchShifterDspNode.crossfadeSec)).toBeCloseTo(1, 6);
    expect(n.dryGain.gain.valueAt(10 + PitchShifterDspNode.crossfadeSec)).toBeCloseTo(0, 6);
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
    expect(n.wetGain.gain.valueAt(20 + PitchShifterDspNode.crossfadeSec)).toBeCloseTo(0, 6);
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
});
