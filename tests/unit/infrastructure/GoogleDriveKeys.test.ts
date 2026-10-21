import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { GoogleDriveStorageService } from '../../../src/infrastructure/storage/GoogleDriveStorageService';
import { GoogleDriveConfig } from '../../../src/domain/entities/GoogleDriveConfig';

describe('GoogleDriveStorageService: tom nunca é um valor fixo', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      const store: Record<string, string> = {};
      (globalThis as any).localStorage = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => void (store[k] = String(v)),
        removeItem: (k: string) => void delete store[k],
        clear: () => Object.keys(store).forEach((k) => delete store[k])
      };
    }
  });
  beforeEach(() => localStorage.clear());

  it('repertório de demonstração não afirma tom algum', async () => {
    const songs = await new GoogleDriveStorageService().syncDriveFolder('');
    expect(songs.length).toBeGreaterThan(0);
    for (const s of songs) {
      expect(s.originalKey).toBeNull();
      expect(s.keyInfo.origin).not.toBe('legacy');
    }
  });

  it('arquivos da API: tom vem do nome do arquivo ou fica nulo', async () => {
    const service = new GoogleDriveStorageService();
    await service.saveConfig(new GoogleDriveConfig({ folderId: 'pastaTesteDrive01', folderName: 'x', sharedUrl: '', apiKey: 'k' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          files: [
            { id: 'arquivoAAAAAA01', name: 'Titulo X - A - BPM 90.zip', mimeType: 'application/zip' },
            { id: 'arquivoBBBBBB02', name: 'Titulo Y.zip', mimeType: 'application/zip' }
          ]
        })
      }))
    );
    const songs = await service.syncDriveFolder('https://drive.google.com/drive/folders/pastaTesteDrive01');
    vi.unstubAllGlobals();
    expect(songs[0]!.originalKey).toBe('A');
    expect(songs[0]!.keyInfo.origin).toBe('name');
    expect(songs[1]!.originalKey).toBeNull();
    expect(songs[1]!.keyInfo.value).toBeNull();
  });
});