export type StemType =
  | 'click'
  | 'guide'
  | 'drums'
  | 'loop'
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
  isPitchShiftable?: boolean; // false para Bateria, Loops, Click e Guia; true para instrumentos tonais
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
  public isPitchShiftable: boolean;
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
    this.isPitchShiftable =
      props.isPitchShiftable ?? TrackStem.isTypePitchShiftableByDefault(props.type, props.name);
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

  /**
   * Regra de Engenharia de Áudio para Multitracks:
   * NUNCA aplicar mudança de tom (Pitch Shift) em Bateria (drums), Loops rítmicos (loop),
   * Click (click), Guia (guide) ou Efeitos percussivos (fx).
   * Apenas instrumentos harmônicos/melódicos (Baixo, Violão, Guitarras, Teclados, Pads, Cordas e Vozes)
   * devem acompanhar a transposição de tom.
   */
  public static isTypePitchShiftableByDefault(type: StemType, name: string = ''): boolean {
    const lowerName = name.toLowerCase();
    if (
      type === 'click' ||
      type === 'guide' ||
      type === 'drums' ||
      type === 'loop' ||
      type === 'fx' ||
      lowerName.includes('loop') ||
      lowerName.includes('drum') ||
      lowerName.includes('bateria') ||
      lowerName.includes('perc') ||
      lowerName.includes('click') ||
      lowerName.includes('guia') ||
      lowerName.includes('guide')
    ) {
      return false;
    }
    return true;
  }

  /**
   * Classificador inteligente de arquivos de stems (WAV/MP3 dentro de pacotes .ZIP).
   * Garante que "Keys Loop_1.wav" seja classificado como 'loop' (travado contra mudança de tom)
   * e não como 'keys'.
   */
  public static classifyStemFromFilename(filename: string): {
    type: StemType;
    displayName: string;
    isPitchShiftable: boolean;
    defaultPan: number;
  } {
    const clean = filename
      .replace(/^.*[\\/]/, '')
      .replace(/\.(wav|mp3|ogg|flac|m4a)$/i, '')
      .replace(/_1$/i, '')
      .trim();
    const lower = clean.toLowerCase();

    if (lower.includes('click') || lower.includes('metronomo')) {
      return { type: 'click', displayName: 'Click (Metrônomo)', isPitchShiftable: false, defaultPan: 0 };
    }
    if (lower.includes('guia') || lower.includes('guide') || lower.includes('cue')) {
      return { type: 'guide', displayName: 'Guia de Palco', isPitchShiftable: false, defaultPan: 0 };
    }
    // Importante: checar 'loop' e 'perc' ANTES de 'keys' para que "Keys Loop_1.wav" seja tratado como Loop Rítmico (Sem Pitch Shift)
    if (lower.includes('loop') || lower.includes('perc') || lower.includes('shaker') || lower.includes('tamb')) {
      return { type: 'loop', displayName: `Loop (${clean})`, isPitchShiftable: false, defaultPan: 0 };
    }
    if (lower.includes('drum') || lower.includes('bateria') || lower.includes('kit')) {
      return { type: 'drums', displayName: 'Bateria (Drums)', isPitchShiftable: false, defaultPan: 0 };
    }
    if (lower.includes('bass') || lower.includes('baixo') || lower.includes('sub')) {
      return { type: 'bass', displayName: 'Contrabaixo (Bass)', isPitchShiftable: true, defaultPan: 0 };
    }
    if (lower.includes('violao') || lower.includes('violão') || lower.includes('ag') || lower.includes('acoustic')) {
      return { type: 'violao', displayName: `Violão (${clean})`, isPitchShiftable: true, defaultPan: -0.2 };
    }
    if (lower.includes('eg') || lower.includes('guitar') || lower.includes('gtr')) {
      const pan = lower.includes('1') ? -0.25 : lower.includes('2') ? 0.25 : 0.1;
      return { type: 'guitars', displayName: `Guitarra (${clean})`, isPitchShiftable: true, defaultPan: pan };
    }
    if (lower.includes('pad') || lower.includes('synth') || lower.includes('ambi')) {
      return { type: 'pad', displayName: `Synth / Pad (${clean})`, isPitchShiftable: true, defaultPan: 0 };
    }
    if (lower.includes('key') || lower.includes('piano') || lower.includes('ep') || lower.includes('orgao') || lower.includes('órgão') || lower.includes('organ')) {
      return { type: 'keys', displayName: `Teclas (${clean})`, isPitchShiftable: true, defaultPan: 0.1 };
    }
    if (lower.includes('voc') || lower.includes('choir') || lower.includes('coro') || lower.includes('bgv') || lower.includes('voz')) {
      return { type: 'vocals', displayName: 'Backing Vocals', isPitchShiftable: true, defaultPan: 0 };
    }
    if (lower.includes('string') || lower.includes('corda') || lower.includes('cello') || lower.includes('violin')) {
      return { type: 'strings', displayName: `Cordas (${clean})`, isPitchShiftable: true, defaultPan: 0 };
    }
    return { type: 'fx', displayName: clean, isPitchShiftable: false, defaultPan: 0 };
  }

  public togglePitchLock(): void {
    this.isPitchShiftable = !this.isPitchShiftable;
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
