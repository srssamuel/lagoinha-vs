import { ServiceSetlist } from '../../domain/entities/ServiceSetlist';

export type NewServiceSetlist = Omit<ServiceSetlist, 'revision' | 'updatedAt'>;

/**
 * Setlists do culto por igreja, com escrita condicional por revisão (spec-banco-online, seção 5.4).
 * Local: LocalSetlistRepository. Produção (F4): FirestoreSetlistAdapter.
 */
export interface SetlistRepositoryPort {
  list(churchId: string): Promise<ServiceSetlist[]>;
  get(churchId: string, setlistId: string): Promise<ServiceSetlist | null>;
  create(setlist: NewServiceSetlist): Promise<ServiceSetlist>;
  /**
   * Grava só se a revisão no repositório for `expectedRevision`; senão lança SetlistConflictError.
   * Devolve o documento com a revisão nova.
   */
  save(setlist: ServiceSetlist, expectedRevision: number): Promise<ServiceSetlist>;
}
