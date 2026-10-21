/**
 * AudioParam falso que AVALIA a linha do tempo de automação (setValueAtTime, linearRamp,
 * cancelScheduledValues) no relógio do AudioContext, para medir o maior salto entre duas amostras
 * consecutivas e provar continuidade de rampas sem hardware.
 */

export const SAMPLE_RATE = 44100;

interface TimelineEvent {
  type: 'set' | 'ramp';
  value: number;
  time: number;
}

export class TimelineParam {
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

/** Contexto mínimo com relógio controlável e nós que expõem TimelineParam. */
export function createTimelineContext() {
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
    createConstantSource: () => node({ offset: new TimelineParam(0, clock), start() {}, stop() {} }),
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
