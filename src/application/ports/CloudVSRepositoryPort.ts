import { CloudSong } from '../../domain/entities/CloudSong';
import { Song } from '../../domain/entities/Song';

export interface CloudVSRepositoryPort {
  listAllSongs(): Promise<CloudSong[]>;
  searchSongs(query: string, filterKey?: string): Promise<CloudSong[]>;
  getSongById(id: string): Promise<CloudSong | null>;
  convertCloudSongToPlaybackSong(cloudSong: CloudSong): Promise<Song>;
  uploadSong(newSong: Partial<CloudSong>, files: File[]): Promise<CloudSong>;
}
