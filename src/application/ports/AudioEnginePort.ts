import { Song } from '../../domain/entities/Song';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';

export interface MasterRtaData {
  sub: number;       // 20-60 Hz
  low: number;       // 60-250 Hz
  mid: number;       // 250-2500 Hz
  high: number;      // 2500-8000 Hz
  air: number;       // >8000 Hz
  gainReductionDb: number; // Limiter №6 GR in dB (-0.0 to -12.0)
  isLimiting: boolean;
  peakL: number;     // 0.0 to 1.5
  peakR: number;     // 0.0 to 1.5
}

export interface AudioOutputDeviceInfo {
  deviceId: string;
  label: string;
  groupId: string;
  isVirtual: boolean;
  isUsb: boolean;
  channelCountEstimate: number;
}

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
  stemLevels?: Record<string, number>;
  countInBars: number;     // 0 = Off, 1 = 1 Bar, 2 = 2 Bars
  isCountingIn: boolean;   // True during pre-roll count-in
  countInBeat: number;     // Current countdown beat (1, 2, 3, 4...)
  masterRta?: MasterRtaData;
  audioHardwareChannels?: number; // Detected physical hardware channels on destination
  availableAudioDevices?: AudioOutputDeviceInfo[];
  selectedAudioDeviceId?: string;
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
  clearAllSolos(): void;
  resetMixer(): void;
  setPitchShift(semitones: number): void;
  refreshDspChain(): void;
  queueSectionJump(sectionId: string): void;
  toggleSectionLoop(): void;
  toggleSoloClick(): void;
  toggleLoopClick(): void;
  setCountInBars(bars: number): void;
  testChannelTone(channelIndex: number, durationMs?: number): void;
  detectAudioDevices(): Promise<AudioOutputDeviceInfo[]>;
  requestDevicePermissions(): Promise<AudioOutputDeviceInfo[]>;
  setAudioOutputDevice(deviceId: string): Promise<boolean>;
  getState(): AudioEngineState;
  subscribe(listener: (state: AudioEngineState) => void): () => void;
  panic(): void; // Emergency fade out
}
