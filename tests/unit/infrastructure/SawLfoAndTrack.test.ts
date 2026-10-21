import { describe, expect, it, vi } from 'vitest';
import { LinearParamTrack } from '../../../src/infrastructure/audio/LinearParamTrack';
import { SawLfo } from '../../../src/infrastructure/audio/SawLfo';
import { PitchShifterDspNode } from '../../../src/infrastructure/audio/PitchShifterDspNode';
import { createTimelineContext, SAMPLE_RATE, TimelineParam } from './helpers/timelineParam';
import { createGraphAudioContext, FakeNode } from './helpers/graphAudioContext';

describe('SawLfo — dente de serra com salto exato (sem ringing de Gibbs)', () => {
  const lfoOf = (hz: number) => {
    const { ctx, setTime } = createTimelineContext();
    const lfo = new SawLfo(ctx, hz);
    return { lfo, setTime, offset: (lfo.node as unknown as { offset: TimelineParam }).offset };
  };

  it('sobe linearmente de -1 a +1 e salta numa única amostra, sem valores intermediários', () => {
    const { offset } = lfoOf(2.5); // período 0,4 s
    const slope = (2 * 2.5) / SAMPLE_RATE; // |Δ| por amostra na rampa
    let jumps = 0;
    let prev = offset.valueAt(0);
    for (let t = 1 / SAMPLE_RATE; t < 1.7; t += 1 / SAMPLE_RATE) {
      const v = offset.valueAt(t);
      const d = Math.abs(v - prev);
      if (d > 4 * slope) {
        jumps++;
        expect(prev).toBeGreaterThan(0.999); // sai do topo da rampa
        expect(v).toBeLessThan(-0.99); // cai direto ao início (nada no meio)
      }
      prev = v;
    }
    expect(jumps).toBe(4); // 1,7 s / 0,4 s = 4 saltos
  });

  it('mudar a frequência no meio do ciclo é contínuo em fase (só muda a inclinação)', () => {
    const { lfo, offset } = lfoOf(2.0); // período 0,5 s; em t=0,3 a fase é 0,6 -> valor 0,2
    const when = lfo.setFrequency(4.0, 0.3);
    expect(when).toBeGreaterThanOrEqual(0.3);
    const before = offset.valueAt(when - 1 / SAMPLE_RATE);
    const after = offset.valueAt(when + 1 / SAMPLE_RATE);
    const slopeNew = (2 * 4.0) / SAMPLE_RATE;
    expect(Math.abs(after - before)).toBeLessThan(2 * slopeNew + 1e-6);
    // nenhuma amostra pula além do que a nova inclinação permite, até o próximo salto (fase 0,6 -> 0,4/8 = 50 ms)
    let prev = offset.valueAt(when);
    for (let t = when + 1 / SAMPLE_RATE; t < when + 0.045; t += 1 / SAMPLE_RATE) {
      const v = offset.valueAt(t);
      expect(Math.abs(v - prev)).toBeLessThan(2 * slopeNew + 1e-6);
      prev = v;
    }
    expect(lfo.frequencyHz).toBe(4.0);
  });

  it('frequências em sequência rápida (dentro de poucos ms) nunca voltam no tempo nem abrem salto', () => {
    const { lfo, offset } = lfoOf(2.0);
    lfo.setFrequency(3.0, 1.0);
    lfo.setFrequency(2.2, 1.001);
    lfo.setFrequency(5.0, 1.002);
    let prev = offset.valueAt(0.9);
    const maxSlope = (2 * 5.0) / SAMPLE_RATE;
    for (let t = 0.9 + 1 / SAMPLE_RATE; t < 1.5; t += 1 / SAMPLE_RATE) {
      const v = offset.valueAt(t);
      const d = v - prev;
      // sobe devagar ou salta do topo para -1; nunca degrau no meio da rampa
      if (d < 0) {
        expect(prev).toBeGreaterThan(0.99);
        expect(v).toBeLessThan(-0.98);
      } else {
        expect(d).toBeLessThan(2 * maxSlope + 1e-6);
      }
      prev = v;
    }
  });
});

