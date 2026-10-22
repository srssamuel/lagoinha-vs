import { parseKeyFromName } from './SongKeyDetector';

/**
 * Regras puras do envio para a biblioteca pública (docs/architecture/biblioteca-publica.md):
 * como a seleção vira músicas, o que o nome do pacote diz (sem inventar) e os ids estáveis.
 */

const AUDIO_EXT = /\.(wav|wave|aif|aiff|flac|mp3|m4a|aac|ogg|opus)$/i;
const ZIP_EXT = /\.zip$/i;

export interface SelectedFile {
  name: string;
  size: number;
  /** Caminho relativo quando a pessoa escolhe uma pasta (webkitRelativePath); vazio para arquivos soltos. */
  relativePath?: string;
}

export type SelectionGroup<F extends SelectedFile> =
  | { kind: 'zip'; label: string; file: F }
  | { kind: 'stems'; label: string; files: F[] };

export interface SelectionPlan<F extends SelectedFile> {
  groups: SelectionGroup<F>[];
  /** Nada some em silêncio: o que não vira música aparece aqui com o motivo. */
  rejected: { name: string; reason: string }[];
}

export const isZipName = (name: string): boolean => ZIP_EXT.test(name);
export const isAudioName = (name: string): boolean => AUDIO_EXT.test(name);

function folderOf(file: SelectedFile): string {
  const path = file.relativePath ?? '';
  const cut = path.lastIndexOf('/');
  return cut > 0 ? path.slice(0, cut) : '';
}

/**
 * Cada ZIP vira uma música. Áudios soltos viram uma música por pasta (seleção de pasta) ou uma única
 * música (seleção de arquivos). Qualquer outro arquivo é recusado com motivo visível.
 */
export function planSelection<F extends SelectedFile>(files: F[]): SelectionPlan<F> {
  const groups: SelectionGroup<F>[] = [];
  const rejected: { name: string; reason: string }[] = [];
  const loose = new Map<string, F[]>();

  for (const file of files) {
    if (file.size === 0) {
      rejected.push({ name: file.name, reason: 'arquivo vazio' });
    } else if (isZipName(file.name)) {
      groups.push({ kind: 'zip', label: file.name, file });
    } else if (isAudioName(file.name)) {
      const folder = folderOf(file);
      loose.set(folder, [...(loose.get(folder) ?? []), file]);
    } else {
      rejected.push({ name: file.name, reason: 'não é áudio nem .zip' });
    }
  }
  for (const [folder, stems] of loose) {
    const label = folder ? folder.split('/').pop()! : stems.length === 1 ? stems[0]!.name : `${stems.length} stems avulsos`;
    groups.push({ kind: 'stems', label, files: stems });
  }
  return { groups, rejected };
}

export interface PackageNameInfo {
  title: string;
  artist: string | null;
  /** null = o nome não traz BPM: fica pendente até alguém informar. */
  bpm: number | null;
  /** null = o nome não traz tom (nunca um tom padrão). */
  key: string | null;
}

/**
 * Lê título, versão/artista, BPM e tom do nome do pacote, sem valores padrão:
 * "Canção Exemplo (Versão Ao Vivo) 140Bpm - B.zip" → título, artista, 140, B.
 */
export function parsePackageName(fileName: string): PackageNameInfo {
  const base = fileName.normalize('NFC').replace(/\.(zip|wav|wave|aif|aiff|flac|mp3|m4a|aac|ogg|opus)$/i, '').trim();
  const bpmMatch = base.match(/(\d{2,3})\s*bpm/i);
  const bpmValue = bpmMatch ? Number(bpmMatch[1]) : NaN;
  const bpm = bpmValue >= 30 && bpmValue <= 300 ? bpmValue : null;
  const key = parseKeyFromName(fileName);
  const paren = base.match(/\(([^)]+)\)/);
  const artist = paren ? paren[1]!.trim() || null : null;

  let title = base
    .replace(/\([^)]*\)/g, '')
    .replace(/\d{2,3}\s*bpm/gi, '')
    .trim();
  if (key) {
    const escaped = key.replace('#', '\\#');
    title = title.replace(new RegExp(`\\s*[-–_]\\s*(?:tom\\s+)?${escaped}\\s*(?=[-–_]|$)`, 'i'), '');
  }
  title = title.replace(/[-–_]+\s*$/, '').replace(/^\s*[-–_]+/, '').replace(/\s{2,}/g, ' ').trim();
  return { title: title || base, artist, bpm, key };
}

async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ManifestEntry {
  sha256: string;
  name: string;
  type: string;
  size: number;
}

/**
 * Ids estáveis: a música nasce do conjunto de arquivos (mesmos stems = mesma música) e a versão do
 * manifesto (mesmos arquivos, nomes e funções = mesma versão). Confirmar de novo nunca duplica.
 */
export async function catalogIds(manifest: ManifestEntry[]): Promise<{ songId: string; versionId: string }> {
  if (manifest.length === 0) throw new Error('Música sem stems.');
  const shas = [...new Set(manifest.map((m) => m.sha256))].sort();
  const songId = `m${(await sha256Text(shas.join('\n'))).slice(0, 23)}`;
  const canonical = JSON.stringify(manifest.map((m) => [m.sha256, m.name, m.type, m.size]));
  const versionId = `v${(await sha256Text(canonical)).slice(0, 23)}`;
  return { songId, versionId };
}
