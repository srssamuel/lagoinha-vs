import { LibraryScope } from '../application/ports/SongLibraryPort';
import { connectFirebase, FirebaseEnv } from '../infrastructure/firebase/firebaseApp';
import { FirebaseAccountService } from '../infrastructure/firebase/FirebaseAccountService';
import { FirestoreSetlistRepository } from '../infrastructure/firebase/FirestoreSetlistRepository';
import { FirestoreSongLibraryAdapter } from '../infrastructure/firebase/FirestoreSongLibraryAdapter';
import { GoogleDriveStorageService } from '../infrastructure/storage/GoogleDriveStorageService';
import { IndexedDbDeviceCache } from '../infrastructure/storage/IndexedDbDeviceCache';
import { R2WorkerStemStore } from '../infrastructure/storage/R2WorkerStemStore';
import type { Backend } from './composition';
import { PrepareServiceUseCase } from '../application/service/PrepareServiceUseCase';

export interface FirebaseBackendEnv extends FirebaseEnv {
  /** URL do Worker de stems (contrato-stems-worker); sem ela o app não baixa nem envia áudio. */
  VITE_STEMS_WORKER_URL?: string;
}

function inviteFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('invite');
  } catch {
    return null;
  }
}

/** Montagem de produção (F2/F3): Firebase Auth + Firestore + R2 pelo Worker. Carregada sob demanda. */
export function createFirebaseBackend(env: FirebaseBackendEnv): Backend {
  const workerUrl = env.VITE_STEMS_WORKER_URL?.trim();
  if (!workerUrl) throw new Error('VITE_STEMS_WORKER_URL ausente: o acervo de áudio fica no Worker de stems.');
  const { auth, db } = connectFirebase(env);
  const accounts = new FirebaseAccountService(auth, db, { pendingInviteToken: inviteFromUrl() });
  const uid = () => auth.currentUser?.uid ?? null;
  const churchScope = (): LibraryScope | null => {
    const user = accounts.getCurrentUser();
    return user && user.isActive ? { kind: 'church', churchId: user.churchId } : null;
  };
  const stems = new R2WorkerStemStore(workerUrl, async () => (auth.currentUser ? auth.currentUser.getIdToken() : null), churchScope);
  const library = new FirestoreSongLibraryAdapter(db, stems, uid);
  const deviceCache = new IndexedDbDeviceCache();
  return {
    kind: 'firebase',
    accounts,
    library,
    stems,
    setlists: new FirestoreSetlistRepository(db, uid),
    deviceCache,
    // Sem Drive na operação normal: só o migrador administrativo lê o Drive.
    drive: new GoogleDriveStorageService(),
    prepareService: new PrepareServiceUseCase(library, deviceCache)
  };
}
