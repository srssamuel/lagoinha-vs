import { DeviceCachePort } from '../ports/DeviceCachePort';
import { churchScope, GLOBAL_SCOPE, LibraryScope, SongLibraryPort } from '../ports/SongLibraryPort';
import { CloudSong } from '../../domain/entities/CloudSong';
import { ServiceSetlist, ServiceSetlistItem } from '../../domain/entities/ServiceSetlist';
import { Song } from '../../domain/entities/Song';
import { formatCloudSongKey } from '../../domain/services/CloudSongKey';

export interface PreparedItem {
  order: number;
  songId: string;
  versionId: string;
  song: Song;
}

export interface FailedItem {
  order: number;
  songId: string;
  versionId: string;
  reason: string;
}

export interface PrepareReport {
  setlistId: string;
  revision: number;
  prepared: PreparedItem[];
  failed: FailedItem[];
}

/** Lê os bytes de um stem já resolvido (blob: do acervo); trocável nos testes. */
export type AudioReader = (url: string) => Promise<Blob>;

const defaultReader: AudioReader = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`stem indisponível (${res.status})`);
  return res.blob();
};

function scopeOf(item: ServiceSetlistItem, churchId: string): LibraryScope {
  return item.source === 'global' ? GLOBAL_SCOPE : churchScope(churchId);
}

/**
 * Preparar o culto (F4): baixa a versão EXATA de cada música do setlist pelo acervo (Worker/R2),
 * grava metadados e áudio no aparelho e devolve as músicas prontas para tocar sem internet.
 * A música preparada ganha id com a versão: atualizar o acervo depois não mexe no que foi ensaiado.
 * Falha de uma música não derruba as outras; o relatório diz qual faltou e por quê.
 */
export class PrepareServiceUseCase {
  constructor(
    private readonly library: SongLibraryPort,
    private readonly deviceCache: DeviceCachePort,
    private readonly readAudio: AudioReader = defaultReader
  ) {}

  public async prepare(setlist: ServiceSetlist, onProgress?: (done: number, total: number) => void): Promise<PrepareReport> {
    const items = [...setlist.items].sort((a, b) => a.order - b.order);
    const report: PrepareReport = { setlistId: setlist.id, revision: setlist.revision, prepared: [], failed: [] };
    let done = 0;
    for (const item of items) {
      try {
        report.prepared.push({ ...this.ids(item), song: await this.prepareItem(item, setlist.churchId) });
      } catch (err) {
        report.failed.push({ ...this.ids(item), reason: err instanceof Error ? err.message : String(err) });
      }
      onProgress?.(++done, items.length);
    }
    return report;
  }

  private ids(item: ServiceSetlistItem) {
    return { order: item.order, songId: item.songId, versionId: item.versionId };
  }

  public async prepareItem(item: ServiceSetlistItem, churchId: string): Promise<Song> {
    const scope = scopeOf(item, churchId);
    const cloudSong = await this.library.getById(scope, item.songId);
    if (!cloudSong) throw new Error('música não está mais no acervo');
    const playback = await this.library.toPlaybackSong(scope, cloudSong as CloudSong, item.versionId);

    const id = formatCloudSongKey({ source: item.source, songId: item.songId, versionId: item.versionId });
    const prepared = new Song({
      id,
      title: playback.title,
      artist: playback.artist,
      originalKey: playback.originalKey,
      currentKey: item.keyOverride ?? playback.currentKey,
      bpm: item.bpmOverride ?? playback.bpm,
      timeSignature: playback.timeSignature,
      duration: playback.duration,
      sections: playback.sections,
      stems: playback.stems,
      churchId
    });

    const blobs: { stemId: string; blob: Blob }[] = [];
    for (const stem of prepared.stems) {
      if (!stem.audioUrl) throw new Error(`stem "${stem.name}" sem áudio`);
      blobs.push({ stemId: stem.id, blob: await this.readAudio(stem.audioUrl) });
    }
    // Só grava a música depois de ter todo o áudio: nunca fica meio preparada no aparelho.
    for (const { stemId, blob } of blobs) await this.deviceCache.saveStemAudioBlob(id, stemId, blob);
    await this.deviceCache.saveCustomSong(prepared);
    return prepared;
  }
}
