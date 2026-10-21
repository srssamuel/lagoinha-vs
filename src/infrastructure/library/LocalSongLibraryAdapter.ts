import { CloudSong } from '../../domain/entities/CloudSong';
import { Song } from '../../domain/entities/Song';
import { isCatalogEligible } from '../../domain/services/AccessPolicy';
import { LibraryScope, SongLibraryPort } from '../../application/ports/SongLibraryPort';
import type { DemoCloudVSLibrary } from '../mock/DemoCloudVSLibrary';

type LibraryModule = typeof import('../mock/DemoCloudVSLibrary');

/** O acervo de demonstração só baixa quando a biblioteca é aberta (fica fora do bundle inicial). */
const loadDemoModule = (): Promise<LibraryModule> => import('../mock/DemoCloudVSLibrary');

/**
 * Acervo local, sem nuvem (F0): o catálogo global é o acervo de demonstração; cada igreja
 * tem a sua prateleira em memória, isolada das outras. Na F2 dá lugar ao Firestore.
 * As músicas de demonstração do catálogo ficam com rightsClass `unknown`: são material de teste,
 * não conteúdo distribuível; a regra I4 vale para o que é enviado (upload).
 */
export class LocalSongLibraryAdapter implements SongLibraryPort {
  private catalog: DemoCloudVSLibrary | null = null;
  private readonly churches = new Map<string, DemoCloudVSLibrary>();

  constructor(private readonly loadModule: () => Promise<LibraryModule> = loadDemoModule) {}

  private async shelf(scope: LibraryScope): Promise<DemoCloudVSLibrary> {
    if (scope.kind === 'church' && !scope.churchId) throw new Error('Biblioteca da igreja exige churchId.');
    const { DemoCloudVSLibrary } = await this.loadModule();
    if (scope.kind === 'global') {
      this.catalog ??= new DemoCloudVSLibrary();
      return this.catalog;
    }
    let shelf = this.churches.get(scope.churchId);
    if (!shelf) {
      shelf = new DemoCloudVSLibrary({ seed: false });
      this.churches.set(scope.churchId, shelf);
    }
    return shelf;
  }

  public async list(scope: LibraryScope): Promise<CloudSong[]> {
    return (await this.shelf(scope)).listAllSongs();
  }

  public async search(scope: LibraryScope, query: string, filterKey?: string): Promise<CloudSong[]> {
    return (await this.shelf(scope)).searchSongs(query, filterKey);
  }

  public async getById(scope: LibraryScope, id: string): Promise<CloudSong | null> {
    return (await this.shelf(scope)).getSongById(id);
  }

  public async toPlaybackSong(scope: LibraryScope, song: CloudSong): Promise<Song> {
    // Só converte o que existe naquela prateleira: igreja A não toca a música da igreja B pelo id.
    const shelf = await this.shelf(scope);
    const found = await shelf.getSongById(song.id);
    if (!found) throw new Error('Música não encontrada nesta biblioteca.');
    return shelf.convertCloudSongToPlaybackSong(found);
  }

  public async upload(scope: LibraryScope, draft: Partial<CloudSong>, files: File[]): Promise<CloudSong> {
    const rightsClass = draft.rightsClass ?? 'unknown';
    if (scope.kind === 'global' && !isCatalogEligible(rightsClass, draft.licenseRef)) {
      throw new Error(
        'O catálogo global só aceita material próprio ou licenciado para redistribuição, com documento de licença.'
      );
    }
    return (await this.shelf(scope)).uploadSong({ ...draft, rightsClass }, files);
  }
}