describe('SawLfo — horizonte de 30 s renovado a cada 5 s', () => {
  const offsetOf = (lfo: SawLfo) => (lfo.node as unknown as { offset: TimelineParam }).offset;
  const expectedAt = (hz: number, t: number) => 2 * ((hz * t) % 1) - 1;
  const sampleTimes = function* (to: number) {
    for (let t = 0.0123; t < to; t += 0.3711) yield t;
  };

  it('passa de 180 s com fase contínua (valor == 2*fase-1), sem buraco na renovação', () => {
    vi.useFakeTimers();
    try {
      const { ctx, setTime } = createTimelineContext();
      const lfo = new SawLfo(ctx, 2.0);
      const offset = offsetOf(lfo);
      for (let s = 5; s <= 200; s += 5) {
        setTime(s);
        vi.advanceTimersByTime(5000);
      }
      for (const t of sampleTimes(205)) {
        expect(offset.valueAt(t), `t=${t.toFixed(3)}`).toBeCloseTo(expectedAt(2.0, t), 6);
      }
      lfo.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sem a renovação o LFO congelaria em -1 depois do horizonte (o teste enxerga o buraco)', () => {
    vi.useFakeTimers();
    try {
      const { ctx, setTime } = createTimelineContext();
      const lfo = new SawLfo(ctx, 2.0, { refillMs: 1e9 });
      for (let s = 5; s <= 100; s += 5) {
        setTime(s);
        vi.advanceTimersByTime(5000);
      }
      const offset = offsetOf(lfo);
      let wrong = 0;
      for (const t of sampleTimes(100)) if (Math.abs(offset.valueAt(t) - expectedAt(2.0, t)) > 1e-6) wrong++;
      expect(wrong).toBeGreaterThan(50);
      lfo.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('o horizonte é configurável e ensureHorizon() só acrescenta o que falta', () => {
    const { ctx, setTime } = createTimelineContext();
    const lfo = new SawLfo(ctx, 1.0, { horizonSec: 10, refillMs: 1e9 });
    const offset = offsetOf(lfo);
    const events = () => offset.events.length;
    expect(events()).toBeGreaterThanOrEqual(2 * 10);
    expect(events()).toBeLessThan(2 * 12);
    const initial = events();
    lfo.ensureHorizon(); // nada mudou: horizonte já coberto
    expect(events()).toBe(initial);
    setTime(5);
    lfo.ensureHorizon();
    expect(events()).toBe(initial + 2 * 5);
    lfo.dispose();
  });

  it('dispose() limpa o timer de renovação e ensureHorizon() depois dele não agenda nada', () => {
    vi.useFakeTimers();
    try {
      const { ctx, setTime } = createTimelineContext();
      const lfo = new SawLfo(ctx, 2.0);
      expect(vi.getTimerCount()).toBe(1);
      lfo.dispose();
      expect(vi.getTimerCount()).toBe(0);
      const before = offsetOf(lfo).events.length;
      setTime(50);
      lfo.ensureHorizon();
      expect(offsetOf(lfo).events.length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('dispose(): stop() que lança não impede o disconnect()', () => {
    const { ctx } = createTimelineContext();
    const lfo = new SawLfo(ctx, 2.0);
    const node = lfo.node as unknown as { stop: () => void; disconnect: () => void };
    node.stop = () => {
      throw new Error('InvalidStateError');
    };
    const disconnect = vi.fn();
    node.disconnect = disconnect;
    expect(() => lfo.dispose()).not.toThrow();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('custo por toque com 6 stems: chamadas de AudioParam do LFO, horizonte de 180 s (antes) x 30 s (depois)', () => {
    const FREQ = Math.abs(1 - Math.pow(2, 2 / 12)) / 0.048; // +2 st
    const counted = (param: unknown) => {
      const p = param as Record<string, (...a: unknown[]) => unknown>;
      const counter = { calls: 0 };
      for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'cancelScheduledValues']) {
        const original = p[m]!.bind(p);
        p[m] = (...a: unknown[]) => {
          counter.calls++;
          return original(...a);
        };
      }
      return counter;
    };
    const perToque = (horizonSec: number) => {
      const { ctx, setTime } = createTimelineContext();
      const lfos = Array.from({ length: 6 }, () => new SawLfo(ctx, 1.0, { horizonSec }));
      const counters = lfos.map((l) => counted(offsetOf(l)));
      setTime(10);
      lfos.forEach((l) => l.setFrequency(FREQ, 10.01));
      lfos.forEach((l) => l.dispose());
      return counters.reduce((s, c) => s + c.calls, 0);
    };
    const before = perToque(180);
    const after = perToque(30);
    console.info(`[SawLfo] chamadas de AudioParam por toque (+2 st, 6 stems): antes(180 s)=${before} depois(30 s)=${after}`);
    expect(after).toBeLessThan(before / 5);
    expect(after).toBeLessThan(1200);

    // Pelo caminho real (PitchShifterDspNode.setSemitones) o custo do LFO é o mesmo do horizonte de 30 s
    const { ctx, setTime } = createTimelineContext();
    const shifters = Array.from({ length: 6 }, () => new PitchShifterDspNode(ctx, true));
    const counters = shifters.map((s) => counted(offsetOf((s as unknown as { lfo: SawLfo }).lfo)));
    setTime(10);
    shifters.forEach((s) => s.setSemitones(2));
    const viaShifter = counters.reduce((s, c) => s + c.calls, 0);
    console.info(`[SawLfo] pelo PitchShifterDspNode.setSemitones(+2) em 6 stems: ${viaShifter} chamadas no LFO`);
    expect(viaShifter).toBeLessThan(1200);
    expect(viaShifter).toBeLessThan(before / 5);
    shifters.forEach((s) => s.dispose());
  });
});

describe('LinearParamTrack — retomada de rampa em curso sem degrau', () => {
  it('retarget no meio de uma rampa continua exatamente a reta até `at` e segue ao novo alvo', () => {
    const { ctx } = createTimelineContext();
    const gain = (ctx.createGain() as unknown as { gain: TimelineParam }).gain;
    const track = new LinearParamTrack(gain as unknown as AudioParam, 1, 0);
    track.retarget(10, [{ t: 10.03, v: 0 }]); // 1 -> 0 em 30 ms
    const mid = gain.valueAt(10.015);
    expect(mid).toBeCloseTo(0.5, 6);
    // novo comando no meio: volta a 1 em 30 ms a partir de 10,015
    track.retarget(10.015, [{ t: 10.045, v: 1 }]);
    expect(gain.valueAt(10.015)).toBeCloseTo(0.5, 6); // sem degrau no ponto de troca
    expect(gain.valueAt(10.045)).toBeCloseTo(1, 6);
    expect(gain.maxStep(10, 10.1)).toBeLessThan(0.01);
    // o modelo guardado coincide com o AudioParam
    for (const t of [10, 10.005, 10.015, 10.03, 10.045, 10.09]) {
      expect(track.valueAt(t)).toBeCloseTo(gain.valueAt(t), 6);
    }
  });

  it('append encadeia sem cancelar a rampa em curso', () => {
    const { ctx } = createTimelineContext();
    const gain = (ctx.createGain() as unknown as { gain: TimelineParam }).gain;
    const track = new LinearParamTrack(gain as unknown as AudioParam, 0, 0);
    track.retarget(1, [{ t: 1.03, v: 1 }]);
    track.append([{ t: 1.06, v: 1 }, { t: 1.09, v: 0 }]);
    expect(gain.valueAt(1.03)).toBeCloseTo(1, 6);
    expect(gain.valueAt(1.075)).toBeCloseTo(0.5, 6);
    expect(gain.valueAt(1.09)).toBeCloseTo(0, 6);
    expect(gain.maxStep(0.99, 1.2)).toBeLessThan(0.01);
  });
});

describe('PitchShifterDspNode — ligações do grafo (latência constante e destino do wet)', () => {
  it('input -> delay constante -> ganho dry -> output; o wet só termina no output', () => {
    const g = createGraphAudioContext();
    const shifter = new PitchShifterDspNode(g.ctx, true);
    const input = shifter.input as unknown as FakeNode;
    const output = shifter.output as unknown as FakeNode;

    // Cada rota do input precisa terminar no output do shifter e em nenhum outro lugar
    const sinks = new Set<FakeNode>();
    const walk = (n: FakeNode, seen = new Set<FakeNode>()) => {
      if (seen.has(n)) return;
      seen.add(n);
      if (n.edges.length === 0) sinks.add(n);
      for (const e of n.edges) walk(e.dest, seen);
    };
    walk(input);
    expect([...sinks]).toEqual([output]);

    // O ganho dry vem DEPOIS do delay (gain age no mesmo instante do wet) e o delay é a latência constante
    const delayNode = input.edges.map((e) => e.dest).find((d) => d.kind === 'delay' && (d.delayTime as { value: number }).value > 0)!;
    expect(delayNode).toBeDefined();
    expect((delayNode.delayTime as { value: number }).value).toBeGreaterThan(0);
    expect(delayNode.edges[0]!.dest.kind).toBe('gain');
    expect(delayNode.edges[0]!.dest.edges[0]!.dest).toBe(output);
  });
});
