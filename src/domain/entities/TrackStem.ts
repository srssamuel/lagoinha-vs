export type StemType =
  | 'click'
  | 'guide'
  | 'drums'
  | 'bass'
  | 'guitars'
  | 'keys'
  | 'pad'
  | 'vocals'
  | 'fx';

export type StemRoutingDestination = 'SPLIT_IEM' | 'SPLIT_PA' | 'STEREO';

export interface TrackStemProps {
  id: string;
  name: string;
  type: StemType;
  volume: number; // 0.0 to 1.0 (linear gain)
  pan: number;    // -1.0 (Left) to +1.0 (Right)
  isMuted: boolean;
  isSolo: boolean;
  audioBuffer?: AudioBuffer | null;
  audioUrl?: string;
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

  constructor(props: TrackStemProps) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.volume = Math.max(0, Math.min(1, props.volume));
    this.pan = Math.max(-1, Math.min(1, props.pan));
    this.isMuted = props.isMuted;
    this.isSolo = props.isSolo;
    this.audioBuffer = props.audioBuffer ?? null;
    this.audioUrl = props.audioUrl;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
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
