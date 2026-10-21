/**
 * PitchShifterDspNode — Constant-Tempo Dual-Tap Hann-Windowed Pitch Shifter
 * (Modelado nos plugins Aegean Pitchproof Free VST / Kilohearts Pitch Shifter / Eventide Harmonizer)
 *
 * Por que este plugin DSP é essencial em um player de Multitracks profissional:
 * - Na Web Audio API padrão, `AudioBufferSourceNode.detune` ou `playbackRate` altera a velocidade de reprodução
 *   (varispeed). Se você mudasse o tom de Violão, Guitarra, Baixo e Teclado usando `detune` enquanto
 *   Bateria, Loops, Click e Guia permanecem no tempo original, os instrumentos harmônicos sairiam
 *   completamente de sincronia com a Bateria e o Click em poucos segundos!
 * - Este módulo resolve isso mantendo `playbackRate = 1.0` em TODOS os canais (100% travados no BPM)
 *   e aplicando um Pitch Shifter Granular Dual-Tap com Janela de Hann (sin² + cos² = 1.0)
 *   controlado por um único oscilador mestre (garantindo coerência de fase absoluta entre os dois taps).
 * - Quando `semitones === 0` ou quando o canal é Não-Tonal (`Click`, `Guia`, `Bateria`, `Loop`),
 *   o sinal passa 100% pelo caminho Dry (Bit-Transparent Bypass, latência zero).
 */
export class PitchShifterDspNode {
  public readonly input: GainNode;
  public readonly output: GainNode;

  private readonly ctx: AudioContext;
  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly delayA: DelayNode;
  private readonly delayB: DelayNode;
  private readonly fadeA: GainNode;
  private readonly fadeB: GainNode;
  private readonly modGainA: GainNode;
  private readonly modGainB: GainNode;
  private readonly lfo: OscillatorNode;
  private readonly sawShaperA: WaveShaperNode;
  private readonly sawShaperB: WaveShaperNode;
  private readonly winShaperA: WaveShaperNode;
  private readonly winShaperB: WaveShaperNode;

  // Janela granular de 48ms: equilíbrio ideal entre definição de transientes (ataque de cordas) e graves firmes
  private readonly grainWindowSec = 0.048;
  private currentSemitones = 0;
  private isEnabledForStem = true;
  /** Estado agendado do caminho wet (o que vale ao fim das rampas já programadas). */
  private wetActive = false;
  private pitchUp = false;
  /** Instante do AudioContext a partir do qual o wet está em ganho 0. */
  private wetSilentAt = 0;
  /** Inversão de direção do delay agendada para quando o wet estiver em silêncio. */
  private pendingSwap: { at: number; previousUp: boolean } | null = null;

  constructor(ctx: AudioContext, isPitchShiftable: boolean = true) {
    this.ctx = ctx;
    this.isEnabledForStem = isPitchShiftable;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Caminho Dry (100% transparente quando semitones == 0 ou para Bateria/Loops/Click/Guia)
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1.0;

    // Caminho Wet (Dual-Tap Hann Pitch Shifter)
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.0;

    this.delayA = ctx.createDelay(0.2);
    this.delayB = ctx.createDelay(0.2);
    this.delayA.delayTime.value = 0;
    this.delayB.delayTime.value = 0;

    this.fadeA = ctx.createGain();
    this.fadeB = ctx.createGain();
    this.fadeA.gain.value = 0;
    this.fadeB.gain.value = 0;

    this.modGainA = ctx.createGain();
    this.modGainB = ctx.createGain();
    this.modGainA.gain.value = this.grainWindowSec;
    this.modGainB.gain.value = this.grainWindowSec;

    // Gerador de fase único (-1 a +1) garantindo que Tap A e Tap B nunca percam sincronia de 180°
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sawtooth';
    this.lfo.frequency.value = 1.0;

    this.sawShaperA = ctx.createWaveShaper();
    this.sawShaperB = ctx.createWaveShaper();
    this.winShaperA = ctx.createWaveShaper();
    this.winShaperB = ctx.createWaveShaper();

    // Inicializa curvas de janela de Hann (sin² e cos²) e rampas defasadas em 180°
    // Serras fixas crescentes (0 -> 1); a direção subir/descer é feita por base + profundidade do delay
    this.sawShaperA.curve = PitchShifterDspNode.createSawRampCurve(false, false);
    this.sawShaperB.curve = PitchShifterDspNode.createSawRampCurve(true, false);
    this.winShaperA.curve = PitchShifterDspNode.createHannWindowCurve(false);
    this.winShaperB.curve = PitchShifterDspNode.createHannWindowCurve(true);

    // Roteamento de áudio:
    // input -> dryGain -> output
    // input -> delayA -> fadeA -> wetGain -> output
    // input -> delayB -> fadeB -> wetGain -> output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.input.connect(this.delayA);
    this.input.connect(this.delayB);
    this.delayA.connect(this.fadeA);
    this.delayB.connect(this.fadeB);
    this.fadeA.connect(this.wetGain);
    this.fadeB.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Roteamento de modulação (LFO único -> 4 WaveShapers):
    this.lfo.connect(this.sawShaperA);
    this.lfo.connect(this.sawShaperB);
    this.sawShaperA.connect(this.modGainA);
    this.sawShaperB.connect(this.modGainB);
    this.modGainA.connect(this.delayA.delayTime);
    this.modGainB.connect(this.delayB.delayTime);

    this.lfo.connect(this.winShaperA);
    this.lfo.connect(this.winShaperB);
    this.winShaperA.connect(this.fadeA.gain);
    this.winShaperB.connect(this.fadeB.gain);

    try {
      this.lfo.start();
    } catch {
      // Ignora em ambientes de teste mockados
    }
  }

