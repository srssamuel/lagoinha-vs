import { describe, expect, it } from 'vitest';
import { resolveImportKey, stableImportId } from '../../../src/application/setlist/importIdentity';
import { setlistReducer, createSetlistState } from '../../../src/application/setlist/setlistReducer';
import { Song } from '../../../src/domain/entities/Song';
import { keyFromName, manualKey, UNKNOWN_KEY } from '../../../src/domain/value-objects/SongKey';

const song = (id: string, title = 't') =>
  new Song({ id, title, artist: 'a', originalKey: null, currentKey: null, bpm: 80, timeSignature: { beats: 4, value: 4 }, duration: 200, sections: [], stems: [] });

describe('stableImportId', () => {
  it('o mesmo pacote reimportado gera o mesmo id; outro nome ou tamanho gera outro', () => {
    const a = stableImportId('zip', [{ name: 'Pacote A.zip', size: 1000 }]);
    expect(stableImportId('zip', [{ name: 'Pacote A.zip', size: 1000 }])).toBe(a);
    expect(stableImportId('zip', [{ name: 'Pacote A.zip', size: 1001 }])).not.toBe(a);
    expect(stableImportId('zip', [{ name: 'Pacote B.zip', size: 1000 }])).not.toBe(a);
  });
  it('stems soltos: a ordem de seleção não muda o id', () => {
    const x = { name: 'bass.wav', size: 10 };
    const y = { name: 'keys.wav', size: 20 };
    expect(stableImportId('stems', [x, y])).toBe(stableImportId('stems', [y, x]));
  });
});

describe('setlistReducer add com id repetido', () => {
  it('reimportar a mesma música substitui a entrada em vez de duplicar', () => {
    const state = createSetlistState([song('a'), song('b')]);
    const next = setlistReducer(state, { type: 'add', song: song('a', 'nova') });
    expect(next.songs.map((s) => s.id)).toEqual(['a', 'b']);
    expect(next.songs[0]!.title).toBe('nova');
    expect(next.currentIndex).toBe(0);
  });
});
describe('resolveImportKey', () => {
  it('reimportar o mesmo ZIP mantém o tom confirmado e não reanalisa o áudio', async () => {
    const known = manualKey('A');
    let analyses = 0;
    const analyze = async () => { analyses++; return keyFromName('C'); };
    const result = await resolveImportKey(known, null, analyze);
    expect(result).toMatchObject({ value: 'A', confirmed: true });
    expect(analyses).toBe(0);
  });
  it('música nova sem tom no nome usa a análise; com tom no nome dispensa o áudio', async () => {
    expect((await resolveImportKey(null, null, async () => keyFromName('C'))).value).toBe('C');
    let analyses = 0;
    const named = await resolveImportKey(null, keyFromName('E'), async () => { analyses++; return UNKNOWN_KEY; });
    expect(named.value).toBe('E');
    expect(analyses).toBe(0);
  });
});
