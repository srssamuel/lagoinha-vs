export type MusicalKey =
  | 'C'
  | 'C#'
  | 'D'
  | 'D#'
  | 'E'
  | 'F'
  | 'F#'
  | 'G'
  | 'G#'
  | 'A'
  | 'Bb'
  | 'B';

const KEY_FREQUENCIES: Record<MusicalKey, number> = {
  C: 130.81,   // C3
  'C#': 138.59,
  D: 146.83,
  'D#': 155.56,
  E: 164.81,
  F: 174.61,
  'F#': 185.00,
  G: 196.00,
  'G#': 207.65,
  A: 220.00,
  Bb: 233.08,
  B: 246.94
};

export class PolyphonicAmbientPad {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private filter: BiquadFilterNode | null = null;
  public currentKey: MusicalKey | null = null;
  public isPlaying: boolean = false;

  constructor(audioContext?: AudioContext) {
    if (audioContext) {
      this.init(audioContext);
    }
  }

  public init(ctx: AudioContext): void {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, ctx.currentTime);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(550, ctx.currentTime);
    this.filter.Q.setValueAtTime(1.5, ctx.currentTime);

    this.masterGain.connect(this.filter);
    this.filter.connect(ctx.destination);
  }

  /**
   * Ativa o Pad contínuo no tom selecionado com crossfade suave
   */
  public play(key: MusicalKey, targetVolume: number = 0.4): void {
    if (!this.ctx || !this.masterGain) return;

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    // Se já estava tocando outro tom, faz fade out das vozes antigas
    if (this.isPlaying && this.activeNodes.length > 0) {
      this.stopCurrentVoices(1.5);
    }

    this.currentKey = key;
    this.isPlaying = true;

    const baseFreq = KEY_FREQUENCIES[key];
    // Harmônicos clássicos de Worship Pad: Fundamental, Quinta (1.5x) e Oitava (2x)
    const voices = [
      { freq: baseFreq, detune: -4, type: 'sawtooth' as OscillatorType, vol: 0.25 },
      { freq: baseFreq, detune: +4, type: 'sawtooth' as OscillatorType, vol: 0.25 },
      { freq: baseFreq * 1.498, detune: 0, type: 'sine' as OscillatorType, vol: 0.2 }, // Quinta
      { freq: baseFreq * 2.0, detune: +2, type: 'sine' as OscillatorType, vol: 0.15 }  // Oitava
    ];

    const newNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

    voices.forEach((v) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const vGain = this.ctx.createGain();

      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq, now);
      osc.detune.setValueAtTime(v.detune, now);

      vGain.gain.setValueAtTime(0.001, now);
      vGain.gain.exponentialRampToValueAtTime(v.vol, now + 2.0);

      osc.connect(vGain);
      vGain.connect(this.masterGain);
      osc.start(now);

      newNodes.push({ osc, gain: vGain });
    });

    this.activeNodes = newNodes;

    // Fade in suave do master do pad
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value || 0.001, now);
    this.masterGain.gain.exponentialRampToValueAtTime(targetVolume, now + 1.8);
  }

  /**
   * Modula o Pad atmosférico para um novo tom com crossfade contínuo sem cortes
   */
  public crossfadeTo(newKey: MusicalKey, targetVolume: number = 0.4): void {
    if (this.currentKey === newKey && this.isPlaying) return;
    this.play(newKey, targetVolume);
  }

  /**
   * Ajusta o volume do Pad em tempo real com rampa linear livre de estalos
   */
  public setVolume(volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const clamped = Math.max(0.0001, Math.min(1.0, volume));
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(clamped, now + 0.05);
  }

  public stop(fadeSeconds: number = 2.0): void {
    if (!this.ctx || !this.masterGain || !this.isPlaying) return;
    const now = this.ctx.currentTime;

    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.001, this.masterGain.gain.value), now);
    this.masterGain.gain.exponentialRampToValueAtTime(0.001, now + fadeSeconds);

    this.stopCurrentVoices(fadeSeconds);
    this.isPlaying = false;
    this.currentKey = null;
  }

  private stopCurrentVoices(fadeSeconds: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const nodesToStop = [...this.activeNodes];
    this.activeNodes = [];

    nodesToStop.forEach(({ osc, gain }) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + fadeSeconds);
      try {
        osc.stop(now + fadeSeconds + 0.1);
      } catch {
        // Ignora se já tiver parado
      }
    });
  }
}
