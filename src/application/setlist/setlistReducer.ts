import { Song } from '../../domain/entities/Song';
import { Setlist } from '../../domain/entities/Setlist';

/**
 * Estado do repertório do culto ao vivo. As regras de índice (remover, mover,
 * selecionar) vêm da entidade de domínio Setlist; o reducer só garante
 * imutabilidade para o React.
 */
export interface SetlistState {
  songs: Song[];
  currentIndex: number;
  /**
   * Incrementa quando um Song/TrackStem é mutado no lugar (volume, DSP, BPM...).
   * As entidades de domínio são mutáveis; a revisão é o sinal de re-render.
   */
  revision: number;
}

export type SetlistAction =
  | { type: 'select'; index: number }
  | { type: 'remove'; index: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'add'; song: Song }
  | { type: 'replaceAll'; songs: Song[] }
  /** Carga assíncrona (IndexedDB/nuvem): troca a lista sem tirar o operador da música atual. */
  | { type: 'hydrate'; songs: Song[] }
  | { type: 'touch' };

export const createSetlistState = (songs: Song[]): SetlistState => ({ songs, currentIndex: 0, revision: 0 });

const applyOnDomain = (state: SetlistState, op: (setlist: Setlist) => void): SetlistState => {
  const setlist = new Setlist({
    id: 'live-service',
    name: 'Culto ao vivo',
    serviceName: 'Culto ao vivo',
    date: '',
    songs: [...state.songs],
    currentIndex: state.currentIndex
  });
  op(setlist);
  return { songs: setlist.songs, currentIndex: setlist.currentIndex, revision: state.revision + 1 };
};

export const setlistReducer = (state: SetlistState, action: SetlistAction): SetlistState => {
  switch (action.type) {
    case 'select':
      if (action.index < 0 || action.index >= state.songs.length || action.index === state.currentIndex) {
        return state;
      }
      return { ...state, currentIndex: action.index };
    case 'remove':
      return applyOnDomain(state, (s) => s.removeSongAt(action.index));
    case 'move':
      return applyOnDomain(state, (s) => s.moveSong(action.from, action.to));
    case 'add': {
      // Reimportar a mesma música (id estável) substitui a entrada em vez de duplicar
      const existing = state.songs.findIndex((s) => s.id === action.song.id);
      if (existing >= 0) {
        return {
          songs: state.songs.map((s, i) => (i === existing ? action.song : s)),
          currentIndex: existing,
          revision: state.revision + 1
        };
      }
      return {
        songs: [...state.songs, action.song],
        currentIndex: state.songs.length,
        revision: state.revision + 1
      };
    }
    case 'replaceAll':
      return { songs: action.songs, currentIndex: 0, revision: state.revision + 1 };
    case 'hydrate': {
      // Mantém o mesmo objeto da música atual: o motor não recarrega o que já está tocando.
      const current = currentSongOf(state);
      const index = current ? action.songs.findIndex((s) => s.id === current.id) : -1;
      const songs = index >= 0 && current ? action.songs.map((s, i) => (i === index ? current : s)) : action.songs;
      return { songs, currentIndex: Math.max(0, index), revision: state.revision + 1 };
    }
    case 'touch':
      return { ...state, songs: [...state.songs], revision: state.revision + 1 };
  }
};

export const currentSongOf = (state: SetlistState): Song | null => state.songs[state.currentIndex] ?? null;
