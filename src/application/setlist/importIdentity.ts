import { reconcileKey, type SongKeyInfo } from '../../domain/value-objects/SongKey';

export interface ImportFileRef {
  name: string;
  size: number;
}

/** FNV-1a de 32 bits em hexadecimal. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Id estável de uma importação local: o mesmo pacote (nome + tamanho) reimportado cai na mesma música,
 * então o tom confirmado e o cache não se duplicam. A ordem de seleção dos stems não importa.
 */
export function stableImportId(kind: 'zip' | 'stems', files: ImportFileRef[]): string {
  const key = files
    .map((f) => `${f.name}|${f.size}`)
    .sort()
    .join('\n');
  return `${kind === 'zip' ? 'zip-song' : 'imported-song'}-${fnv1a(key)}${fnv1a(`${key.length}:${key}`)}`;
}

/** Id de stem derivado do id da música: estável entre importações do mesmo pacote. */
export const stableStemId = (songId: string, index: number): string => `${songId}-stem-${index}`;

/**
 * Tom de uma importação: a confirmação manual da música já conhecida prevalece e dispensa a análise;
 * tom no nome do pacote dispensa o áudio; senão analisa e reconcilia com o que já se sabia.
 */
export async function resolveImportKey(
  known: SongKeyInfo | null,
  nameKey: SongKeyInfo | null,
  analyze: () => Promise<SongKeyInfo>
): Promise<SongKeyInfo> {
  if (known?.confirmed && known.value) return known;
  const analysed = nameKey ?? (await analyze());
  return known ? reconcileKey(known, analysed) : analysed;
}