  public setPitchShiftable(enabled: boolean): void {
    this.isEnabledForStem = enabled;
    this.setSemitones(this.currentSemitones);
  }

  /**
   * Troca de tom sem estalo. Antes, dry/wet mudavam em degrau (0 <-> 1) e as curvas de serra eram
   * trocadas com o wet audível: o wet chega até 48ms atrasado em relação ao dry, então o degrau corta a
   * forma de onda (clique) e a troca de curva faz o delay saltar de d para 48ms - d (outro clique).
   * Agora: crossfade linear de `crossfadeSec` no relógio do AudioContext e a direção do delay
   * (subir/descer) só muda no instante agendado em que o wet está em ganho 0.
   */
  public setSemitones(semitones: number): void {
    const target = Math.max(-6, Math.min(6, Math.round(semitones)));
    // Bateria, Loop, Click e Guia (isEnabledForStem = false) ou Tom Original (0 st): 100% Dry
    const wetOn = this.isEnabledForStem && target !== 0;
    if (target === this.currentSemitones && wetOn === this.wetActive) return; // idempotente (refreshDspChain)
    this.currentSemitones = target;

    const now = this.ctx.currentTime;
    const fade = PitchShifterDspNode.crossfadeSec;
    // Troca nova antes da inversão agendada acontecer: a inversão antiga cairia com o wet já subindo de
    // novo. Cancela e volta ao sentido que de fato está valendo.
    if (this.pendingSwap && this.pendingSwap.at > now) {
      for (const param of [this.delayA.delayTime, this.delayB.delayTime, this.modGainA.gain, this.modGainB.gain]) {
        param.cancelScheduledValues(now);
      }
      this.pitchUp = this.pendingSwap.previousUp;
    }
    this.pendingSwap = null;

    if (!wetOn) {
      if (this.wetActive) {
        PitchShifterDspNode.rampParam(this.dryGain.gain, 1.0, now, fade);
        PitchShifterDspNode.rampParam(this.wetGain.gain, 0.0, now, fade);
        this.wetSilentAt = now + fade;
        this.wetActive = false;
      }
      return;
    }

    const pitchRatio = Math.pow(2, target / 12);
    const pitchUp = pitchRatio > 1.0;
    const lfoFreq = Math.max(0.05, Math.abs(1.0 - pitchRatio) / this.grainWindowSec);
    // Frequência do LFO: fase contínua no oscilador, então desliza sem descontinuidade
    PitchShifterDspNode.rampParam(this.lfo.frequency, lfoFreq, now, fade);

    if (this.wetActive && pitchUp === this.pitchUp) return; // mesmo sentido: só a taxa muda

    let swapAt = Math.max(now, this.wetSilentAt);
    if (this.wetActive) {
      // Inversão de sentido com wet audível: wet -> dry, troca a direção no silêncio, dry -> wet
      PitchShifterDspNode.rampParam(this.dryGain.gain, 1.0, now, fade);
      PitchShifterDspNode.rampParam(this.wetGain.gain, 0.0, now, fade);
      swapAt = now + fade;
    }
    this.applyDelayDirection(pitchUp, swapAt);
    if (swapAt > now) this.pendingSwap = { at: swapAt, previousUp: this.pitchUp };
    if (swapAt <= now) {
      PitchShifterDspNode.rampParam(this.dryGain.gain, 0.0, now, fade);
      PitchShifterDspNode.rampParam(this.wetGain.gain, 1.0, now, fade);
    } else {
      // Fade-out ainda em curso até swapAt: encadeia a volta sem cancelar a rampa que leva o wet a 0
      PitchShifterDspNode.rampFrom(this.dryGain.gain, 1.0, 0.0, swapAt, fade);
      PitchShifterDspNode.rampFrom(this.wetGain.gain, 0.0, 1.0, swapAt, fade);
    }
    this.pitchUp = pitchUp;
    this.wetActive = true;
  }

