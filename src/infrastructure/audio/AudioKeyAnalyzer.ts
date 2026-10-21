import type { StemType } from '../../domain/entities/TrackStem';
import {
  detectKeyFromPcm,
  isTonalStemForKeyDetection,
  type KeyEstimate
} from '../../domain/services/SongKeyDetector';

/** Ordem de preferência: baixo e harmonia definem o tom melhor que melodia/voz. */
const PREFERENCE: StemType[] = ['bass', 'keys', 'pad', 'violao', 'guitars', 'strings', 'vocals'];
const MAX_STEMS = 4;
const MAX_SECONDS = 120;
/** Abaixo disso o cromagrama não se parece com nenhum tom: melhor não afirmar nada. */
const MIN_CORRELATION = 0.5;

export interface StemAudioSource {
  type: StemType;
  blob: Blob;
}

/**
 * Detecta o tom de uma multitrack pelo áudio dos stems tonais (Click/Guia/Bateria/Loop/FX fora).
 * Decodifica até 4 stems (2 min cada), faz o mixdown mono e aplica Krumhansl-Schmuckler.
 * Retorna null sem stems tonais, sem Web Audio ou com resultado ambíguo.
 */
export async function detectKeyFromStems(stems: StemAudioSource[]): Promise<KeyEstimate | null> {
  const OfflineCtx = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!OfflineCtx) return null;

  const tonal = stems
    .filter((s) => isTonalStemForKeyDetection(s.type))
    .sort((a, b) => PREFERENCE.indexOf(a.type) - PREFERENCE.indexOf(b.type))
    .slice(0, MAX_STEMS);
  if (tonal.length === 0) return null;

  const sampleRate = 44100;
  const decoder = new OfflineCtx(1, 1, sampleRate);
  const mix = new Float32Array(sampleRate * MAX_SECONDS);
  let used = 0;
  for (const stem of tonal) {
    try {
      const buffer = await decoder.decodeAudioData(await stem.blob.arrayBuffer());
      const length = Math.min(buffer.length, mix.length);
      used = Math.max(used, length);
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < length; i++) mix[i]! += data[i]! / buffer.numberOfChannels;
      }
    } catch {
      // Stem que o navegador não decodifica: segue com os demais
    }
  }
  if (used === 0) return null;

  const estimate = detectKeyFromPcm(mix.subarray(0, used), sampleRate);
  return estimate && estimate.correlation >= MIN_CORRELATION ? estimate : null;
}
