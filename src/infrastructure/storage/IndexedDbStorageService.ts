import { Song } from '../../domain/entities/Song';
import { TrackStem } from '../../domain/entities/TrackStem';
import { SongSection, SectionType } from '../../domain/value-objects/SongSection';

const DB_NAME = 'lagoinha_vs_database';
const DB_VERSION = 1;
const STORE_SONGS = 'custom_songs';
const STORE_SETLISTS = 'saved_setlists';

export interface SerializedStem {
  id: string;
  name: string;
  type: TrackStem['type'];
  volume: number;
  pan: number;
  isMuted: boolean;
  isSolo: boolean;
  isPitchShiftable: boolean;
  audioUrl?: string;
  dsp?: Record<string, unknown>;
}

export interface SerializedSection {
  id: string;
  name: string;
  type: SectionType;
  startBar: number;
  barCount: number;
  startTime: number;
  endTime: number;
}

export interface SerializedSong {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  currentKey: string;
  bpm: number;
  timeSignature: { beats: number; value: number };
  duration: number;
  sections: SerializedSection[];
  stems: SerializedStem[];
  updatedAt?: string;
}

export interface SetlistBackupFile {
  version: string;
  app: 'Lagoinha VS';
  serviceName: string;
  exportedAt: string;
  songs: SerializedSong[];
}

export class IndexedDbStorageService {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB não suportado neste navegador.'));
        return;
      }

      const req = window.indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_SONGS)) {
          db.createObjectStore(STORE_SONGS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SETLISTS)) {
          db.createObjectStore(STORE_SETLISTS, { keyPath: 'name' });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  public static serializeSong(song: Song): SerializedSong {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      originalKey: song.originalKey,
      currentKey: song.currentKey,
      bpm: song.bpm,
      timeSignature: song.timeSignature,
      duration: song.duration,
      sections: song.sections.map((sec) => ({
        id: sec.id,
        name: sec.name,
        type: sec.type,
        startBar: sec.startBar,
        barCount: sec.barCount,
        startTime: sec.startTime,
        endTime: sec.endTime
      })),
      stems: song.stems.map((st) => ({
        id: st.id,
        name: st.name,
        type: st.type,
        volume: st.volume,
        pan: st.pan,
        isMuted: st.isMuted,
        isSolo: st.isSolo,
        isPitchShiftable: st.isPitchShiftable,
        audioUrl: st.audioUrl,
        dsp: { ...st.dsp }
      })),
      updatedAt: new Date().toISOString()
    };
  }

  public static deserializeSong(data: SerializedSong): Song {
    const sections = data.sections.map(
      (sec) =>
        new SongSection({
          id: sec.id,
          name: sec.name,
          type: sec.type,
          startBar: sec.startBar,
          barCount: sec.barCount,
          startTime: sec.startTime,
          endTime: sec.endTime
        })
    );

    const stems = data.stems.map((st) => {
      const stem = new TrackStem({
        id: st.id,
        name: st.name,
        type: st.type,
        volume: st.volume,
        pan: st.pan,
        isMuted: st.isMuted,
        isSolo: st.isSolo,
        isPitchShiftable: st.isPitchShiftable,
        audioUrl: st.audioUrl
      });
      if (st.dsp) {
        stem.setDsp(st.dsp as Parameters<typeof stem.setDsp>[0]);
      }
      return stem;
    });

    return new Song({
      id: data.id,
      title: data.title,
      artist: data.artist,
      originalKey: data.originalKey,
      currentKey: data.currentKey || data.originalKey,
      bpm: data.bpm,
      timeSignature: data.timeSignature || { beats: 4, value: 4 },
      duration: data.duration,
      sections,
      stems
    });
  }

  public static async saveCustomSong(song: Song): Promise<void> {
    try {
      const db = await this.getDb();
      const serialized = this.serializeSong(song);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SONGS, 'readwrite');
        const store = tx.objectStore(STORE_SONGS);
        const req = store.put(serialized);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Erro ao salvar música customizada no IndexedDB:', err);
    }
  }

  public static async loadCustomSongs(): Promise<Song[]> {
    try {
      const db = await this.getDb();
      return await new Promise<Song[]>((resolve, reject) => {
        const tx = db.transaction(STORE_SONGS, 'readonly');
        const store = tx.objectStore(STORE_SONGS);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result as SerializedSong[]) || [];
          resolve(list.map((item) => this.deserializeSong(item)));
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  public static async deleteCustomSong(songId: string): Promise<void> {
    try {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SONGS, 'readwrite');
        const store = tx.objectStore(STORE_SONGS);
        const req = store.delete(songId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Erro ao deletar música do IndexedDB:', err);
    }
  }

  public static exportSetlistToJson(songs: Song[], serviceName = 'Culto de Celebração'): string {
    const backup: SetlistBackupFile = {
      version: '1.0.0',
      app: 'Lagoinha VS',
      serviceName,
      exportedAt: new Date().toISOString(),
      songs: songs.map((s) => this.serializeSong(s))
    };
    return JSON.stringify(backup, null, 2);
  }

  public static importSetlistFromJson(jsonStr: string): Song[] {
    const parsed = JSON.parse(jsonStr) as SetlistBackupFile;
    if (!parsed || !Array.isArray(parsed.songs)) {
      throw new Error('Arquivo JSON de setlist inválido ou formato incompatível.');
    }
    return parsed.songs.map((s) => this.deserializeSong(s));
  }

  public static downloadJsonFile(content: string, filename = 'repertorio-lagoinha-vs.json'): void {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
