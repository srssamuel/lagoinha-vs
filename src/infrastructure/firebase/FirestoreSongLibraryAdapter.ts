import { keyFromStored, keyMetaOf } from '../../domain/value-objects/SongKey';
import {
  collection,
  doc,
  DocumentData,
  Firestore,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { LibraryScope, SongLibraryPort } from '../../application/ports/SongLibraryPort';
import { StemBlobPort } from '../../application/ports/StemBlobPort';
import { CloudSong, CloudStemInfo } from '../../domain/entities/CloudSong';
import { Song, TimeSignature } from '../../domain/entities/Song';
import { StemType, TrackStem } from '../../domain/entities/TrackStem';
import { isCatalogEligible } from '../../domain/services/AccessPolicy';
import { inferSectionType, inferStemType } from '../../domain/services/StemNameClassifier';
import { formatCloudSongKey } from '../../domain/services/CloudSongKey';
import { SongSection } from '../../domain/value-objects/SongSection';
import { probeAudioDuration } from '../audio/probeAudioDuration';

/** Item de `versions/{id}.stems` (contrato-stems-worker, seção 7). */
export interface VersionStem {
  sha256: string;
  name: string;
  type: StemType;
  size: number;
  contentType: string;
}

interface VersionSection {
  name: string;
  startSec: number;
  endSec: number;
}

function songsPath(scope: LibraryScope): string[] {
  return scope.kind === 'global' ? ['catalog'] : ['churches', scope.churchId, 'library'];
}

function iso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return typeof value === 'string' ? value : new Date(0).toISOString();
}

function timeSignatureOf(value: unknown): TimeSignature {
  const ts = value as Partial<TimeSignature> | undefined;
  return ts && typeof ts.beats === 'number' && typeof ts.value === 'number' ? { beats: ts.beats, value: ts.value } : { beats: 4, value: 4 };
}

function stemInfo(stem: VersionStem): CloudStemInfo {
  return { id: stem.sha256, name: stem.name, type: stem.type, fileSizeMb: Math.round((stem.size / 1048576) * 10) / 10 };
}

/** O que falta para o pacote tocar no palco (contrato, seção 7). Vazio = pronto. */
export function missingForPlayback(bpm: number, stems: VersionStem[]): string | null {
  if (!(bpm > 30 && bpm < 300)) return 'sem BPM válido';
  if (stems.length === 0) return 'sem stems';
  if (!stems.some((s) => s.type !== 'click' && s.type !== 'guide')) return 'sem stem de banda (só click/guia)';
  return null;
}

/**
 * Biblioteca da igreja (churches/{id}/library) e catálogo global (catalog/) no Firestore.
 * Versões são imutáveis; o arquivo de cada stem é buscado pelo StemBlobPort com a prova da versão.
 */
