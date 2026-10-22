import { CatalogIngestQueue, CatalogWriter } from './CatalogIngestQueue';

/** Linha do painel: o que está no catálogo e em que estado (lido como curador). */
export interface CatalogEntry {
  songId: string;
  title: string;
  artist: string;
  key: string | null;
  bpm: number | null;
  status: 'pending' | 'ready' | 'published' | 'withdrawn';
  stemsCount: number;
  draftVersionId?: string;
  currentVersionId?: string;
  publishedManifestSha256?: string;
  updatedAt: string;
}

/** O que o painel /admin/acervo usa do backend (só existe com Firebase + Worker). */
export interface CatalogAdminPort extends CatalogWriter {
  isCurator(): Promise<boolean>;
  list(): Promise<CatalogEntry[]>;
}

export interface CatalogAdminServices {
  admin: CatalogAdminPort;
  /** Uma fila por página do painel (os arquivos selecionados vivem só na memória dela). */
  createQueue(): CatalogIngestQueue;
}
