import { Song } from '../../domain/entities/Song';

/**
 * O que o aparelho guarda para tocar sem internet (ENG-01). Sempre local, em qualquer backend.
 * Fachada fina do IndexedDbStorageService para os casos de uso serem testáveis.
 */
export interface DeviceCachePort {
  loadCustomSongs(churchId: string | undefined): Promise<Song[]>;
  saveCustomSong(song: Song): Promise<void>;
  deleteCustomSong(songId: string, churchId: string | undefined): Promise<void>;
  saveStemAudioBlob(songId: string, stemId: string, blob: Blob): Promise<void>;
}
