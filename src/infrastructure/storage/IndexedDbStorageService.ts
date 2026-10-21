import { Song } from '../../domain/entities/Song';
import { TrackStem, PitchPolicy } from '../../domain/entities/TrackStem';
import { SongSection, SectionType } from '../../domain/value-objects/SongSection';

const DB_NAME = 'lagoinha_vs_database';
const DB_VERSION = 2;
const STORE_SONGS = 'custom_songs';
const STORE_SETLISTS = 'saved_setlists';
const STORE_AUDIO_BLOBS = 'audio_blobs';

export interface StoragePersistenceStatus {
  isPersisted: boolean;
  quotaBytes?: number;
  usageBytes?: number;
  availableBytes?: number;
  supportStorageManager: boolean;
}

export interface OfflineReadinessResult {
  isComplete: boolean;
  totalBytes: number;
  availableStems: number;
  totalStems: number;
  missingStems: string[];
}

export interface SerializedStem {
  id: string;
  name: string;
  type: TrackStem['type'];
  volume: number;
  pan: number;
  isMuted: boolean;
  isSolo: boolean;
  pitchPolicy?: PitchPolicy;
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
  churchId?: string;
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

  public static checkStorageSupport(): { hasIndexedDb: boolean; hasStorageManager: boolean } {
    const hasIndexedDb = typeof window !== 'undefined' && 'indexedDB' in window;
    const hasStorageManager =
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof navigator.storage?.persist === 'function';
    return { hasIndexedDb, hasStorageManager };
  }

  public static async checkPersistenceStatus(): Promise<StoragePersistenceStatus> {
    const support = this.checkStorageSupport();
    if (!support.hasStorageManager) {
      return { isPersisted: false, supportStorageManager: false };
    }

    try {
      const isPersisted = await navigator.storage.persisted();
      let quotaBytes: number | undefined;
      let usageBytes: number | undefined;
      let availableBytes: number | undefined;

      if (navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        quotaBytes = estimate.quota;
        usageBytes = estimate.usage;
        if (quotaBytes !== undefined && usageBytes !== undefined) {
          availableBytes = Math.max(0, quotaBytes - usageBytes);
        }
      }

      return {
        isPersisted,
        quotaBytes,
        usageBytes,
        availableBytes,
        supportStorageManager: true
      };
    } catch {
      return { isPersisted: false, supportStorageManager: true };
    }
  }

