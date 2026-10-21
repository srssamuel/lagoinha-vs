/// <reference lib="webworker" />
// Análise de tom fora da thread principal: mixdown mono + cromagrama + Krumhansl-Schmuckler.
// Roda só durante importação/preparo, nunca no AudioWorklet de tempo real.
import { detectKeyFromPcm } from '../../domain/services/SongKeyDetector';
import {
  ANALYSIS_MAX_SECONDS,
  ANALYSIS_SAMPLE_RATE,
  type KeyWorkerRequest,
  type KeyWorkerResponse
} from './keyAnalysisProtocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: KeyWorkerResponse) => ctx.postMessage(message);

let mix = new Float32Array(ANALYSIS_SAMPLE_RATE * ANALYSIS_MAX_SECONDS);
let used = 0;

ctx.onmessage = (event: MessageEvent<KeyWorkerRequest>) => {
  try {
    const msg = event.data;
    if (msg.type === 'add') {
      const length = Math.min(msg.channels[0]?.length ?? 0, mix.length);
      used = Math.max(used, length);
      for (const data of msg.channels) {
        for (let i = 0; i < length; i++) mix[i]! += data[i]! / msg.channels.length;
      }
      return;
    }
    const estimate = used > 0 ? detectKeyFromPcm(mix.subarray(0, used), ANALYSIS_SAMPLE_RATE, (fraction) => post({ type: 'progress', fraction })) : null;
    post({ type: 'result', estimate });
    mix = new Float32Array(0); // libera os ~21 MB do mixdown
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
