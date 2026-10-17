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
}
