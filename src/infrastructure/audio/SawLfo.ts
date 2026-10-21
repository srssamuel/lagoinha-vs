/**
 * SawLfo — dente de serra de −1 a +1 com salto EXATO, agendado no relógio do AudioContext.
 *
 * Por que não um OscillatorNode 'sawtooth': a onda do oscilador é band-limited, então o salto vem com ringing
 * de Gibbs (~9% da excursão por algumas amostras). No pitch shifter de dois taps, o LFO é compartilhado: quando o
 * tap A salta (janela em 0, inaudível), o tap B está no meio da janela (ganho ~1) e lê esse ringing como
 * variação de delay de vários ms -> um estalo de escala cheia a cada ciclo (2 a 9 Hz). Medido no render real
 * (docs/qa/alinhamento-audio-2026-10-21.md). Aqui o salto é uma única amostra (setValueAtTime logo após a rampa),
 * sem valores intermediários.
 *
 * A fase é rastreada por conta própria (âncora + frequência), então mudar a frequência é contínuo em fase: a
 * rampa em curso é truncada em `at` por uma rampa colinear (ver LinearParamTrack) e só muda a inclinação.
 */

/**
 * Quanto à frente (s) os ciclos ficam agendados e de quanto em quanto tempo o horizonte é renovado.
 * 30 s em vez de 180 s: cada toque de transposição (setFrequency) apaga e reagenda todo o horizonte em cada stem,
 * então o custo por toque cai ~6x; a renovação continua a fase pelo último salto agendado (sem buraco).
 */
const DEFAULT_HORIZON_S = 30;
const DEFAULT_REFILL_MS = 5_000;

export interface SawLfoOptions {
  horizonSec?: number;
  refillMs?: number;
}

export class SawLfo {
  public readonly node: ConstantSourceNode;

  private readonly ctx: AudioContext;
  private freq: number;
  private anchorTime: number;
  private anchorPhase = 0;
  /** Instante do último salto agendado (o valor ali é −1). */
  private cursorTime = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly horizonSec: number;
  private readonly refillMs: number;

  constructor(ctx: AudioContext, frequencyHz: number, options: SawLfoOptions = {}) {
    this.ctx = ctx;
    this.horizonSec = options.horizonSec ?? DEFAULT_HORIZON_S;
    this.refillMs = options.refillMs ?? DEFAULT_REFILL_MS;
    this.freq = frequencyHz;
    this.anchorTime = ctx.currentTime;
    this.node = ctx.createConstantSource();
    this.node.offset.value = 0;
    this.node.offset.setValueAtTime(-1, this.anchorTime);
    this.cursorTime = this.anchorTime;
    this.scheduleCycles(this.anchorTime + this.horizonSec);
    try {
      this.node.start();
    } catch {
      // Ignora em ambientes de teste mockados
    }
    this.armRefill();
  }

  public get frequencyHz(): number {
    return this.freq;
  }

  /** Fase (0..1) no instante `t`, segundo a âncora e a frequência vigentes. */
  public phaseAt(t: number): number {
    const p = (this.anchorPhase + this.freq * (t - this.anchorTime)) % 1;
    return p < 0 ? p + 1 : p;
  }

  /**
   * Muda a frequência a partir de `at` sem salto de fase (só muda a inclinação da rampa).
   * Devolve o instante em que a nova frequência passa a valer (nunca antes da âncora anterior).
   */
  public setFrequency(frequencyHz: number, at: number): number {
    if (frequencyHz === this.freq) return at;
    const step = 2 / this.ctx.sampleRate;
    let when = Math.max(at, this.anchorTime + step);
    // Não truncar colado num salto (o evento do salto seria cancelado junto com a rampa que o precede)
    if (this.phaseAt(when) < 2 * step * this.freq) when += 4 * step;
    const phase = this.phaseAt(when);
    const param = this.node.offset;
    // Trunca a rampa em curso em `when` pela mesma reta (continuação exata) e recomeça com a nova inclinação
    param.cancelScheduledValues(when);
    param.linearRampToValueAtTime(2 * phase - 1, when);
    this.anchorPhase = phase;
    this.anchorTime = when;
    this.freq = frequencyHz;
    const wrapAt = when + (1 - phase) / this.freq;
    param.linearRampToValueAtTime(1, wrapAt);
    param.setValueAtTime(-1, wrapAt);
    this.cursorTime = wrapAt;
    this.scheduleCycles(when + this.horizonSec);
    return when;
  }

  /**
   * Garante ciclos agendados até agora + horizonte, continuando do último salto (fase contínua). Barato quando o
   * horizonte já está coberto; chamado pelo timer de renovação e a cada comando de transposição.
   */
  public ensureHorizon(): void {
    if (this.disposed) return;
    this.scheduleCycles(this.ctx.currentTime + this.horizonSec);
  }

  public dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    // Em try separados: se stop() lançar (já parado), o disconnect ainda precisa acontecer
    try {
      this.node.stop();
    } catch {
      // Ignora caso já parado
    }
    try {
      this.node.disconnect();
    } catch {
      // Ignora caso já desconectado
    }
  }

  /** Acrescenta ciclos inteiros (rampa até +1, salto para −1) a partir do último salto agendado. */
  private scheduleCycles(until: number): void {
    const param = this.node.offset;
    const period = 1 / this.freq;
    while (this.cursorTime < until) {
      const wrapAt = this.cursorTime + period;
      param.linearRampToValueAtTime(1, wrapAt);
      param.setValueAtTime(-1, wrapAt);
      this.cursorTime = wrapAt;
    }
  }

  private armRefill(): void {
    if (typeof setTimeout !== 'function') return;
    this.timer = setTimeout(() => {
      if (this.disposed) return;
      this.ensureHorizon();
      this.armRefill();
    }, this.refillMs);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }
}
