/**
 * Arquivos de áudio guardados por conteúdo (spec-banco-online, seção 3: stems/{sha256}).
 * O mesmo arquivo nunca é duplicado e quem baixa confere a integridade pelo sha256.
 * Local: LocalStemStore. Produção (F3): R2WorkerStemStore.
 */
export interface StemBlobPort {
  /** Grava e devolve o sha256 (hex minúsculo) do conteúdo. */
  put(blob: Blob): Promise<string>;
  get(sha256: string): Promise<Blob | null>;
  has(sha256: string): Promise<boolean>;
}
