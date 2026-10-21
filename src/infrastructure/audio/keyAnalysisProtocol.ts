import type { KeyEstimate } from '../../domain/services/SongKeyDetector';

/** Protocolo main <-> worker da análise de tom. Canais PCM trafegam como Transferable (sem cópia). */
export type KeyWorkerRequest =
  | { type: 'add'; channels: Float32Array[]; sampleRate: number }
  | { type: 'finish' };

export type KeyWorkerResponse =
  | { type: 'progress'; fraction: number }
  | { type: 'result'; estimate: KeyEstimate | null }
  | { type: 'error'; message: string };

export const ANALYSIS_SAMPLE_RATE = 44100;
/** Só os primeiros 2 minutos de cada stem entram na análise. */
export const ANALYSIS_MAX_SECONDS = 120;
