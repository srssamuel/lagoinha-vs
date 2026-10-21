import type { StemType } from '../../domain/entities/TrackStem';
import {
  detectKeyFromPcm,
  isTonalStemForKeyDetection,
  type KeyEstimate
} from '../../domain/services/SongKeyDetector';
import { keyFromAudio, UNKNOWN_KEY, type SongKeyInfo } from '../../domain/value-objects/SongKey';
import {
  ANALYSIS_MAX_SECONDS,
  ANALYSIS_SAMPLE_RATE,
  type KeyWorkerRequest,
  type KeyWorkerResponse
} from './keyAnalysisProtocol';

/** Ordem de preferência: baixo e harmonia definem o tom melhor que melodia/voz. */
const PREFERENCE: StemType[] = ['bass', 'keys', 'pad', 'violao', 'guitars', 'strings', 'vocals'];
const MAX_STEMS = 4;

export interface StemAudioSource {
  type: StemType;
  blob: Blob;
}

export interface KeyAnalysisProgress {
  phase: 'decode' | 'analyze';
  /** 0..1 do trabalho total (decodificação dos stems + cromagrama). */
  fraction: number;
}

export interface KeyAnalysisOptions {
  signal?: AbortSignal;
  onProgress?: (progress: KeyAnalysisProgress) => void;
}

const abortError = () => new DOMException('Análise de tom cancelada.', 'AbortError');
export const isAbortError = (err: unknown): boolean => err instanceof DOMException && err.name === 'AbortError';

/** Fila de uma análise por vez: importar um setlist inteiro nunca decodifica o acervo todo ao mesmo tempo. */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

function selectTonal(stems: StemAudioSource[]): StemAudioSource[] {
  return stems
    .filter((s) => isTonalStemForKeyDetection(s.type))
    .sort((a, b) => PREFERENCE.indexOf(a.type) - PREFERENCE.indexOf(b.type))
    .slice(0, MAX_STEMS);
}

/** Cromagrama no Worker; sem Worker (testes, navegador antigo) cai para a thread atual. */
function openWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./keyAnalysis.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

async function analyze(stems: StemAudioSource[], options: KeyAnalysisOptions): Promise<KeyEstimate | null> {
  const OfflineCtx = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!OfflineCtx) return null;
  const tonal = selectTonal(stems);
  if (tonal.length === 0) return null;
  const { signal, onProgress } = options;
  if (signal?.aborted) throw abortError();

  const worker = openWorker();
  const decoder = new OfflineCtx(1, 1, ANALYSIS_SAMPLE_RATE);
  // Decodificação pesa 30% da barra; o cromagrama, 70%
  const report = (phase: KeyAnalysisProgress['phase'], fraction: number) => onProgress?.({ phase, fraction });

  const result = new Promise<KeyEstimate | null>((resolve, reject) => {
    if (!worker) return;
    worker.onmessage = (event: MessageEvent<KeyWorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'progress') report('analyze', 0.3 + 0.7 * msg.fraction);
      else if (msg.type === 'result') resolve(msg.estimate);
      else reject(new Error(msg.message));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'Falha no Worker de análise de tom.'));
  });
  void result.catch(() => undefined); // erro do Worker antes de alguém aguardar: sem rejeição sem tratamento
  const onAbort = () => worker?.terminate();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const inline = worker ? null : new Float32Array(ANALYSIS_SAMPLE_RATE * ANALYSIS_MAX_SECONDS);
    let inlineUsed = 0;
    for (let i = 0; i < tonal.length; i++) {
      if (signal?.aborted) throw abortError();
      report('decode', (0.3 * i) / tonal.length);
      try {
        const buffer = await decoder.decodeAudioData(await tonal[i]!.blob.arrayBuffer());
        const length = Math.min(buffer.length, ANALYSIS_SAMPLE_RATE * ANALYSIS_MAX_SECONDS);
        if (worker) {
          // slice() copia só os 2 primeiros minutos; o AudioBuffer inteiro fica livre para o GC
          const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) => buffer.getChannelData(ch).slice(0, length));
          const message: KeyWorkerRequest = { type: 'add', channels, sampleRate: ANALYSIS_SAMPLE_RATE };
          worker.postMessage(message, channels.map((c) => c.buffer));
        } else if (inline) {
          inlineUsed = Math.max(inlineUsed, length);
          for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const data = buffer.getChannelData(ch);
            for (let n = 0; n < length; n++) inline[n]! += data[n]! / buffer.numberOfChannels;
          }
        }
      } catch (err) {
        if (isAbortError(err)) throw err;
        // Stem que o navegador não decodifica: segue com os demais
      }
    }
    if (signal?.aborted) throw abortError();
    report('analyze', 0.3);
    if (worker) {
      worker.postMessage({ type: 'finish' } satisfies KeyWorkerRequest);
      return await Promise.race([
        result,
        new Promise<never>((_, reject) => signal?.addEventListener('abort', () => reject(abortError()), { once: true }))
      ]);
    }
    return inline && inlineUsed > 0 ? detectKeyFromPcm(inline.subarray(0, inlineUsed), ANALYSIS_SAMPLE_RATE) : null;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    worker?.terminate();
    report('analyze', 1);
  }
}

/**
 * Analisa o tom pelo áudio dos stems tonais (Click/Guia/Bateria/Loop/FX fora): até 4 stems, 2 min cada.
 * Uma análise por vez (fila), cromagrama em Web Worker, com progresso e cancelamento por AbortSignal.
 * Devolve o tom com procedência: estimado, ambíguo (candidatos, sem valor) ou sem tom. Cancelado: rejeita AbortError.
 */
export function analyzeKeyFromStems(stems: StemAudioSource[], options: KeyAnalysisOptions = {}): Promise<SongKeyInfo> {
  return enqueue(async () => {
    try {
      return keyFromAudio(await analyze(stems, options));
    } catch (err) {
      if (isAbortError(err)) throw err;
      return UNKNOWN_KEY; // Worker que não carrega ou quebra: sem tom, nunca exceção para a interface
    }
  });
}

/** Estimativa bruta (sem procedência), para medições. */
export function detectKeyFromStems(stems: StemAudioSource[], options: KeyAnalysisOptions = {}): Promise<KeyEstimate | null> {
  return enqueue(() => analyze(stems, options));
}
