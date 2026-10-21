import { useCallback, useEffect, useReducer } from 'react';
import { Song } from '../../domain/entities/Song';
import {
  createSetlistState,
  currentSongOf,
  setlistReducer,
  SetlistState
} from '../../application/setlist/setlistReducer';
import { DemoWorshipSongs } from '../../infrastructure/mock/DemoWorshipSongs';
import { DeviceCachePort } from '../../application/ports/DeviceCachePort';

export interface SetlistController {
  state: SetlistState;
  currentSong: Song | null;
  select: (index: number) => void;
  remove: (index: number) => void;
  move: (from: number, to: number) => void;
  add: (song: Song) => void;
  replaceAll: (songs: Song[]) => void;
  restoreDefaults: () => void;
  /** Avisa o React que um Song/TrackStem foi mutado no lugar. */
  touch: () => void;
}

/**
 * Repertório do culto: presets + músicas próprias do IndexedDB (isoladas por churchId).
 * Efeitos de áudio (parar, crossfade do pad) ficam com quem chama.
 */
export function useSetlist(churchId: string | undefined, deviceCache: DeviceCachePort): SetlistController {
  const [state, dispatch] = useReducer(setlistReducer, undefined, () =>
    createSetlistState(DemoWorshipSongs.getPresetSongs())
  );

  useEffect(() => {
    let cancelled = false;
    void deviceCache.loadCustomSongs(churchId).then((saved) => {
      if (cancelled) return;
      const presets = DemoWorshipSongs.getPresetSongs();
      const presetIds = new Set(presets.map((s) => s.id));
      dispatch({ type: 'hydrate', songs: [...presets, ...saved.filter((s) => !presetIds.has(s.id))] });
    });
    return () => {
      cancelled = true;
    };
  }, [churchId, deviceCache]);

  const remove = useCallback(
    (index: number) => {
      const target = state.songs[index];
      if (target) void deviceCache.deleteCustomSong(target.id, churchId);
      dispatch({ type: 'remove', index });
    },
    [state.songs, churchId, deviceCache]
  );

  return {
    state,
    currentSong: currentSongOf(state),
    select: useCallback((index: number) => dispatch({ type: 'select', index }), []),
    remove,
    move: useCallback((from: number, to: number) => dispatch({ type: 'move', from, to }), []),
    add: useCallback((song: Song) => dispatch({ type: 'add', song }), []),
    replaceAll: useCallback((songs: Song[]) => dispatch({ type: 'replaceAll', songs }), []),
    restoreDefaults: useCallback(
      () => dispatch({ type: 'replaceAll', songs: DemoWorshipSongs.getPresetSongs() }),
      []
    ),
    touch: useCallback(() => dispatch({ type: 'touch' }), [])
  };
}
