import { CloudSong } from '../../domain/entities/CloudSong';
import { Song } from '../../domain/entities/Song';

/** Prateleira do acervo: catálogo global (todas as igrejas) ou biblioteca privada de uma igreja. */
export type LibraryScope = { kind: 'global' } | { kind: 'church'; churchId: string };

export const GLOBAL_SCOPE: LibraryScope = { kind: 'global' };

export function churchScope(churchId: string): LibraryScope {
  return { kind: 'church', churchId };
}

/**
 * Evolução de CloudVSRepositoryPort (spec-banco-online, seção 8): as mesmas operações, com escopo.
 * Local: LocalSongLibraryAdapter. Produção (F2/F3): FirestoreSongLibraryAdapter.
 */
export interface SongLibraryPort {
  list(scope: LibraryScope): Promise<CloudSong[]>;
  search(scope: LibraryScope, query: string, filterKey?: string): Promise<CloudSong[]>;
  getById(scope: LibraryScope, id: string): Promise<CloudSong | null>;
  toPlaybackSong(scope: LibraryScope, song: CloudSong): Promise<Song>;
  /** No catálogo global só entra material com direito de redistribuição documentado (I4). */
  upload(scope: LibraryScope, draft: Partial<CloudSong>, files: File[]): Promise<CloudSong>;
}
