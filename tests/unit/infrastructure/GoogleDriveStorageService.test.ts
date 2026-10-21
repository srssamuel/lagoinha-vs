import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { GoogleDriveStorageService } from '../../../src/infrastructure/storage/GoogleDriveStorageService';
import { GoogleDriveConfig } from '../../../src/domain/entities/GoogleDriveConfig';

// Mock localStorage para ambiente Node.js do Vitest
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
};

describe('GoogleDriveStorageService Suite', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = createLocalStorageMock();
    }
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with default Lagoinha official drive folder configuration', async () => {
    const service = new GoogleDriveStorageService();
    const config = await service.getConfig();
    expect(config).not.toBeNull();
    expect(config?.folderName).toContain('Google Drive');
    expect(config?.autoSyncOnStart).toBe(true);
  });

  it('updates and persists Google Drive folder configuration', async () => {
    const service = new GoogleDriveStorageService();
    const newConfig = new GoogleDriveConfig({
      folderId: '1NewDriveFolderForLagoinhaWorship2026',
      folderName: 'Multitracks Culto 2026',
      sharedUrl: 'https://drive.google.com/drive/folders/1NewDriveFolderForLagoinhaWorship2026'
    });

    await service.saveConfig(newConfig);
    const loaded = await service.getConfig();
    expect(loaded?.folderId).toBe('1NewDriveFolderForLagoinhaWorship2026');
    expect(loaded?.folderName).toBe('Multitracks Culto 2026');
  });

  it('synchronizes drive folder and returns songs with google_drive source and stems', async () => {
    const service = new GoogleDriveStorageService();
    const songs = await service.syncDriveFolder('https://drive.google.com/drive/folders/1Lagoinha-Official');

    expect(songs.length).toBeGreaterThan(0);
    const generalSong = songs.find((s) => s.id === 'gdrive-o-nosso-general');
    expect(generalSong).toBeDefined();
    expect(generalSong?.source).toBe('google_drive');
    expect(generalSong?.stemsCount).toBe(13);
    expect(generalSong?.stems.some((st) => st.type === 'click')).toBe(true);
    expect(generalSong?.stems.some((st) => st.type === 'guide')).toBe(true);
  });

  it('rejeita link de outro host ou ID com aspas (injeção na query do Drive)', async () => {
    const service = new GoogleDriveStorageService();
    await expect(service.syncDriveFolder('https://evil.example/drive/folders/1Lagoinha-Official')).rejects.toThrow(
      /inválido/
    );
    await expect(service.syncDriveFolder("x' or name contains 'a")).rejects.toThrow(/inválido/);
  });

  it('não chama a API do Drive sem pasta válida e escapa a apiKey', async () => {
    const service = new GoogleDriveStorageService();
    const config = (await service.getConfig())!;
    config.apiKey = 'k&evil=1';
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: false, status: 500 };
    }));
    try {
      await service.syncDriveFolder('');
      expect(calls).toHaveLength(0);

      await service.syncDriveFolder('https://drive.google.com/drive/folders/1Lagoinha-Official');
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain('key=k%26evil%3D1');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('downloadDriveStem valida o ID e ignora URL de host não confiável', async () => {
    const service = new GoogleDriveStorageService();
    await expect(service.downloadDriveStem('../../etc')).rejects.toThrow(/inválido/);

    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await service.downloadDriveStem('1Zxt922J3KtI-3zfwP4eZe7KKoZgsBXAl', 'https://evil.example/stem.wav');
      expect(fetchMock).toHaveBeenCalledWith('https://drive.google.com/uc?export=download&id=1Zxt922J3KtI-3zfwP4eZe7KKoZgsBXAl');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
