import type { KeyEstimate } from '../services/SongKeyDetector';
import { MIN_CORRELATION } from '../services/SongKeyDetector';

/**
 * Tom de uma música com procedência. Nunca existe tom "padrão": sem tom conhecido, `value` é null.
 *
 * origin: 'name' (escrito no nome do pacote) | 'audio' (análise do áudio) | 'manual' (alguém escolheu)
 *         | 'legacy' (registro antigo, só a string, sem saber de onde veio) | null (sem tom).
 */
export type KeyOrigin = 'name' | 'audio' | 'manual' | 'legacy';

export interface SongKeyInfo {
  value: string | null;
  origin: KeyOrigin | null;
  /** Alguém confirmou este tom. Confirmação manual prevalece sobre qualquer análise nova. */
  confirmed: boolean;
  /** Tom vindo de estimativa do áudio (ou candidatos de uma análise ambígua). */
  estimated: boolean;
  /** Análise ambígua: tons próximos entre os quais ela não escolheu (value fica null). */
  candidates: string[];
}

/** Só o que vai para a persistência além de `originalKey`. */
export type SongKeyMeta = Pick<SongKeyInfo, 'origin' | 'confirmed' | 'estimated' | 'candidates'>;

const KEY_RE = /^[A-G](?:#|b)?m?$/;
export const isValidKey = (key: unknown): key is string => typeof key === 'string' && KEY_RE.test(key);

export const UNKNOWN_KEY: SongKeyInfo = Object.freeze({
  value: null,
  origin: null,
  confirmed: false,
  estimated: false,
  candidates: [] as string[]
});

/** Registro antigo: só a string, sem procedência. Não confirmado. String vazia ou inválida = sem tom. */
export function legacyKey(raw: unknown): SongKeyInfo {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return isValidKey(value)
    ? { value, origin: 'legacy', confirmed: false, estimated: false, candidates: [] }
    : { ...UNKNOWN_KEY, candidates: [] };
}

export function keyFromName(value: string | null): SongKeyInfo {
  return isValidKey(value)
    ? { value, origin: 'name', confirmed: false, estimated: false, candidates: [] }
    : { ...UNKNOWN_KEY, candidates: [] };
}

/** Escolha de uma pessoa: confirmada. */
export function manualKey(value: string): SongKeyInfo {
  if (!isValidKey(value)) throw new Error(`Tom inválido: ${value}`);
  return { value, origin: 'manual', confirmed: true, estimated: false, candidates: [] };
}

/**
 * Resultado da análise do áudio. Abaixo do piso de correlação = sem tom. Ambígua = sem valor, com os
 * candidatos para a pessoa confirmar. Conclusiva = valor estimado, ainda não confirmado.
 */
export function keyFromAudio(estimate: KeyEstimate | null): SongKeyInfo {
  if (!estimate || estimate.correlation < MIN_CORRELATION) return { ...UNKNOWN_KEY, candidates: [] };
  if (estimate.ambiguous) {
    return { value: null, origin: 'audio', confirmed: false, estimated: true, candidates: [...estimate.candidates] };
  }
  return { value: estimate.key, origin: 'audio', confirmed: false, estimated: true, candidates: [] };
}

/** Lê o que foi persistido (originalKey + meta opcional). Sem meta = registro antigo (legacy). */
export function keyFromStored(originalKey: unknown, meta?: Partial<SongKeyMeta> | null): SongKeyInfo {
  const origins: KeyOrigin[] = ['name', 'audio', 'manual', 'legacy'];
  const value = isValidKey(originalKey) ? originalKey : null;
  const candidates = Array.isArray(meta?.candidates) ? meta.candidates.filter(isValidKey) : [];
  if (!meta || !meta.origin || !origins.includes(meta.origin)) {
    return value ? legacyKey(value) : { ...UNKNOWN_KEY, candidates };
  }
  return {
    value,
    origin: value || candidates.length > 0 ? meta.origin : null,
    confirmed: meta.confirmed === true && value !== null,
    estimated: meta.estimated === true,
    candidates
  };
}

export function keyMetaOf(info: SongKeyInfo): SongKeyMeta {
  return { origin: info.origin, confirmed: info.confirmed, estimated: info.estimated, candidates: [...info.candidates] };
}

/**
 * Junta o tom que já existia com o de uma análise nova.
 * Manual confirmado nunca é trocado. Nome vale mais que áudio e que legado. Análise sem resultado
 * não apaga o que existia.
 */
export function reconcileKey(existing: SongKeyInfo, analysed: SongKeyInfo): SongKeyInfo {
  if (existing.confirmed && existing.value) return existing;
  if (analysed.origin === null) return existing;
  if (existing.origin === 'name' && existing.value && analysed.origin !== 'name') return existing;
  return analysed;
}

/** Escolher um TOM DE DESTINO absoluto exige tom original escrito no nome ou confirmado. */
export function canChooseAbsoluteTarget(info: SongKeyInfo): boolean {
  return info.value !== null && (info.confirmed || info.origin === 'name');
}

export type KeyStatus = 'unknown' | 'ambiguous' | 'estimated' | 'legacy' | 'named' | 'confirmed';

export function keyStatus(info: SongKeyInfo): KeyStatus {
  if (info.value === null) return info.candidates.length > 0 ? 'ambiguous' : 'unknown';
  if (info.confirmed) return 'confirmed';
  if (info.origin === 'audio') return 'estimated';
  if (info.origin === 'legacy') return 'legacy';
  return 'named';
}
