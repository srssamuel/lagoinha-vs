import { describe, expect, it } from 'vitest';
import { PrepareServiceUseCase } from '../../../src/application/service/PrepareServiceUseCase';
import { DeviceCachePort } from '../../../src/application/ports/DeviceCachePort';
import { LibraryScope, SongLibraryPort } from '../../../src/application/ports/SongLibraryPort';
import { CloudSong } from '../../../src/domain/entities/CloudSong';
import { ServiceSetlist } from '../../../src/domain/entities/ServiceSetlist';
import { Song } from '../../../src/domain/entities/Song';
import { TrackStem } from '../../../src/domain/entities/TrackStem';
import { formatCloudSongKey, parseCloudSongKey } from '../../../src/domain/services/CloudSongKey';

/** Acervo com versões imutáveis: v1 e v2 da mesma música têm áudios diferentes. */
class FakeLibrary implements SongLibraryPort {
  public requests: string[] = [];
  async list(): Promise<CloudSong[]> {
    return [];
  }
  async search(): Promise<CloudSong[]> {
    return [];
  }
  async getById(_scope: LibraryScope, id: string): Promise<CloudSong | null> {
    if (id === 'apagada') return null;
    return new CloudSong({
      id,
      title: id,
      artist: 'A',
      originalKey: 'G',
      bpm: 70,
      timeSignature: { beats: 4, value: 4 },
      duration: 200,
      stemsCount: 2,
      stems: [],
      tags: [],
      uploadedBy: 'u',
      uploadedAt: '',
      storageFolder: '',
      currentVersionId: 'v2'
    });
  }
  async toPlaybackSong(scope: LibraryScope, song: CloudSong, versionId?: string): Promise<Song> {
    const v = versionId ?? song.currentVersionId!;
    this.requests.push(`${scope.kind}:${song.id}@${v}`);
    if (song.id === 'quebrada') throw new Error('Música pendente: sem BPM válido.');
    return new Song({
      id: `tmp-${song.id}`,
      title: song.title,
      artist: 'A',
      originalKey: 'G',
      currentKey: 'G',
      bpm: 70,
      timeSignature: { beats: 4, value: 4 },
      duration: 200,
      sections: [],
      stems: ['click', 'bass'].map(
        (type) =>
          new TrackStem({ id: `${song.id}-${type}`, name: type, type: type as 'click', volume: 1, pan: 0, isMuted: false, isSolo: false, audioUrl: `blob:${song.id}/${v}/${type}` })
      )
    });
  }
  async upload(): Promise<CloudSong> {
    throw new Error('não usado');
  }
}

class MemoryCache implements DeviceCachePort {
  public songs = new Map<string, Song>();
  public blobs = new Map<string, string>();
  async loadCustomSongs(): Promise<Song[]> {
    return [...this.songs.values()];
  }
  async saveCustomSong(song: Song): Promise<void> {
    this.songs.set(song.id, song);
  }
  async deleteCustomSong(id: string): Promise<void> {
    this.songs.delete(id);
  }
  async saveStemAudioBlob(songId: string, stemId: string, blob: Blob): Promise<void> {
    this.blobs.set(`${songId}/${stemId}`, await blob.text());
  }
}

const setlist = (items: ServiceSetlist['items']): ServiceSetlist => ({
  id: 'culto-1',
  churchId: 'lagoinha-jp',
  title: 'Domingo',
  serviceDate: '2026-10-25',
  status: 'published',
  revision: 3,
  updatedBy: 'lider',
  updatedAt: '',
  items
});

const reader = async (url: string) => new Blob([url]);

describe('PrepareServiceUseCase (F4)', () => {
  it('baixa a versão do setlist, não a atual, e grava áudio e música no aparelho', async () => {
    const library = new FakeLibrary();
    const cache = new MemoryCache();
    const report = await new PrepareServiceUseCase(library, cache, reader).prepare(
      setlist([{ order: 1, source: 'church', songId: 'casa', versionId: 'v1', keyOverride: 'A' }])
    );
    expect(library.requests).toEqual(['church:casa@v1']);
    expect(report.failed).toEqual([]);
    const id = formatCloudSongKey({ source: 'church', songId: 'casa', versionId: 'v1' });
    expect(report.prepared[0]!.song.id).toBe(id);
    expect(report.prepared[0]!.song.currentKey).toBe('A');
    expect(cache.songs.has(id)).toBe(true);
    expect(cache.blobs.get(`${id}/casa-bass`)).toBe('blob:casa/v1/bass');
  });

  it('versão nova no acervo não substitui a preparada: as duas convivem com ids diferentes', async () => {
    const cache = new MemoryCache();
    const useCase = new PrepareServiceUseCase(new FakeLibrary(), cache, reader);
    await useCase.prepare(setlist([{ order: 1, source: 'church', songId: 'casa', versionId: 'v1' }]));
    await useCase.prepare(setlist([{ order: 1, source: 'church', songId: 'casa', versionId: 'v2' }]));
    const ids = [...cache.songs.keys()].map((k) => parseCloudSongKey(k)?.versionId).sort();
    expect(ids).toEqual(['v1', 'v2']);
    expect(cache.blobs.get(`${formatCloudSongKey({ source: 'church', songId: 'casa', versionId: 'v1' })}/casa-click`)).toBe('blob:casa/v1/click');
  });

  it('uma música com problema não derruba as outras e o motivo aparece', async () => {
    const cache = new MemoryCache();
    const progress: string[] = [];
    const report = await new PrepareServiceUseCase(new FakeLibrary(), cache, reader).prepare(
      setlist([
        { order: 2, source: 'church', songId: 'quebrada', versionId: 'v1' },
        { order: 1, source: 'global', songId: 'casa', versionId: 'v2' },
        { order: 3, source: 'church', songId: 'apagada', versionId: 'v1' }
      ]),
      (done, total) => progress.push(`${done}/${total}`)
    );
    expect(report.prepared.map((p) => p.order)).toEqual([1]);
    expect(report.failed.map((f) => [f.order, f.reason])).toEqual([
      [2, 'Música pendente: sem BPM válido.'],
      [3, 'música não está mais no acervo']
    ]);
    expect(progress).toEqual(['1/3', '2/3', '3/3']);
    expect(cache.songs.size).toBe(1);
  });

  it('se um stem falha no download, a música não fica meio gravada', async () => {
    const cache = new MemoryCache();
    const failing = async (url: string) => {
      if (url.endsWith('/bass')) throw new Error('rede caiu');
      return new Blob([url]);
    };
    const report = await new PrepareServiceUseCase(new FakeLibrary(), cache, failing).prepare(
      setlist([{ order: 1, source: 'church', songId: 'casa', versionId: 'v1' }])
    );
    expect(report.failed[0]!.reason).toBe('rede caiu');
    expect(cache.songs.size).toBe(0);
    expect(cache.blobs.size).toBe(0);
  });

  it('chave do acervo rejeita ids que quebrariam o formato', () => {
    expect(() => formatCloudSongKey({ source: 'church', songId: 'a@b', versionId: 'v1' })).toThrow();
    expect(parseCloudSongKey('preset-123')).toBeNull();
  });
});
