import { LocalRegistry } from './registry-local.mjs';
import { FirestoreRegistry } from './registry-firestore.mjs';
import { LocalStorage } from './storage-local.mjs';
import { WorkerStorage } from './storage-worker.mjs';

export function makeTargets(cfg, { storage = 'local', registry = 'local' } = {}) {
  const s =
    storage === 'worker'
      ? new WorkerStorage({ baseUrl: cfg.workerUrl, tokenFile: cfg.tokenFile })
      : storage === 'local'
        ? new LocalStorage(cfg.r2LocalDir)
        : (() => {
            throw new Error(`alvo de storage desconhecido: ${storage}`);
          })();
  const r =
    registry === 'firestore'
      ? new FirestoreRegistry({ projectId: cfg.firebaseProjectId, tokenFile: cfg.tokenFile, ...(cfg.firestoreBaseUrl ? { baseUrl: cfg.firestoreBaseUrl.replace(/\/+$/, '') } : {}) })
      : registry === 'local'
        ? new LocalRegistry(cfg.firestoreLocalDir)
        : (() => {
            throw new Error(`alvo de registro desconhecido: ${registry}`);
          })();
  return { storage: s, registry: r };
}
