export type StemType =
  | 'click'
  | 'guide'
  | 'drums'
  | 'bass'
  | 'violao'
  | 'guitars'
  | 'strings'
  | 'keys'
  | 'pad'
  | 'vocals'
  | 'fx';

export type StemRoutingDestination = 'SPLIT_IEM' | 'SPLIT_PA' | 'STEREO';

export interface StemDspConfig {
  presetName: string;
  highPassHz: number;       // 20 Hz to 350 Hz (De-Bleed Low-Cut Filter)
  eqLowDb: number;          // -12 dB to +12 dB (100 Hz Shelf — TDR SlickEQ)
  eqMidDb: number;          // -12 dB to +12 dB (1.4 kHz Peak — TDR Nova)
  eqHighDb: number;         // -12 dB to +12 dB (8.5 kHz Air Shelf — Fresh Air / Nova)
  driveAmount: number;      // 0.0 to 1.0 (Tube / Tape Saturation — SGA1566 / Softube)
  compressorEnabled: boolean; // Optical / Multiband Punch Compressor (OTT / MJUC jr.)
}

export interface TrackStemProps {
  id: string;
  name: string;
  type: StemType;
  volume: number; // 0.0 to 2.0 (linear gain, 1.0 = 0 dB, 2.0 = +6.0 dB)
  pan: number;    // -1.0 (Left) to +1.0 (Right)
  isMuted: boolean;
  isSolo: boolean;
  audioBuffer?: AudioBuffer | null;
  audioUrl?: string;
  dsp?: Partial<StemDspConfig>;
}

export class TrackStem {
  public readonly id: string;
  public readonly name: string;
  public readonly type: StemType;
  public volume: number;
  public pan: number;
  public isMuted: boolean;
  public isSolo: boolean;
  public audioBuffer?: AudioBuffer | null;
  public audioUrl?: string;
  public dsp: StemDspConfig;

  constructor(props: TrackStemProps) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.volume = Math.max(0, Math.min(2, props.volume));
    this.pan = Math.max(-1, Math.min(1, props.pan));
    this.isMuted = props.isMuted;
    this.isSolo = props.isSolo;
    this.audioBuffer = props.audioBuffer ?? null;
    this.audioUrl = props.audioUrl;
    this.dsp = {
      presetName: props.dsp?.presetName ?? 'Flat (Bypass)',
      highPassHz: props.dsp?.highPassHz ?? 20,
      eqLowDb: props.dsp?.eqLowDb ?? 0,
      eqMidDb: props.dsp?.eqMidDb ?? 0,
      eqHighDb: props.dsp?.eqHighDb ?? 0,
      driveAmount: props.dsp?.driveAmount ?? 0,
      compressorEnabled: props.dsp?.compressorEnabled ?? false
    };
  }

  public setDsp(partial: Partial<StemDspConfig>): void {
    this.dsp = {
      ...this.dsp,
      ...partial,
      highPassHz: Math.max(20, Math.min(400, partial.highPassHz ?? this.dsp.highPassHz)),
      eqLowDb: Math.max(-12, Math.min(12, partial.eqLowDb ?? this.dsp.eqLowDb)),
      eqMidDb: Math.max(-12, Math.min(12, partial.eqMidDb ?? this.dsp.eqMidDb)),
      eqHighDb: Math.max(-12, Math.min(12, partial.eqHighDb ?? this.dsp.eqHighDb)),
      driveAmount: Math.max(0, Math.min(1, partial.driveAmount ?? this.dsp.driveAmount))
    };
  }

  public resetDsp(): void {
    this.dsp = {
      presetName: 'Flat (Bypass)',
      highPassHz: 20,
      eqLowDb: 0,
      eqMidDb: 0,
      eqHighDb: 0,
      driveAmount: 0,
      compressorEnabled: false
    };
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(2, Number(vol.toFixed(3))));
  }

  public stepVolume(delta: number): void {
    this.setVolume(this.volume + delta);
  }

  public resetVolume(): void {
    this.volume = 1.0;
  }

  public setPan(p: number): void {
    this.pan = Math.max(-1, Math.min(1, p));
  }

  public toggleMute(): void {
    this.isMuted = !this.isMuted;
  }

  public toggleSolo(): void {
    this.isSolo = !this.isSolo;
  }

  /**
   * Identifica se o canal pertence à família de instrumentos de corda
   * (Violão Acústico, Guitarra Elétrica, Contrabaixo ou Cordas/Strings).
   */
  public isStringInstrument(): boolean {
    return (
      this.type === 'violao' ||
      this.type === 'guitars' ||
      this.type === 'bass' ||
      this.type === 'strings'
    );
  }

  /**
   * Indica se a track deve tocar áudio considerando solos ativos
   */
  public isAudible(hasAnySolo: boolean): boolean {
    if (this.isMuted) return false;
    if (hasAnySolo) return this.isSolo;
    return true;
  }

  /**
   * Determina a rota padrão de palco:
   * Click e Guia vão estritamente para o fone do músico (IEM), nunca para o PA.
   */
  public getDefaultRouting(): StemRoutingDestination {
    if (this.type === 'click' || this.type === 'guide') {
      return 'SPLIT_IEM';
    }
    return 'SPLIT_PA';
  }
}
