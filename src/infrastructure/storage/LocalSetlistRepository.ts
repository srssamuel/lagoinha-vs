import { ServiceSetlist, SetlistConflictError } from '../../domain/entities/ServiceSetlist';
import { NewServiceSetlist, SetlistRepositoryPort } from '../../application/ports/SetlistRepositoryPort';

/** O mínimo do localStorage que o repositório usa; nos testes entra um Map. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly data = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function defaultStore(): KeyValueStore {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Storage indisponível (modo privado, iframe sem permissão)
  }
  return new MemoryKeyValueStore();
}

const keyFor = (churchId: string) => `lagoinha_vs_setlists_${churchId}`;

/**
 * Setlists do culto no aparelho (F0), uma chave por igreja. Mesmo contrato do
 * FirestoreSetlistAdapter da F4: gravação condicional por revisão, sem merge.
 */
export class LocalSetlistRepository implements SetlistRepositoryPort {
  constructor(
    private readonly store: KeyValueStore = defaultStore(),
    private readonly now: () => Date = () => new Date()
  ) {}

  private read(churchId: string): ServiceSetlist[] {
    if (!churchId) throw new Error('Setlist exige churchId.');
    try {
      const raw = this.store.getItem(keyFor(churchId));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as ServiceSetlist[]) : [];
    } catch {
      return [];
    }
  }

  private write(churchId: string, setlists: ServiceSetlist[]): void {
    this.store.setItem(keyFor(churchId), JSON.stringify(setlists));
  }

  public async list(churchId: string): Promise<ServiceSetlist[]> {
    return this.read(churchId);
  }

  public async get(churchId: string, setlistId: string): Promise<ServiceSetlist | null> {
    return this.read(churchId).find((s) => s.id === setlistId) ?? null;
  }

  public async create(setlist: NewServiceSetlist): Promise<ServiceSetlist> {
    const all = this.read(setlist.churchId);
    if (all.some((s) => s.id === setlist.id)) {
      throw new Error(`Já existe um setlist com o id ${setlist.id}.`);
    }
    const created: ServiceSetlist = { ...setlist, revision: 1, updatedAt: this.now().toISOString() };
    this.write(setlist.churchId, [...all, created]);
    return created;
  }

  public async save(setlist: ServiceSetlist, expectedRevision: number): Promise<ServiceSetlist> {
    const all = this.read(setlist.churchId);
    const index = all.findIndex((s) => s.id === setlist.id);
    const current = all[index];
    if (!current) throw new Error('Setlist não encontrado nesta igreja.');
    if (current.revision !== expectedRevision) {
      throw new SetlistConflictError(setlist.id, expectedRevision, current.revision, current.updatedBy);
    }
    const saved: ServiceSetlist = {
      ...setlist,
      churchId: current.churchId, // a igreja do documento não muda
      revision: current.revision + 1,
      updatedAt: this.now().toISOString()
    };
    all[index] = saved;
    this.write(setlist.churchId, all);
    return saved;
  }
}