export class FirestoreSongLibraryAdapter implements SongLibraryPort {
  constructor(
    private readonly db: Firestore,
    private readonly stems: StemBlobPort,
    private readonly currentUid: () => string | null,
    private readonly objectUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob)
  ) {}

  private toCloudSong(id: string, data: DocumentData, stems: VersionStem[] = []): CloudSong {
    return new CloudSong({
      id,
      title: String(data.title ?? 'Sem título'),
      artist: String(data.artist ?? ''),
      originalKey: keyFromStored(data.originalKey, data.keyMeta).value,
      keyInfo: keyFromStored(data.originalKey, data.keyMeta),
      bpm: typeof data.bpm === 'number' ? data.bpm : 0,
      timeSignature: timeSignatureOf(data.timeSignature),
      duration: typeof data.durationSec === 'number' ? data.durationSec : 0,
      stemsCount: typeof data.stemsCount === 'number' ? data.stemsCount : stems.length,
      stems: stems.map(stemInfo),
      tags: Array.isArray(data.tags) ? data.tags.filter((t: unknown): t is string => typeof t === 'string') : [],
      uploadedBy: String(data.createdBy ?? ''),
      uploadedAt: iso(data.createdAt),
      storageFolder: '',
      source: 'cloud_preset',
      rightsClass: data.rightsClass ?? 'unknown',
      licenseRef: data.licenseRef,
      status: data.status === 'pending' || !data.currentVersionId ? 'pending' : 'ready',
      pendingReason: typeof data.pendingReason === 'string' ? data.pendingReason : data.currentVersionId ? undefined : 'sem versão publicada',
      currentVersionId: typeof data.currentVersionId === 'string' ? data.currentVersionId : undefined,
      kind: data.kind === 'pad' ? 'pad' : 'song'
    });
  }

  public async list(scope: LibraryScope): Promise<CloudSong[]> {
    const songs = collection(this.db, songsPath(scope).join('/'));
    // Catálogo: quem não é curador só enxerga o que foi publicado (regra I7); rascunho fica no painel do acervo.
    const snap = await getDocs(scope.kind === 'global' ? query(songs, where('status', '==', 'published')) : songs);
    return snap.docs
      .map((d) => this.toCloudSong(d.id, d.data()))
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  }

  public async search(scope: LibraryScope, queryText: string, filterKey?: string): Promise<CloudSong[]> {
    const q = queryText
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return (await this.list(scope)).filter(
      (s) =>
        (!q || fold(`${s.title} ${s.artist} ${s.tags.join(' ')}`).includes(q)) &&
        (!filterKey || filterKey === 'all' || s.originalKey === filterKey)
    );
  }

  public async getById(scope: LibraryScope, id: string): Promise<CloudSong | null> {
    const snap = await getDoc(doc(this.db, ...(songsPath(scope) as [string]), id));
    if (!snap.exists()) return null;
    const data = snap.data();
    const stems = data.currentVersionId ? await this.versionStems(scope, id, data.currentVersionId) : [];
    return this.toCloudSong(id, data, stems);
  }

  private async readVersion(scope: LibraryScope, songId: string, versionId: string): Promise<DocumentData | null> {
    const snap = await getDoc(doc(this.db, ...(songsPath(scope) as [string]), songId, 'versions', versionId));
    return snap.exists() ? snap.data() : null;
  }

  private async versionStems(scope: LibraryScope, songId: string, versionId: string): Promise<VersionStem[]> {
    const version = await this.readVersion(scope, songId, versionId);
    return Array.isArray(version?.stems) ? (version.stems as VersionStem[]) : [];
  }

  public async toPlaybackSong(scope: LibraryScope, song: CloudSong, versionId?: string): Promise<Song> {
    const snap = await getDoc(doc(this.db, ...(songsPath(scope) as [string]), song.id));
    if (!snap.exists()) throw new Error('Música não encontrada nesta biblioteca.');
    const data = snap.data();
    const chosen = versionId ?? (typeof data.currentVersionId === 'string' ? data.currentVersionId : undefined);
    if (!chosen) throw new Error(`Música pendente: ${data.pendingReason ?? 'sem versão publicada'}.`);
    const version = await this.readVersion(scope, song.id, chosen);
    if (!version) throw new Error('A versão desta música não existe mais no acervo.');

    const stems = (Array.isArray(version.stems) ? version.stems : []) as VersionStem[];
    const bpm = typeof data.bpm === 'number' ? data.bpm : 0;
    const missing = missingForPlayback(bpm, stems);
    if (missing) throw new Error(`Música pendente: ${missing}.`);
    const timeSignature = timeSignatureOf(data.timeSignature);
    const secondsPerBar = (60 / bpm) * timeSignature.beats;

    const loaded = await Promise.all(
      stems.map(async (stem, index) => {
        const blob = await this.stems.get(stem.sha256, { scope, songId: song.id, versionId: chosen });
        if (!blob) throw new Error(`Arquivo do stem "${stem.name}" não está no acervo.`);
        const track = new TrackStem({
          id: `${song.id}-${index}-${stem.sha256.slice(0, 8)}`,
          name: stem.name,
          type: stem.type,
          volume: 1,
          pan: 0,
          isMuted: false,
          isSolo: false,
          audioUrl: this.objectUrl(blob)
        });
        return { track, blob };
      })
    );
    const tracks = loaded.map((l) => l.track);
    // O migrador só mede a duração de WAV; mp3/m4a chegam sem durationSec e o motor encerraria a música no instante 0.
    let duration = typeof data.durationSec === 'number' && data.durationSec > 0 ? data.durationSec : 0;
    if (duration === 0) duration = Math.max(0, ...(await Promise.all(loaded.map((l) => probeAudioDuration(l.blob)))));

    const sections = ((Array.isArray(version.sections) ? version.sections : []) as VersionSection[]).map(
      (sec, i) =>
        new SongSection({
          id: `${song.id}-sec-${i}`,
          name: sec.name,
          type: inferSectionType(sec.name),
          startBar: Math.round(sec.startSec / secondsPerBar) + 1,
          barCount: Math.max(1, Math.round((sec.endSec - sec.startSec) / secondsPerBar)),
          startTime: sec.startSec,
          endTime: sec.endSec
        })
    );

    const keyInfo = keyFromStored(data.originalKey, data.keyMeta);
    return new Song({
      // A versão entra no id: o setlist e o cache do aparelho ficam presos à versão ensaiada.
      id: formatCloudSongKey({ source: scope.kind === 'global' ? 'global' : 'church', songId: song.id, versionId: chosen }),
      title: String(data.title ?? song.title),
      artist: String(data.artist ?? ''),
      originalKey: keyInfo.value,
      keyInfo,
      currentKey: keyInfo.value,
      bpm,
      timeSignature,
      duration,
      sections,
      stems: tracks,
      churchId: scope.kind === 'church' ? scope.churchId : undefined
    });
  }

  public async upload(scope: LibraryScope, draft: Partial<CloudSong>, files: File[]): Promise<CloudSong> {
    const rightsClass = draft.rightsClass ?? 'unknown';
    if (scope.kind === 'global' && !isCatalogEligible(rightsClass, draft.licenseRef)) {
      throw new Error('O catálogo global só aceita material próprio ou licenciado para redistribuição, com documento de licença.');
    }
    const uid = this.currentUid();
    if (!uid) throw new Error('Entre com sua conta para enviar músicas.');
    if (!draft.title?.trim()) throw new Error('Informe o título da música.');
    if (files.length === 0 || files.length > 64) throw new Error('Envie de 1 a 64 arquivos de áudio.');

    const stems: VersionStem[] = [];
    for (const file of files) {
      const contentType = file.type || 'application/octet-stream';
      const sha256 = await this.stems.put(file, { scope, name: file.name, contentType });
      stems.push({ sha256, name: file.name, type: inferStemType(file.name) ?? 'vocals', size: file.size, contentType });
    }

    const bpm = typeof draft.bpm === 'number' ? draft.bpm : 0;
    const uploadKey = draft.keyInfo ?? keyFromStored(draft.originalKey);
    const missing = missingForPlayback(bpm, stems);
    const songRef = doc(collection(this.db, songsPath(scope).join('/')));
    const song: DocumentData = {
      title: draft.title.trim().slice(0, 200),
      artist: (draft.artist ?? '').slice(0, 200),
      kind: draft.kind ?? 'song',
      // Sem tom conhecido grava vazio (nunca um tom padrão); a procedência vai em keyMeta.
      originalKey: uploadKey.value ?? '',
      keyMeta: keyMetaOf(uploadKey),
      bpm,
      timeSignature: draft.timeSignature ?? { beats: 4, value: 4 },
      durationSec: draft.duration ?? 0,
      tags: draft.tags ?? [],
      stemsCount: stems.length,
      rightsClass,
      status: 'pending',
      pendingReason: 'enviando versão',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    if (draft.licenseRef) song.licenseRef = draft.licenseRef;
    await setDoc(songRef, song);

    const versionRef = doc(collection(this.db, ...(songsPath(scope) as [string]), songRef.id, 'versions'));
    await setDoc(versionRef, { createdAt: serverTimestamp(), createdBy: uid, changelog: 'Envio pelo app', sections: [], stems });

    // Publica só depois de conferir que cada arquivo está registrado no escopo (contrato, seção 7)
    const allThere = (await Promise.all(stems.map((s) => this.stems.has(s.sha256, scope)))).every(Boolean);
    const reason = missing ?? (allThere ? null : 'arquivo não confirmado no acervo');
    await updateDoc(songRef, {
      currentVersionId: versionRef.id,
      status: reason ? 'pending' : 'ready',
      pendingReason: reason ?? '',
      updatedAt: serverTimestamp()
    });
    return this.toCloudSong(songRef.id, { ...song, currentVersionId: versionRef.id, status: reason ? 'pending' : 'ready', pendingReason: reason ?? undefined }, stems);
  }
}
