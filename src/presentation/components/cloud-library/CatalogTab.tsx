import React from 'react';
import { Search } from 'lucide-react';
import { CloudSong } from '../../../domain/entities/CloudSong';
import { CloudSongRow } from './CloudSongRow';

const KEY_FILTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Em', 'Ab', 'Gb'];

interface CatalogTabProps {
  songs: CloudSong[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  selectedKey: string;
  onSelectedKeyChange: (value: string) => void;
  addedSongIds: Set<string>;
  busySongId?: string | null;
  onAddSong: (song: CloudSong) => void;
}

/** Aba Catálogo Geral: busca por título/artista/tag e filtro por tom. */
export const CatalogTab: React.FC<CatalogTabProps> = ({
  songs,
  searchQuery,
  onSearchQueryChange,
  selectedKey,
  onSelectedKeyChange,
  addedSongIds,
  busySongId = null,
  onAddSong
}) => (
  <div className="flex-1 flex flex-col overflow-hidden">
    {/* Barra de Pesquisa e Filtros */}
    <div className="flex items-center gap-3 mb-4 shrink-0">
      <div className="relative flex-1">
        <Search className="w-4 h-4 text-stage-muted absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Pesquisar por título, artista ou tag (ex: O Nosso General, Casa Worship, Bondade de Deus)..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <select
        value={selectedKey}
        onChange={(e) => onSelectedKeyChange(e.target.value)}
        className="px-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-slate-300 focus:outline-none font-mono"
      >
        <option value="">Todos os Tons</option>
        {KEY_FILTERS.map((k) => (
          <option key={k} value={k}>
            Tom {k}
          </option>
        ))}
      </select>
    </div>

    {/* Lista de Músicas no Banco de VS */}
    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
      {songs.map((song) => (
        <CloudSongRow key={song.id} song={song} variant="catalog" isAdded={addedSongIds.has(song.id)} isBusy={busySongId === song.id} onAdd={onAddSong} />
      ))}
    </div>
  </div>
);
