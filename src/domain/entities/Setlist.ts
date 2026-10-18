import { Song } from './Song';

export interface SetlistProps {
  id: string;
  name: string;
  serviceName: string; // ex: "Culto de Celebração - 19h", "Culto Fé", "Quinta da Vitória"
  date: string;
  songs: Song[];
  currentIndex?: number;
}

export class Setlist {
  public readonly id: string;
  public name: string;
  public serviceName: string;
  public date: string;
  public songs: Song[];
  public currentIndex: number;

  constructor(props: SetlistProps) {
    this.id = props.id;
    this.name = props.name;
    this.serviceName = props.serviceName;
    this.date = props.date;
    this.songs = props.songs;
    this.currentIndex = props.currentIndex ?? 0;
  }

  public get currentSong(): Song | null {
    if (this.songs.length === 0) return null;
    return this.songs[this.currentIndex] ?? null;
  }

  public nextSong(): Song | null {
    if (this.currentIndex < this.songs.length - 1) {
      this.currentIndex += 1;
      return this.currentSong;
    }
    return null;
  }

  public previousSong(): Song | null {
    if (this.currentIndex > 0) {
      this.currentIndex -= 1;
      return this.currentSong;
    }
    return null;
  }

  public selectSongByIndex(index: number): Song | null {
    if (index >= 0 && index < this.songs.length) {
      this.currentIndex = index;
      return this.currentSong;
    }
    return null;
  }

  public removeSongAt(index: number): Song | null {
    if (index < 0 || index >= this.songs.length) {
      return this.currentSong;
    }
    this.songs.splice(index, 1);
    if (this.songs.length === 0) {
      this.currentIndex = 0;
      return null;
    }
    if (this.currentIndex >= this.songs.length) {
      this.currentIndex = this.songs.length - 1;
    } else if (index < this.currentIndex) {
      this.currentIndex = Math.max(0, this.currentIndex - 1);
    }
    return this.currentSong;
  }

  public removeSongById(songId: string): Song | null {
    const idx = this.songs.findIndex(s => s.id === songId);
    if (idx === -1) return this.currentSong;
    return this.removeSongAt(idx);
  }

  public moveSong(fromIndex: number, toIndex: number): Song | null {
    if (
      fromIndex < 0 ||
      fromIndex >= this.songs.length ||
      toIndex < 0 ||
      toIndex >= this.songs.length ||
      fromIndex === toIndex
    ) {
      return this.currentSong;
    }
    const currentSongId = this.currentSong?.id;
    const [moved] = this.songs.splice(fromIndex, 1);
    if (moved) {
      this.songs.splice(toIndex, 0, moved);
    }
    if (currentSongId) {
      const newIdx = this.songs.findIndex(s => s.id === currentSongId);
      if (newIdx !== -1) {
        this.currentIndex = newIdx;
      }
    }
    return this.currentSong;
  }
}