  public static async requestPersistence(): Promise<boolean> {
    const support = this.checkStorageSupport();
    if (!support.hasStorageManager) return false;

    try {
      const granted = await navigator.storage.persist();
      return granted;
    } catch {
      return false;
    }
  }

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
        if (!db.objectStoreNames.contains(STORE_AUDIO_BLOBS)) {
          db.createObjectStore(STORE_AUDIO_BLOBS, { keyPath: 'key' });
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
        pitchPolicy: st.pitchPolicy,
        isPitchShiftable: st.isPitchShiftable,
        audioUrl: st.audioUrl,
        dsp: { ...st.dsp }
      })),
      churchId: song.churchId || 'lagoinha-jp',
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
        pitchPolicy: st.pitchPolicy,
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
      stems,
      churchId: data.churchId || 'lagoinha-jp'
    });
  }

  // --- MÉTODOS DE ÁUDIO BINÁRIO (BLOBS) PARA OPERAÇÃO 100% OFFLINE APÓS REINÍCIO ---

  public static async saveStemAudioBlob(songId: string, stemId: string, blob: Blob): Promise<void> {
    try {
      const db = await this.getDb();
      const key = `${songId}_${stemId}`;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_AUDIO_BLOBS, 'readwrite');
        const store = tx.objectStore(STORE_AUDIO_BLOBS);
        const req = store.put({ key, songId, stemId, blob, size: blob.size, mimeType: blob.type });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Erro ao salvar blob de áudio no IndexedDB:', err);
    }
  }

  public static async getStemAudioBlob(songId: string, stemId: string): Promise<Blob | null> {
    try {
      const db = await this.getDb();
      const key = `${songId}_${stemId}`;
      return await new Promise<Blob | null>((resolve) => {
        const tx = db.transaction(STORE_AUDIO_BLOBS, 'readonly');
        const store = tx.objectStore(STORE_AUDIO_BLOBS);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.blob) {
            resolve(req.result.blob as Blob);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  public static async deleteSongAudioBlobs(songId: string): Promise<void> {
    try {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_AUDIO_BLOBS, 'readwrite');
        const store = tx.objectStore(STORE_AUDIO_BLOBS);
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            if (cursor.value.songId === songId) {
              cursor.delete();
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Erro ao deletar blobs de áudio da música:', err);
    }
  }

  public static async verifySongOfflineReadiness(song: Song): Promise<OfflineReadinessResult> {
    let totalBytes = 0;
    let availableStems = 0;
    const missingStems: string[] = [];

    for (const stem of song.stems) {
      const blob = await this.getStemAudioBlob(song.id, stem.id);
      if (blob && blob.size > 0) {
        totalBytes += blob.size;
        availableStems++;
      } else if (stem.audioUrl && (stem.audioUrl.startsWith('/stems/') || stem.audioUrl.startsWith('./stems/'))) {
        // Arquivo local estático empacotado no PWA / assets
        availableStems++;
      } else if (stem.audioUrl && stem.audioUrl.startsWith('http')) {
        // URL remota na nuvem (Google Drive/Cloud) — NÃO está offline ainda!
        missingStems.push(`${stem.name} (Requer download da nuvem para uso offline)`);
      } else {
        missingStems.push(`${stem.name} (Binário ausente no IndexedDB — necessária reimportação)`);
      }
    }

    return {
      isComplete: missingStems.length === 0,
      totalBytes,
      availableStems,
      totalStems: song.stems.length,
      missingStems
    };
  }

  public static async rehydrateSongAudioUrls(song: Song): Promise<Song> {
    for (const stem of song.stems) {
      // Se já tinha um blob URL antigo e morto de sessão passada, revoga
      if (stem.audioUrl && stem.audioUrl.startsWith('blob:') && typeof window !== 'undefined' && window.URL) {
        try {
          URL.revokeObjectURL(stem.audioUrl);
        } catch {
          // ignore
        }
        stem.audioUrl = undefined;
      }

      const blob = await this.getStemAudioBlob(song.id, stem.id);
      if (blob && typeof window !== 'undefined' && window.URL) {
        stem.audioUrl = URL.createObjectURL(blob);
      }
    }
    return song;
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

  public static async loadCustomSongs(churchId?: string): Promise<Song[]> {
    // Sem igreja definida (login ainda não resolvido) não há acervo a mostrar: nunca "todas as igrejas".
    if (!churchId) return [];
    try {
      const db = await this.getDb();
      return await new Promise<Song[]>((resolve, reject) => {
        const tx = db.transaction(STORE_SONGS, 'readonly');
        const store = tx.objectStore(STORE_SONGS);
        const req = store.getAll();
        req.onsuccess = async () => {
          const list = (req.result as SerializedSong[]) || [];
          const filtered = list.filter((item) => (item.churchId || 'lagoinha-jp') === churchId);
          const deserialized = filtered.map((item) => this.deserializeSong(item));
          const rehydrated = await Promise.all(deserialized.map((s) => this.rehydrateSongAudioUrls(s)));
          resolve(rehydrated);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  /** Só apaga se a música pertence à igreja logada (o mesmo aparelho pode atender mais de uma igreja). */
  public static async deleteCustomSong(songId: string, churchId: string | undefined): Promise<void> {
    if (!churchId) return;
    try {
      const db = await this.getDb();
      const deleted = await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(STORE_SONGS, 'readwrite');
        const store = tx.objectStore(STORE_SONGS);
        const getReq = store.get(songId);
        getReq.onsuccess = () => {
          const record = getReq.result as SerializedSong | undefined;
          if (!record || (record.churchId || 'lagoinha-jp') !== churchId) {
            resolve(false);
            return;
          }
          const delReq = store.delete(songId);
          delReq.onsuccess = () => resolve(true);
          delReq.onerror = () => reject(delReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
      if (deleted) await this.deleteSongAudioBlobs(songId);
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
