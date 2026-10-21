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

export type BackendKind = 'local' | 'firebase';

/** O pedaço de `import.meta.env` que decide a montagem; nos testes entra um objeto comum. */
export interface BackendEnv {
  DEV?: boolean;
  VITE_BACKEND?: string;
  VITE_DEMO_MODE?: string;
}

export interface Backend {
  kind: BackendKind;
  /** Login e membros: na F0 o mesmo LocalAuthAdapter atende as duas portas. */
  accounts: AccountService;
  library: SongLibraryPort;
  stems: StemBlobPort;
  setlists: SetlistRepositoryPort;
  deviceCache: DeviceCachePort;
  /** Só importação a partir da F5 (spec, seção 8). */
  drive: GoogleDriveStoragePort;
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
export function createBackend(env: BackendEnv = import.meta.env): Backend {
  const kind = resolveBackendKind(env);
  if (kind === 'firebase') {
    throw new Error(
      'VITE_BACKEND=firebase ainda não existe: os adaptadores Firebase chegam na fase F2. Use VITE_BACKEND=local.'
    );
  }
  return {
    kind,
    accounts: new LocalAuthAdapter({ demoMode: isDemoModeEnabled(env) }),
    library: new LocalSongLibraryAdapter(),
    stems: new LocalStemStore(),
    setlists: new LocalSetlistRepository(),
    deviceCache: new IndexedDbDeviceCache(),
    drive: new GoogleDriveStorageService()
  };
}