  /** Duração do crossfade dry/wet na troca de tom (30ms: inaudível como transição, longo o bastante para não estalar). */
  public static readonly crossfadeSec = 0.03;

  /** Rampa a partir do valor atual no tempo `start` (cancela agendamentos futuros do mesmo parâmetro). */
  private static rampParam(param: AudioParam, value: number, start: number, duration: number): void {
    param.cancelScheduledValues(start);
    param.setValueAtTime(param.value, start);
    param.linearRampToValueAtTime(value, start + duration);
  }

  /** Rampa agendada no futuro partindo de um valor conhecido (não cancela o que vem antes de `start`). */
  private static rampFrom(param: AudioParam, from: number, value: number, start: number, duration: number): void {
    param.setValueAtTime(from, start);
    param.linearRampToValueAtTime(value, start + duration);
  }

  /**
   * Direção do delay sem trocar curva: delay = base + mod * serra(0..1).
   * Subir tom: delay decrescente (base = janela, mod = -janela); descer: crescente (base = 0, mod = +janela).
   */
  private applyDelayDirection(pitchUp: boolean, at: number): void {
    const base = pitchUp ? this.grainWindowSec : 0;
    const depth = pitchUp ? -this.grainWindowSec : this.grainWindowSec;
    for (const param of [this.delayA.delayTime, this.delayB.delayTime]) {
      param.cancelScheduledValues(at);
      param.setValueAtTime(base, at);
    }
    for (const param of [this.modGainA.gain, this.modGainB.gain]) {
      param.cancelScheduledValues(at);
      param.setValueAtTime(depth, at);
    }
  }

  public dispose(): void {
    try {
      this.lfo.stop();
      this.lfo.disconnect();
      this.input.disconnect();
      this.output.disconnect();
    } catch {
      // Ignora caso já desconectado
    }
  }

  /**
   * Gera a rampa de atraso em [0, 1] para Tap A (offset 0.0) ou Tap B (offset 0.5).
   * Se `pitchUp = true`, a rampa é decrescente (1 -> 0) para comprimir os períodos de onda (aumentar frequência).
   * Se `pitchUp = false`, a rampa é crescente (0 -> 1) para expandir os períodos de onda (diminuir frequência).
   */
  public static createSawRampCurve(
    halfCycleOffset: boolean,
    pitchUp: boolean,
    samples: number = 2048
  ): Float32Array<ArrayBuffer> {
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < samples; i++) {
      let phase = i / (samples - 1); // [0, 1]
      if (halfCycleOffset) {
        phase = (phase + 0.5) % 1.0;
      }
      curve[i] = pitchUp ? 1.0 - phase : phase;
    }
    return curve;
  }

  /**
   * Gera a janela de Hann (sin²(π·φ) para Tap A e cos²(π·φ) para Tap B).
   * Garante ganho 0.000 exato no instante do salto da rampa de delay e soma unitária (sin² + cos² = 1.0).
   */
  public static createHannWindowCurve(
    halfCycleOffset: boolean,
    samples: number = 2048
  ): Float32Array<ArrayBuffer> {
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < samples; i++) {
      let phase = i / (samples - 1); // [0, 1]
      if (halfCycleOffset) {
        phase = (phase + 0.5) % 1.0;
      }
      const s = Math.sin(Math.PI * phase);
      curve[i] = s * s;
    }
    return curve;
  }
}
