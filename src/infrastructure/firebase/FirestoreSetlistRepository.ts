import { collection, doc, DocumentData, Firestore, getDoc, getDocs, runTransaction, Timestamp } from 'firebase/firestore';
import { NewServiceSetlist, SetlistRepositoryPort } from '../../application/ports/SetlistRepositoryPort';
import { ServiceSetlist, ServiceSetlistItem, SetlistConflictError } from '../../domain/entities/ServiceSetlist';

function fromDoc(churchId: string, id: string, data: DocumentData): ServiceSetlist {
  const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : String(data.updatedAt ?? '');
  return {
    id,
    churchId,
    title: String(data.title ?? ''),
    serviceDate: String(data.serviceDate ?? ''),
    status: data.status === 'published' || data.status === 'locked' ? data.status : 'draft',
    revision: typeof data.revision === 'number' ? data.revision : 0,
    updatedBy: String(data.updatedBy ?? ''),
    updatedAt,
    items: Array.isArray(data.items) ? (data.items as ServiceSetlistItem[]) : []
  };
}

/** Sem campos `undefined`: o Firestore recusa. */
function cleanItems(items: ServiceSetlistItem[]): ServiceSetlistItem[] {
  return items.map((item) => Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)) as unknown as ServiceSetlistItem);
}

/**
 * Setlists em churches/{id}/setlists com gravação condicional em transação (spec, seção 5.4):
 * a revisão lida precisa ser a do servidor e sobe exatamente 1; as regras conferem o mesmo.
 */
export class FirestoreSetlistRepository implements SetlistRepositoryPort {
  constructor(
    private readonly db: Firestore,
    private readonly currentUid: () => string | null
  ) {}

  private uid(): string {
    const uid = this.currentUid();
    if (!uid) throw new Error('Entre com sua conta para editar setlists.');
    return uid;
  }

  public async list(churchId: string): Promise<ServiceSetlist[]> {
    const snap = await getDocs(collection(this.db, 'churches', churchId, 'setlists'));
    return snap.docs.map((d) => fromDoc(churchId, d.id, d.data())).sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));
  }

  public async get(churchId: string, setlistId: string): Promise<ServiceSetlist | null> {
    const snap = await getDoc(doc(this.db, 'churches', churchId, 'setlists', setlistId));
    return snap.exists() ? fromDoc(churchId, snap.id, snap.data()) : null;
  }

  public async create(setlist: NewServiceSetlist): Promise<ServiceSetlist> {
    const uid = this.uid();
    const ref = doc(this.db, 'churches', setlist.churchId, 'setlists', setlist.id);
    const now = Timestamp.now();
    await runTransaction(this.db, async (tx) => {
      if ((await tx.get(ref)).exists()) throw new Error(`Já existe um setlist com o id ${setlist.id}.`);
      tx.set(ref, {
        title: setlist.title,
        serviceDate: setlist.serviceDate,
        status: setlist.status,
        revision: 1,
        updatedBy: uid,
        updatedAt: now,
        items: cleanItems(setlist.items)
      });
    });
    return { ...setlist, revision: 1, updatedBy: uid, updatedAt: now.toDate().toISOString() };
  }

  public async save(setlist: ServiceSetlist, expectedRevision: number): Promise<ServiceSetlist> {
    const uid = this.uid();
    const ref = doc(this.db, 'churches', setlist.churchId, 'setlists', setlist.id);
    const now = Timestamp.now();
    const revision = await runTransaction(this.db, async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists()) throw new Error('Setlist não encontrado nesta igreja.');
      const data = current.data();
      if (data.revision !== expectedRevision) {
        throw new SetlistConflictError(setlist.id, expectedRevision, data.revision, String(data.updatedBy ?? ''));
      }
      tx.update(ref, {
        title: setlist.title,
        serviceDate: setlist.serviceDate,
        status: setlist.status,
        revision: expectedRevision + 1,
        updatedBy: uid,
        updatedAt: now,
        items: cleanItems(setlist.items)
      });
      return expectedRevision + 1;
    });
    return { ...setlist, revision, updatedBy: uid, updatedAt: now.toDate().toISOString() };
  }
}
