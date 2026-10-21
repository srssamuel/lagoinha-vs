import { LibraryScope } from './SongLibraryPort';

/** Onde o arquivo mora e qual versão o lista: o Worker só entrega com essa prova (contrato, seção 4). */
export interface StemReadRef {
  scope: LibraryScope;
  songId: string;
  versionId: string;
}

export interface StemWriteTarget {
  scope: LibraryScope;
  name?: string;
  contentType?: string;
}

/**
 * Arquivos de áudio guardados por conteúdo (spec-banco-online, seção 3; contrato-stems-worker).
 * O mesmo arquivo nunca é duplicado no mesmo escopo e quem baixa confere a integridade pelo sha256.
 * Local: LocalStemStore (ignora escopo e referência). Produção (F3): R2WorkerStemStore.
 */
export interface StemBlobPort {
  /** Grava e devolve o sha256 (hex minúsculo) do conteúdo. */
  put(blob: Blob, target?: StemWriteTarget): Promise<string>;
  get(sha256: string, ref?: StemReadRef): Promise<Blob | null>;
  has(sha256: string, scope?: LibraryScope): Promise<boolean>;
}
