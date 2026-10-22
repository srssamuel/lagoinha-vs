import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBackend, isDemoModeEnabled, resolveBackendKind } from '../../../src/presentation/composition';

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
};

describe('composition root', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as unknown as { localStorage: unknown }).localStorage = createLocalStorageMock();
    }
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('backend local é o padrão; valor desconhecido é erro', () => {
    expect(resolveBackendKind({})).toBe('local');
    expect(resolveBackendKind({ VITE_BACKEND: 'LOCAL' })).toBe('local');
    expect(resolveBackendKind({ VITE_BACKEND: 'firebase' })).toBe('firebase');
    expect(() => resolveBackendKind({ VITE_BACKEND: 'supabase' })).toThrow(/VITE_BACKEND inválido/);
  });

  it('firebase sem config falha alto em vez de cair em silêncio no local', async () => {
    await expect(createBackend({ VITE_BACKEND: 'firebase' })).rejects.toThrow(/VITE_STEMS_WORKER_URL/);
    await expect(
      createBackend({ VITE_BACKEND: 'firebase', VITE_STEMS_WORKER_URL: 'https://stems.example' })
    ).rejects.toThrow(/VITE_FIREBASE_API_KEY/);
    // Import frio do SDK do Firebase: 1-2 s sozinho, mais que 5 s com a suíte inteira em paralelo.
  }, 30_000);

  it('I6: build de produção não traz admin automático nem usuários de exemplo', async () => {
    const productionEnv = { DEV: false };
    expect(isDemoModeEnabled(productionEnv)).toBe(false);

    const backend = await createBackend(productionEnv);
    expect(backend.accounts.isDemoMode()).toBe(false);
    expect(backend.accounts.getCurrentUser()).toBeNull();
    expect(await backend.accounts.listAllUsers()).toEqual([]);
    await expect(backend.accounts.signInDemo('admin', 'Qualquer')).rejects.toThrow();
  });

  it('modo demonstração só por DEV ou VITE_DEMO_MODE=true explícito', () => {
    expect(isDemoModeEnabled({ DEV: true })).toBe(true);
    expect(isDemoModeEnabled({ DEV: false, VITE_DEMO_MODE: 'true' })).toBe(true);
    expect(isDemoModeEnabled({ DEV: false, VITE_DEMO_MODE: '1' })).toBe(false);
  });

  it('componentes não dão new em adaptador: tudo passa pelo composition root', () => {
    const dir = join(__dirname, '../../../src/presentation/components');
    const offenders: string[] = [];
    const walk = (folder: string) => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) {
          const source = readFileSync(path, 'utf8');
          for (const match of source.matchAll(/new\s+\w*(Adapter|Service|Library|Repository|Store)\s*\(/g)) {
            offenders.push(`${entry.name}: ${match[0]}`);
          }
        }
      }
    };
    walk(dir);
    expect(offenders).toEqual([]);
  });
});
