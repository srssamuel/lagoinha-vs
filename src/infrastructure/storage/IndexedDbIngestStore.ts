import { IngestItem, IngestStore } from '../../application/acervo/CatalogIngestQueue';

const DB_NAME = 'lagoinha-vs-acervo';
const STORE = 'fila';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

/**
 * Fila de envio do painel guardada no aparelho: metadados, hashes e partes já recebidas de cada arquivo.
 * O áudio em si não fica aqui (o navegador não guarda o acesso ao arquivo entre cargas da página).
 */
export class IndexedDbIngestStore implements IngestStore {
  public async load(): Promise<IngestItem[]> {
    const all = await run<IngestItem[]>('readonly', (s) => s.getAll() as IDBRequest<IngestItem[]>);
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  public async save(item: IngestItem): Promise<void> {
    await run('readwrite', (s) => s.put(JSON.parse(JSON.stringify(item)) as IngestItem));
  }

  public async remove(id: string): Promise<void> {
    await run('readwrite', (s) => s.delete(id));
  }
}

/** Para testes e para o modo local. */
export class MemoryIngestStore implements IngestStore {
  private readonly items = new Map<string, IngestItem>();
  public async load(): Promise<IngestItem[]> {
    return [...this.items.values()].map((i) => JSON.parse(JSON.stringify(i)) as IngestItem);
  }
  public async save(item: IngestItem): Promise<void> {
    this.items.set(item.id, JSON.parse(JSON.stringify(item)) as IngestItem);
  }
  public async remove(id: string): Promise<void> {
    this.items.delete(id);
  }
}
