import { AccountService } from '../application/ports/AuthPort';
import { DeviceCachePort } from '../application/ports/DeviceCachePort';
import { GoogleDriveStoragePort } from '../application/ports/GoogleDriveStoragePort';
import { SetlistRepositoryPort } from '../application/ports/SetlistRepositoryPort';
import { SongLibraryPort } from '../application/ports/SongLibraryPort';
import { StemBlobPort } from '../application/ports/StemBlobPort';
import { LocalAuthAdapter } from '../infrastructure/auth/LocalAuthAdapter';
import { LocalSongLibraryAdapter } from '../infrastructure/library/LocalSongLibraryAdapter';
import { GoogleDriveStorageService } from '../infrastructure/storage/GoogleDriveStorageService';
import { IndexedDbDeviceCache } from '../infrastructure/storage/IndexedDbDeviceCache';
import { LocalSetlistRepository } from '../infrastructure/storage/LocalSetlistRepository';
import { LocalStemStore } from '../infrastructure/storage/LocalStemStore';
import type { FirebaseBackendEnv } from './firebaseBackend';
import { PrepareServiceUseCase } from '../application/service/PrepareServiceUseCase';
import { CatalogAdminServices } from '../application/acervo/CatalogAdminPort';

export type BackendKind = 'local' | 'firebase';

/** O pedaço de `import.meta.env` que decide a montagem; nos testes entra um objeto comum. */
export interface BackendEnv {
  DEV?: boolean;
  VITE_BACKEND?: string;
  VITE_DEMO_MODE?: string;
}

export interface Backend {
  kind: BackendKind;
  /** Login e membros: um único serviço atende as duas portas (local ou Firebase). */
  accounts: AccountService;
  library: SongLibraryPort;
  stems: StemBlobPort;
  setlists: SetlistRepositoryPort;
  deviceCache: DeviceCachePort;
  /** Só importação a partir da F5 (spec, seção 8). */
  drive: GoogleDriveStoragePort;
  /** Preparar o culto offline (F4): versão exata de cada música baixada para o aparelho. */
  prepareService: PrepareServiceUseCase;
  /** Painel do acervo público (/admin/acervo): só com Firebase + Worker de stems. */
  catalogAdmin?: CatalogAdminServices;
}

export function resolveBackendKind(env: BackendEnv): BackendKind {
  const raw = (env.VITE_BACKEND ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'local') return 'local';
  if (raw === 'firebase') return 'firebase';
  throw new Error(`VITE_BACKEND inválido: "${env.VITE_BACKEND}". Use "local" ou "firebase".`);
}

/** I6: usuários de exemplo e admin automático só no `npm run dev` ou com VITE_DEMO_MODE=true. */
export function isDemoModeEnabled(env: BackendEnv): boolean {
  return env.DEV === true || env.VITE_DEMO_MODE === 'true';
}

/** Único lugar do app que escolhe adaptadores (spec-banco-online, seção 8). */
export async function createBackend(env: BackendEnv & FirebaseBackendEnv = import.meta.env): Promise<Backend> {
  const kind = resolveBackendKind(env);
  if (kind === 'firebase') {
    // Firebase só entra no bundle de quem usa: o modo local continua leve.
    const { createFirebaseBackend } = await import('./firebaseBackend');
    return createFirebaseBackend(env);
  }
  return createLocalBackend(env);
}

export function createLocalBackend(env: BackendEnv = {}): Backend {
  const library = new LocalSongLibraryAdapter();
  const deviceCache = new IndexedDbDeviceCache();
  return {
    kind: 'local',
    accounts: new LocalAuthAdapter({ demoMode: isDemoModeEnabled(env) }),
    library,
    stems: new LocalStemStore(),
    setlists: new LocalSetlistRepository(),
    deviceCache,
    drive: new GoogleDriveStorageService(),
    prepareService: new PrepareServiceUseCase(library, deviceCache)
  };
}