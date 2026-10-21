import { SongSection } from '../value-objects/SongSection';
import { TrackStem } from './TrackStem';
import { ChordTransposer } from '../services/ChordTransposer';
import { keyFromStored, manualKey, type SongKeyInfo } from '../value-objects/SongKey';

export interface TimeSignature {
  beats: number; // ex: 4
  value: number; // ex: 4
}

export interface SongProps {
  id: string;
  title: string;
  artist: string;
  /** null = tom não identificado (nunca um valor padrão). */
  originalKey: string | null;
  currentKey: string | null;
  /** Procedência do tom; ausente = registro antigo (legacy, não confirmado). */
  keyInfo?: SongKeyInfo;
  bpm: number;
  timeSignature: TimeSignature;
  duration: number; // in seconds
  sections: SongSection[];
  stems: TrackStem[];
  churchId?: string;
  pitchShiftSemitones?: number;
}

export class Song {
  public readonly id: string;
  public readonly title: string;
  public readonly artist: string;
  public originalKey: string | null;
  public currentKey: string | null;
  public keyInfo: SongKeyInfo;
  public bpm: number;
  public readonly timeSignature: TimeSignature;
  public readonly duration: number;
  public readonly sections: SongSection[];
  public readonly stems: TrackStem[];
  public readonly churchId: string;
  public pitchShiftSemitones: number;

  constructor(props: SongProps) {
    if (props.bpm <= 30 || props.bpm >= 300) {
      throw new Error(`BPM must be between 30 and 300. Received: ${props.bpm}`);
    }
    this.id = props.id;
    this.title = props.title;
    this.artist = props.artist;
    this.keyInfo = props.keyInfo ?? keyFromStored(props.originalKey);
    this.originalKey = this.keyInfo.value;
    this.currentKey = props.currentKey;
    this.bpm = props.bpm;
    this.timeSignature = props.timeSignature;
    this.duration = props.duration;
    this.sections = props.sections;
    this.stems = props.stems;
    this.churchId = props.churchId || 'lagoinha-jp';
    this.pitchShiftSemitones = props.pitchShiftSemitones ?? 0;
  }

  public setPitchShift(semitones: number): void {
    const clamped = Math.max(-6, Math.min(6, Math.round(semitones)));
    this.pitchShiftSemitones = clamped;
    this.currentKey = this.originalKey ? ChordTransposer.transposeKey(this.originalKey, clamped) : null;
  }

  /** Alguém confirmou o tom original: prevalece sobre qualquer análise futura. */
  public confirmKey(key: string): void {
    this.keyInfo = manualKey(key);
    this.originalKey = key;
    this.currentKey = ChordTransposer.transposeKey(key, this.pitchShiftSemitones);
  }

  /**
   * Calcula o tempo exato de 1 compasso em segundos
   */
  public get secondsPerBar(): number {
    const secondsPerBeat = 60 / this.bpm;
    return secondsPerBeat * this.timeSignature.beats;
  }

  /**
   * Identifica a seção ativa com base no tempo atual de reprodução
   */
  public getActiveSection(currentTime: number): SongSection | null {
    return this.sections.find((sec) => sec.containsTime(currentTime)) || null;
  }

  /**
   * Retorna se alguma track está em Solo
   */
  public get hasSoloTrack(): boolean {
    return this.stems.some((s) => s.isSolo);
  }

  /**
   * Encontra uma seção pelo ID
   */
  public getSectionById(sectionId: string): SongSection | undefined {
    return this.sections.find((s) => s.id === sectionId);
  }
}

