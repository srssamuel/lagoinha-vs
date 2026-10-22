import { collection, doc, DocumentData, Firestore, getDoc, getDocs, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { SaveVersionInput } from '../../application/acervo/CatalogIngestQueue';
import { CatalogAdminPort, CatalogEntry } from '../../application/acervo/CatalogAdminPort';
import { keyMetaOf, keyFromName, manualKey, UNKNOWN_KEY } from '../../domain/value-objects/SongKey';
import { IdTokenProvider } from '../storage/R2WorkerStemStore';

export class CatalogRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'CatalogRequestError';
  }
}

function iso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return typeof value === 'string' ? value : '';
}

/**
 * Escrita do catálogo pelo curador (painel /admin/acervo). Firestore guarda metadados e versões imutáveis;
 * publicar e retirar passam pelo Worker, que confere arquivos e manifesto antes de servir sem login.
 */
export class FirestoreCatalogAdmin implements CatalogAdminPort {
  constructor(
    private readonly db: Firestore,
    private readonly workerUrl: string,
    private readonly idToken: IdTokenProvider,
    private readonly currentUid: () => string | null,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)
  ) {}

  /** Curador = existe platformAdmins/{uid} (cadastrado só pelo console; a regra deixa só a própria pessoa ler). */
  public async isCurator(): Promise<boolean> {
    const uid = this.currentUid();
    if (!uid) return false;
    try {
      return (await getDoc(doc(this.db, 'platformAdmins', uid))).exists();
    } catch {
      return false;
    }
  }

  public async list(): Promise<CatalogEntry[]> {
    const snap = await getDocs(collection(this.db, 'catalog'));
    return snap.docs
      .map((d) => {
        const data = d.data();
        const status = ['pending', 'ready', 'published', 'withdrawn'].includes(data.status) ? data.status : 'pending';
        return {
          songId: d.id,
          title: String(data.title ?? ''),
          artist: String(data.artist ?? ''),
          key: typeof data.originalKey === 'string' && data.originalKey ? data.originalKey : null,
          bpm: typeof data.bpm === 'number' && data.bpm > 0 ? data.bpm : null,
          status,
          stemsCount: typeof data.stemsCount === 'number' ? data.stemsCount : 0,
          draftVersionId: typeof data.draftVersionId === 'string' ? data.draftVersionId : undefined,
          currentVersionId: typeof data.currentVersionId === 'string' ? data.currentVersionId : undefined,
          publishedManifestSha256: typeof data.publishedManifestSha256 === 'string' ? data.publishedManifestSha256 : undefined,
          updatedAt: iso(data.updatedAt)
        } satisfies CatalogEntry;
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  }

  /**
   * Grava música e versão com ids estáveis. Repetir não duplica: a versão existente não é regravada
   * (é imutável) e a música só tem os metadados atualizados. Música já publicada continua publicada
   * na versão atual; a nova versão fica como rascunho até ser publicada.
   */
  public async saveVersion(input: SaveVersionInput): Promise<void> {
    const uid = this.currentUid();
    if (!uid) throw new Error('Entre com sua conta para gravar no acervo.');
    const songRef = doc(this.db, 'catalog', input.songId);
    const versionRef = doc(this.db, 'catalog', input.songId, 'versions', input.versionId);
    const existing = await getDoc(songRef);
    const previous: DocumentData | undefined = existing.exists() ? existing.data() : undefined;

    const keyInfo = input.key ? (input.keyOrigin === 'manual' ? manualKey(input.key) : keyFromName(input.key)) : UNKNOWN_KEY;
    const song: DocumentData = {
      title: input.title.slice(0, 200),
      artist: input.artist.slice(0, 200),
      kind: 'song',
      originalKey: keyInfo.value ?? '',
      keyMeta: keyMetaOf(keyInfo),
      // BPM desconhecido fica 0 (pendente): nunca um valor inventado.
      bpm: input.bpm ?? 0,
      timeSignature: previous?.timeSignature ?? { beats: 4, value: 4 },
      durationSec: input.durationSec,
      tags: Array.isArray(previous?.tags) ? previous.tags : [],
      stemsCount: input.stems.length,
      rightsClass: input.rightsClass,
      licenseRef: { holder: input.licenseHolder.slice(0, 200), documentId: input.licenseDocument.slice(0, 200) },
      draftVersionId: input.versionId,
      status: previous?.status === 'published' ? 'published' : 'ready',
      pendingReason: input.bpm ? '' : 'BPM pendente',
      updatedAt: serverTimestamp()
    };
    if (!previous) {
      song.createdBy = uid;
      song.createdAt = serverTimestamp();
    }
    // A versão nasce sob música que já passou pela regra de direitos (I4): música primeiro.
    await setDoc(songRef, song, { merge: true });
    if (!(await getDoc(versionRef)).exists()) {
      await setDoc(versionRef, {
        createdAt: serverTimestamp(),
        createdBy: uid,
        changelog: 'Envio pelo painel do acervo',
        sections: [],
        stems: input.stems
      });
    }
  }

  private async callWorker(path: string): Promise<Record<string, unknown>> {
    const token = await this.idToken();
    if (!token) throw new CatalogRequestError(401, 'unauthenticated', 'Sessão expirada: entre de novo.');
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.workerUrl.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` }
      });
    } catch {
      throw new CatalogRequestError(0, 'network', 'Sem conexão com o acervo. Tente de novo.');
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const code = typeof body.error === 'string' ? body.error : String(res.status);
      throw new CatalogRequestError(res.status, code, `O acervo recusou (${res.status}: ${code}).`);
    }
    return body;
  }

  public async publish(songId: string, versionId: string): Promise<{ manifestSha256: string }> {
    const body = await this.callWorker(`/v1/catalog/songs/${encodeURIComponent(songId)}/publish?version=${encodeURIComponent(versionId)}`);
    return { manifestSha256: String(body.manifestSha256 ?? '') };
  }

  public async withdraw(songId: string): Promise<void> {
    await this.callWorker(`/v1/catalog/songs/${encodeURIComponent(songId)}/withdraw`);
  }
}
