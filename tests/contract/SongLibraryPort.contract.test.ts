import { describe, it, expect } from 'vitest';
import { churchScope, GLOBAL_SCOPE, SongLibraryPort } from '../../src/application/ports/SongLibraryPort';
import { LocalSongLibraryAdapter } from '../../src/infrastructure/library/LocalSongLibraryAdapter';

/**
 * Contrato da SongLibraryPort. Hoje roda contra o adaptador local; na F2 o
 * FirestoreSongLibraryAdapter (no emulador) entra na mesma lista.
 */
const adapters: Array<[string, () => SongLibraryPort]> = [['LocalSongLibraryAdapter', () => new LocalSongLibraryAdapter()]];

const stemFile = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'audio/mpeg' });

describe.each(adapters)('SongLibraryPort: %s', (_name, make) => {
  it('upload na biblioteca da igreja aparece só para aquela igreja', async () => {
    const library = make();
    const created = await library.upload(churchScope('igreja-a'), { title: 'Ensaio A' }, [stemFile('click.mp3')]);

    expect((await library.list(churchScope('igreja-a'))).map((s) => s.id)).toContain(created.id);
    expect((await library.list(churchScope('igreja-b'))).map((s) => s.id)).not.toContain(created.id);
    expect((await library.list(GLOBAL_SCOPE)).map((s) => s.id)).not.toContain(created.id);
    expect(await library.getById(churchScope('igreja-b'), created.id)).toBeNull();
  });

  it('origem não informada entra como unknown', async () => {
    const library = make();
    const created = await library.upload(churchScope('igreja-a'), { title: 'Sem documento' }, [stemFile('bass.mp3')]);
    expect(created.rightsClass).toBe('unknown');
  });

  it('I4: catálogo global recusa unknown, church_purchased e própria sem documento', async () => {
    const library = make();
    const files = [stemFile('drums.mp3')];
    await expect(library.upload(GLOBAL_SCOPE, { title: 'X' }, files)).rejects.toThrow(/catálogo global/);
    await expect(
      library.upload(GLOBAL_SCOPE, { title: 'X', rightsClass: 'church_purchased' }, files)
    ).rejects.toThrow(/catálogo global/);
    await expect(library.upload(GLOBAL_SCOPE, { title: 'X', rightsClass: 'own' }, files)).rejects.toThrow(
      /catálogo global/
    );
  });

  it('catálogo global aceita material próprio com documento de licença', async () => {
    const library = make();
    const created = await library.upload(
      GLOBAL_SCOPE,
      {
        title: 'Gravação própria',
        rightsClass: 'own',
        licenseRef: { holder: 'Lagoinha JP', documentId: 'DOC-1', scope: 'todas as igrejas' }
      },
      [stemFile('guide.mp3')]
    );
    expect((await library.list(GLOBAL_SCOPE)).map((s) => s.id)).toContain(created.id);
  });

  it('igreja B não converte para o player a música da igreja A', async () => {
    const library = make();
    const created = await library.upload(churchScope('igreja-a'), { title: 'Só da A' }, [stemFile('keys.mp3')]);
    await expect(library.toPlaybackSong(churchScope('igreja-b'), created)).rejects.toThrow();
    const song = await library.toPlaybackSong(churchScope('igreja-a'), created);
    expect(song.id).toBe(created.id);
    expect(song.stems.length).toBe(1);
  });

  it('busca respeita a prateleira', async () => {
    const library = make();
    await library.upload(churchScope('igreja-a'), { title: 'Aleluia Ensaio' }, [stemFile('pad.mp3')]);
    expect((await library.search(churchScope('igreja-a'), 'aleluia')).length).toBe(1);
    expect((await library.search(churchScope('igreja-b'), 'aleluia')).length).toBe(0);
  });
});
