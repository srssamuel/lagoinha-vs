import { describe, expect, it } from 'vitest';
import { IndexedDbStorageService, type SerializedSong } from '../../../src/infrastructure/storage/IndexedDbStorageService';
import { Song } from '../../../src/domain/entities/Song';
import { CloudSong } from '../../../src/domain/entities/CloudSong';
import { keyFromAudio, manualKey, UNKNOWN_KEY } from '../../../src/domain/value-objects/SongKey';

const base = {
  id: 's1',
  title: 'Titulo',
  artist: 'Banda',
  bpm: 100,
  timeSignature: { beats: 4, value: 4 },
  duration: 200,
  sections: [],
  stems: []
};

describe('persistência do tom no aparelho (IndexedDB)', () => {
  it('registro antigo (sem keyMeta) volta como legacy, não confirmado — nunca vira confirmado por si', () => {
    const old = { ...IndexedDbStorageService.serializeSong(new Song({ ...base, originalKey: 'G', currentKey: 'G' })) } as SerializedSong;
    delete old.keyMeta;
    const song = IndexedDbStorageService.deserializeSong(old);
    expect(song.originalKey).toBe('G');
    expect(song.keyInfo).toMatchObject({ origin: 'legacy', confirmed: false });
  });

  it('confirmação manual sobrevive à ida e volta; sem tom continua sem tom (não vira "G")', () => {
    const song = new Song({ ...base, originalKey: null, currentKey: null });
    song.confirmKey('F');
    const back = IndexedDbStorageService.deserializeSong(IndexedDbStorageService.serializeSong(song));
    expect(back.keyInfo).toMatchObject({ value: 'F', origin: 'manual', confirmed: true });

    const none = IndexedDbStorageService.deserializeSong(
      IndexedDbStorageService.serializeSong(new Song({ ...base, originalKey: null, currentKey: null, keyInfo: UNKNOWN_KEY }))
    );
    expect(none.originalKey).toBeNull();
    expect(none.currentKey).toBeNull();
  });

  it('análise ambígua guarda os candidatos e continua sem valor', () => {
    const amb = keyFromAudio({ key: 'G', correlation: 0.8, margin: 0.01, candidates: ['G', 'Em'], ambiguous: true, chroma: [] });
    const song = new Song({ ...base, originalKey: amb.value, currentKey: null, keyInfo: amb });
    const back = IndexedDbStorageService.deserializeSong(IndexedDbStorageService.serializeSong(song));
    expect(back.originalKey).toBeNull();
    expect(back.keyInfo.candidates).toEqual(['G', 'Em']);
  });
});

describe('CloudSong e tom', () => {
  const props = {
    id: 'c1', title: 'T', artist: 'A', bpm: 100, timeSignature: { beats: 4, value: 4 }, duration: 100, stemsCount: 0,
    stems: [], tags: [], uploadedBy: 'u', uploadedAt: 'x', storageFolder: ''
  };
  it('string antiga vira legacy; string vazia ou nula vira sem tom; keyInfo manual é respeitado', () => {
    expect(new CloudSong({ ...props, originalKey: 'G' }).keyInfo.origin).toBe('legacy');
    expect(new CloudSong({ ...props, originalKey: '' }).originalKey).toBeNull();
    expect(new CloudSong({ ...props, originalKey: null }).keyInfo.value).toBeNull();
    expect(new CloudSong({ ...props, originalKey: 'F', keyInfo: manualKey('F') }).keyInfo.confirmed).toBe(true);
  });
});
