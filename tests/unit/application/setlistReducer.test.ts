import { describe, it, expect } from 'vitest';
import { createSetlistState, currentSongOf, setlistReducer } from '../../../src/application/setlist/setlistReducer';
import { DemoWorshipSongs } from '../../../src/infrastructure/mock/DemoWorshipSongs';

const presets = () => DemoWorshipSongs.getPresetSongs();

describe('setlistReducer — repertório do culto ao vivo', () => {
  it('seleciona apenas índices válidos e não cria estado novo quando nada muda', () => {
    const initial = createSetlistState(presets());
    const selected = setlistReducer(initial, { type: 'select', index: 1 });
    expect(selected.currentIndex).toBe(1);
    expect(setlistReducer(selected, { type: 'select', index: 99 })).toBe(selected);
    expect(setlistReducer(selected, { type: 'select', index: 1 })).toBe(selected);
  });

  it('remover uma música antes da atual mantém a música ativa tocando', () => {
    const songs = presets();
    const onSecond = setlistReducer(createSetlistState(songs), { type: 'select', index: 1 });
    const activeId = currentSongOf(onSecond)!.id;

    const next = setlistReducer(onSecond, { type: 'remove', index: 0 });

    expect(next.songs).toHaveLength(songs.length - 1);
    expect(currentSongOf(next)!.id).toBe(activeId);
    expect(onSecond.songs).toHaveLength(songs.length); // estado anterior intacto
  });

  it('mover músicas preserva a seleção pela identidade da música', () => {
    const songs = presets();
    const initial = createSetlistState(songs);
    const activeId = currentSongOf(initial)!.id;

    const moved = setlistReducer(initial, { type: 'move', from: 0, to: songs.length - 1 });

    expect(moved.songs[songs.length - 1]!.id).toBe(activeId);
    expect(currentSongOf(moved)!.id).toBe(activeId);
  });

  it('adicionar seleciona a música nova; substituir volta ao início', () => {
    const [first, ...rest] = presets();
    const added = setlistReducer(createSetlistState(rest), { type: 'add', song: first! });
    expect(added.currentIndex).toBe(rest.length);
    expect(currentSongOf(added)!.id).toBe(first!.id);

    const replaced = setlistReducer(added, { type: 'replaceAll', songs: [first!] });
    expect(replaced.currentIndex).toBe(0);
    expect(replaced.songs).toEqual([first]);
  });

  it('hydrate (carga tardia do IndexedDB) mantém a música atual e a mesma instância', () => {
    const onThird = setlistReducer(createSetlistState(presets()), { type: 'select', index: 2 });
    const playing = currentSongOf(onThird)!;

    const fresh = presets(); // objetos novos, mesmos ids
    const hydrated = setlistReducer(onThird, { type: 'hydrate', songs: fresh });
    expect(currentSongOf(hydrated)).toBe(playing);
    expect(hydrated.currentIndex).toBe(2);

    const withoutIt = setlistReducer(onThird, { type: 'hydrate', songs: fresh.filter((s) => s.id !== playing.id) });
    expect(withoutIt.currentIndex).toBe(0);
  });

  it('touch sinaliza mutação no lugar sem trocar as instâncias de Song', () => {
    const initial = createSetlistState(presets());
    const touched = setlistReducer(initial, { type: 'touch' });
    expect(touched.revision).toBe(initial.revision + 1);
    expect(touched.songs).not.toBe(initial.songs);
    expect(currentSongOf(touched)).toBe(currentSongOf(initial));
  });

  it('esvaziar o repertório não deixa índice inválido', () => {
    const one = createSetlistState([presets()[0]!]);
    const empty = setlistReducer(one, { type: 'remove', index: 0 });
    expect(empty.songs).toHaveLength(0);
    expect(currentSongOf(empty)).toBeNull();
  });
});
