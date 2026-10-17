import { Song } from '../../domain/entities/Song';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';

export interface AudioEngineState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentBar: number;
  currentBeat: number;
  routingMode: RoutingMode;
  queuedSectionId: string | null;
  activeSectionId: string | null;
  isLoopingSection: boolean;
  isSoloClickActive: boolean;
  isLoopClickActive: boolean;
  masterVolume: number;
}

export interface AudioEnginePort {
  init(): Promise<void>;
  loadSong(song: Song): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  seek(timeInSeconds: number): void;
  setMasterVolume(volume: number): void;
  setRoutingMode(mode: RoutingMode): void;
  setStemVolume(stemId: string, volume: number): void;
  setStemPan(stemId: string, pan: number): void;
  toggleStemMute(stemId: string): void;
  toggleStemSolo(stemId: string): void;
  queueSectionJump(sectionId: string): void;
  toggleSectionLoop(): void;
  toggleSoloClick(): void;
  toggleLoopClick(): void;
  getState(): AudioEngineState;
  subscribe(listener: (state: AudioEngineState) => void): () => void;
  panic(): void; // Emergency fade out
}
