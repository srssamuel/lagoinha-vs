import { Song } from '../../domain/entities/Song';
import { DeviceCachePort } from '../../application/ports/DeviceCachePort';
import { IndexedDbStorageService } from './IndexedDbStorageService';

/** DeviceCachePort sobre o IndexedDB atual (ENG-01): o aparelho sempre toca do que está aqui. */
export class IndexedDbDeviceCache implements DeviceCachePort {
  public loadCustomSongs(churchId: string | undefined): Promise<Song[]> {
    return IndexedDbStorageService.loadCustomSongs(churchId);
  }

  public saveCustomSong(song: Song): Promise<void> {
    return IndexedDbStorageService.saveCustomSong(song);
  }

  public deleteCustomSong(songId: string, churchId: string | undefined): Promise<void> {
    return IndexedDbStorageService.deleteCustomSong(songId, churchId);
  }

  public saveStemAudioBlob(songId: string, stemId: string, blob: Blob): Promise<void> {
    return IndexedDbStorageService.saveStemAudioBlob(songId, stemId, blob);
  }
}
