import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
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
});
