import { classifyStemName } from './StemNameClassifier';

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
    if (this.pitchPolicy === 'locked' || this.type === 'click' || this.type === 'guide') return; // Click e Guia nunca podem ser desbloqueados
    this.pitchPolicy = val ? 'harmonic' : 'percussive';
  }

  constructor(props: TrackStemProps) {
    this.id = props.id;
    this.name = props.name;
    // Nome de click/guia manda no tipo: o roteamento lê só `type`, e um "Click" gravado como 'fx' (migrador,
    // Firestore) iria para o PA.
    const byName = classifyStemName(props.name);
    this.type = byName.family === 'click' || byName.family === 'guide' ? byName.type : props.type;
    this.volume = Math.max(0, Math.min(2, props.volume));
    this.pan = Math.max(-1, Math.min(1, props.pan));
    this.isMuted = props.isMuted;
    this.isSolo = props.isSolo;

    if (this.type === 'click' || this.type === 'guide') {
      // Vale também para política restaurada do IndexedDB: click e guia nunca transpõem.
      this.pitchPolicy = 'locked';
    } else if (props.pitchPolicy) {
      this.pitchPolicy = props.pitchPolicy;
    } else if (props.isPitchShiftable !== undefined) {
      this.pitchPolicy = props.isPitchShiftable ? 'harmonic' : 'percussive';
    } else {
      this.pitchPolicy = TrackStem.inferPitchPolicy(this.type, props.name);
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
    // O nome (tokenizado, ver StemNameClassifier) decide quando reconhece algo; o tipo é o fallback.
    const byName = classifyStemName(name);
    if (byName.matched) {
      return byName.policy;
    }

    // Por tipo padrão
    if (type === 'bass' || type === 'violao' || type === 'guitars' || type === 'keys' || type === 'pad' || type === 'vocals' || type === 'strings') {
      return 'harmonic';
    }
    if (type === 'loop') {
      // Loop ambíguo: travado por segurança (ver StemNameClassifier); o músico pode sobrescrever por stem
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
    const c = classifyStemName(clean);
    const lower = clean.toLowerCase();
    const base = { pitchPolicy: c.policy, isPitchShiftable: c.policy === 'harmonic' };

    switch (c.family) {
      case 'click':
        return { ...base, type: 'click', displayName: 'Click (Metrônomo)', defaultPan: 0 };
      case 'guide':
        return { ...base, type: 'guide', displayName: 'Guia de Palco', defaultPan: 0 };
      case 'harmonic-loop': {
        const pan = c.type === 'guitars' || c.type === 'violao' ? -0.2 : c.type === 'keys' ? 0.1 : 0;
        const label = c.type === 'guitars' || c.type === 'violao' ? 'Guitarra/Loop' : c.type === 'keys' ? 'Teclas/Loop' : 'Loop Harmônico';
        return { ...base, type: c.type, displayName: `${label} (${clean})`, defaultPan: pan };
      }
      case 'percussive-loop':
      case 'ambiguous-loop':
        return { ...base, type: 'loop', displayName: `Loop Percussivo (${clean})`, defaultPan: 0 };
      case 'drums':
        return { ...base, type: 'drums', displayName: 'Bateria (Drums)', defaultPan: 0 };
      case 'bass':
        return { ...base, type: 'bass', displayName: 'Contrabaixo (Bass)', defaultPan: 0 };
      case 'acoustic-guitar':
        return { ...base, type: 'violao', displayName: `Violão (${clean})`, defaultPan: -0.2 };
      case 'electric-guitar': {
        const pan = lower.includes('1') ? -0.25 : lower.includes('2') ? 0.25 : 0.1;
        return { ...base, type: 'guitars', displayName: `Guitarra (${clean})`, defaultPan: pan };
      }
      case 'pad':
        return { ...base, type: 'pad', displayName: `Synth / Pad (${clean})`, defaultPan: 0 };
      case 'keys':
        return { ...base, type: 'keys', displayName: `Teclas (${clean})`, defaultPan: 0.1 };
      case 'vocals':
        return { ...base, type: 'vocals', displayName: 'Backing Vocals', defaultPan: 0 };
      case 'strings':
        return { ...base, type: 'strings', displayName: `Cordas (${clean})`, defaultPan: 0 };
      case 'mixed':
        // Mix completo (bateria + harmonia): transpõe; a bateria embutida sofre artefato do shifter.
        return { ...base, type: 'fx', displayName: `Mix / Banda (${clean})`, defaultPan: 0 };
      default:
        return { ...base, type: 'fx', displayName: clean, defaultPan: 0 };
    }
  }
  public setPitchPolicy(policy: PitchPolicy): void {
    if (this.type === 'click' || this.type === 'guide') {
      this.pitchPolicy = 'locked';
      return;
    }
    this.pitchPolicy = policy;
  }

  public togglePitchLock(): void {
    if (this.pitchPolicy === 'locked' || this.type === 'click' || this.type === 'guide') return;
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
