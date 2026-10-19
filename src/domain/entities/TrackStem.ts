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

export type PitchPolicy = 'harmonic' | 'percussive' | 'locked';

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
  pitchPolicy?: PitchPolicy; // 'harmonic' (transpõe), 'percussive' (fixo), 'locked' (click/guia imutáveis)
  isPitchShiftable?: boolean; // Mantido para compatibilidade retroativa
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
  public pitchPolicy: PitchPolicy;
  public audioBuffer?: AudioBuffer | null;
  public audioUrl?: string;
  public dsp: StemDspConfig;

  public get isPitchShiftable(): boolean {
    return this.pitchPolicy === 'harmonic';
  }

  public set isPitchShiftable(val: boolean) {
    if (this.pitchPolicy === 'locked') return; // Click e Guia nunca podem ser desbloqueados
    this.pitchPolicy = val ? 'harmonic' : 'percussive';
  }

  constructor(props: TrackStemProps) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.volume = Math.max(0, Math.min(2, props.volume));
    this.pan = Math.max(-1, Math.min(1, props.pan));
    this.isMuted = props.isMuted;
    this.isSolo = props.isSolo;

    if (props.pitchPolicy) {
      this.pitchPolicy = props.pitchPolicy;
    } else if (props.isPitchShiftable !== undefined) {
      if (props.type === 'click' || props.type === 'guide') {
        this.pitchPolicy = 'locked';
      } else {
        this.pitchPolicy = props.isPitchShiftable ? 'harmonic' : 'percussive';
      }
    } else {
      this.pitchPolicy = TrackStem.inferPitchPolicy(props.type, props.name);
    }

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
   * Inferência musical estrita de política de afinação (Pitch Policy):
   * - 'locked': Click e Guia falada de palco (protegidas por função litúrgica).
   * - 'percussive': Bateria acústica, eletrônica e percussão pura (shakers, pandeiros, beat loops).
   * - 'harmonic': Material tonal/melódico (Baixo, Guitarras, Violão, Teclados, Pads, Cordas, Vozes
   *               e Loops Harmônicos como "Keys Loop", "Guitar Loop", "Arp Synth Loop").
   */
  public static inferPitchPolicy(type: StemType, name: string = ''): PitchPolicy {
    if (type === 'click' || type === 'guide') {
      return 'locked';
    }
    if (type === 'drums') {
      return 'percussive';
    }
    const lowerName = name.toLowerCase();

    // Palavras-chave estritamente percussivas
    const isPercussive =
      lowerName.includes('shaker') ||
      lowerName.includes('tambourine') ||
      lowerName.includes('tamb') ||
      lowerName.includes('conga') ||
      lowerName.includes('bongo') ||
      lowerName.includes('hihat') ||
      lowerName.includes('hi-hat') ||
      lowerName.includes('snare') ||
      lowerName.includes('kick') ||
      lowerName.includes('clap') ||
      lowerName.includes('beat') ||
      lowerName.includes('bateria') ||
      lowerName.includes('drum');

    // Palavras-chave estritamente harmônicas/melódicas
    const isHarmonic =
      lowerName.includes('key') ||
      lowerName.includes('piano') ||
      lowerName.includes('synth') ||
      lowerName.includes('pad') ||
      lowerName.includes('guitar') ||
      lowerName.includes('gtr') ||
      lowerName.includes('violao') ||
      lowerName.includes('violão') ||
      lowerName.includes('organ') ||
      lowerName.includes('orgao') ||
      lowerName.includes('órgão') ||
      lowerName.includes('rhodes') ||
      lowerName.includes('arp') ||
      lowerName.includes('lead') ||
      lowerName.includes('brass') ||
      lowerName.includes('sax') ||
      lowerName.includes('string') ||
      lowerName.includes('bass') ||
      lowerName.includes('baixo') ||
      lowerName.includes('voc') ||
      lowerName.includes('voz');

    if (isHarmonic && !isPercussive) {
      return 'harmonic';
    }
    if (isPercussive) {
      return 'percussive';
    }

    // Por tipo padrão
    if (type === 'bass' || type === 'violao' || type === 'guitars' || type === 'keys' || type === 'pad' || type === 'vocals' || type === 'strings') {
      return 'harmonic';
    }
    if (type === 'loop') {
      // Loop genérico sem identificação tonal clara: assume percussivo por segurança, permitindo override
      return 'percussive';
    }

    return 'percussive';
  }

  public static isTypePitchShiftableByDefault(type: StemType, name: string = ''): boolean {
    return TrackStem.inferPitchPolicy(type, name) === 'harmonic';
  }

  /**
   * Classificador inteligente de arquivos de stems a partir de nomes de arquivos.
   * Diferencia Loops Harmônicos (ex: "Keys Loop", "Guitar Loop") de Loops Percussivos (ex: "Perc Loop", "Shaker Loop").
   */
  public static classifyStemFromFilename(filename: string): {
    type: StemType;
    displayName: string;
    pitchPolicy: PitchPolicy;
    isPitchShiftable: boolean;
    defaultPan: number;
  } {
    const clean = filename
      .replace(/^.*[\\/]/, '')
      .replace(/\.(wav|mp3|ogg|flac|m4a)$/i, '')
      .replace(/_1$/i, '')
      .trim();
    const lower = clean.toLowerCase();

    // 1. Click / Metrônomo
    if (lower.includes('click') || lower.includes('metronomo') || lower.includes('metrônomo')) {
      return { type: 'click', displayName: 'Click (Metrônomo)', pitchPolicy: 'locked', isPitchShiftable: false, defaultPan: 0 };
    }

    // 2. Guia de Palco / Voice Cues
    if (lower.includes('guia') || lower.includes('guide') || lower.includes('cue') || lower.includes('contagem')) {
      return { type: 'guide', displayName: 'Guia de Palco', pitchPolicy: 'locked', isPitchShiftable: false, defaultPan: 0 };
    }

    // 3. Loops com Conteúdo Harmônico Explícito (Keys, Guitars, Pad, Synth)
    if (
      (lower.includes('key') || lower.includes('piano') || lower.includes('synth') || lower.includes('pad') || lower.includes('rhodes') || lower.includes('arp')) &&
      lower.includes('loop')
    ) {
      return { type: 'keys', displayName: `Teclas/Loop (${clean})`, pitchPolicy: 'harmonic', isPitchShiftable: true, defaultPan: 0.1 };
    }
    if ((lower.includes('guitar') || lower.includes('gtr') || lower.includes('violao') || lower.includes('violão')) && lower.includes('loop')) {
      return { type: 'guitars', displayName: `Guitarra/Loop (${clean})`, pitchPolicy: 'harmonic', isPitchShiftable: true, defaultPan: -0.2 };
    }

    // 4. Loops e Percussão Rítmicos
    if (lower.includes('loop') || lower.includes('perc') || lower.includes('shaker') || lower.includes('tamb') || lower.includes('conga') || lower.includes('bongo')) {
      return { type: 'loop', displayName: `Loop Percussivo (${clean})`, pitchPolicy: 'percussive', isPitchShiftable: false, defaultPan: 0 };
    }

    // 5. Bateria Completa
    if (lower.includes('drum') || lower.includes('bateria') || lower.includes('kit') || lower.includes('snare') || lower.includes('kick')) {
      return { type: 'drums', displayName: 'Bateria (Drums)', pitchPolicy: 'percussive', isPitchShiftable: false, defaultPan: 0 };
    }

    // 6. Contrabaixo
    if (lower.includes('bass') || lower.includes('baixo') || lower.includes('sub')) {
      return { type: 'bass', displayName: 'Contrabaixo (Bass)', pitchPolicy: 'harmonic', isPitchShiftable: true, defaultPan: 0 };
    }

    // 7. Violão Acústico
    if (lower.includes('violao') || lower.includes('violão') || lower.includes('ag') || lower.includes('acoustic')) {
      return { type: 'violao', displayName: `Violão (${clean})`, pitchPolicy: 'harmonic', isPitchShiftable: true, defaultPan: -0.2 };
    }

    // 8. Guitarras Elétricas
    if (lower.includes('eg') || lower.includes('guitar') || lower.includes('gtr') || lower.includes('electric')) {
      const pan = lower.includes('1') ? -0.25 : lower.includes('2') ? 0.25 : 0.1;
      return { type: 'guitars', displayName: `Guitarra (${clean})`, pitchPolicy: 'harmonic', isPitchShiftable: true, defaultPan: pan };
    }

    // 9. Synths e Pads
    if (lower.includes('pad') || lower.includes('synth') || lower.includes('ambi') || lower.includes('atmos')) {
      return { type: 'pad', displayName: `Synth / Pad (${clean})`, pitchPolicy: 'harmonic', isPitchShiftable: true, defaultPan: 0 };
    }

    // 10. Teclas, Pianos e Órgãos
    if (lower.includes('key') || lower.includes('piano') || lower.includes('ep') || lower.includes('orgao') || lower.includes('órgão') || lower.includes('organ') || lower.includes('rhodes')) {
      return { type: 'keys', displayName: `Teclas (${clean})`, pitchPolicy: 'harmonic', isPitchShiftable: true, defaultPan: 0.1 };
    }

    // 11. Vozes / Backing Vocals / Coro
    if (lower.includes('voc') || lower.includes('choir') || lower.includes('coro') || lower.includes('bgv') || lower.includes('voz') || lower.includes('lead voc')) {
      return { type: 'vocals', displayName: 'Backing Vocals', pitchPolicy: 'harmonic', isPitchShiftable: true, defaultPan: 0 };
    }

    // 12. Cordas / Strings
    if (lower.includes('string') || lower.includes('corda') || lower.includes('cello') || lower.includes('violin') || lower.includes('viola')) {
      return { type: 'strings', displayName: `Cordas (${clean})`, pitchPolicy: 'harmonic', isPitchShiftable: true, defaultPan: 0 };
    }

    return { type: 'fx', displayName: clean, pitchPolicy: 'percussive', isPitchShiftable: false, defaultPan: 0 };
  }

  public setPitchPolicy(policy: PitchPolicy): void {
    if (this.type === 'click' || this.type === 'guide') {
      this.pitchPolicy = 'locked';
      return;
    }
    this.pitchPolicy = policy;
  }

  public togglePitchLock(): void {
    if (this.pitchPolicy === 'locked') return;
    this.pitchPolicy = this.pitchPolicy === 'harmonic' ? 'percussive' : 'harmonic';
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
