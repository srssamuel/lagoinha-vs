import React, { useRef } from 'react';
import { Song } from '../../domain/entities/Song';
import { ListMusic, Plus, Play, Calendar, Music } from 'lucide-react';
import { TrackStem } from '../../domain/entities/TrackStem';

interface SetlistSidebarProps {
  songs: Song[];
  currentSongIndex: number;
  isPlaying: boolean;
  onSelectSong: (index: number) => void;
  onImportCustomSong: (song: Song) => void;
}

export const SetlistSidebar: React.FC<SetlistSidebarProps> = ({
  songs,
  currentSongIndex,
  isPlaying,
  onSelectSong,
  onImportCustomSong
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Converte os arquivos de áudio selecionados em stems de uma nova música
    const stems: TrackStem[] = Array.from(files).map((file, idx) => {
      const fileNameLower = file.name.toLowerCase();
      let type: TrackStem['type'] = 'other' as unknown as TrackStem['type'];

      if (fileNameLower.includes('click') || fileNameLower.includes('metronomo')) {
        type = 'click';
      } else if (fileNameLower.includes('guia') || fileNameLower.includes('cue') || fileNameLower.includes('guide')) {
        type = 'guide';
      } else if (fileNameLower.includes('bateria') || fileNameLower.includes('drum') || fileNameLower.includes('loop')) {
        type = 'drums';
      } else if (fileNameLower.includes('baixo') || fileNameLower.includes('bass')) {
        type = 'bass';
      } else if (fileNameLower.includes('guitar') || fileNameLower.includes('violao') || fileNameLower.includes('acoustic')) {
        type = 'guitars';
      } else if (fileNameLower.includes('teclado') || fileNameLower.includes('piano') || fileNameLower.includes('key')) {
        type = 'keys';
      } else if (fileNameLower.includes('pad') || fileNameLower.includes('synth')) {
        type = 'pad';
      } else {
        type = 'fx';
      }

      return new TrackStem({
        id: `imported-stem-${idx}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        type,
        volume: 0.8,
        pan: 0,
        isMuted: false,
        isSolo: false,
        audioUrl: URL.createObjectURL(file)
      });
    });

    const newSong = new Song({
      id: `imported-song-${Date.now()}`,
      title: 'Música Importada (Arquivos Locais)',
      artist: 'Lagoinha Worship',
      originalKey: 'G',
      currentKey: 'G',
      bpm: 120,
      timeSignature: { beats: 4, value: 4 },
      duration: 240,
      sections: [],
      stems
    });

    onImportCustomSong(newSong);
  };

  return (
    <aside className="w-full lg:w-72 xl:w-80 bg-stage-surface border-b lg:border-b-0 lg:border-r border-stage-border flex flex-col justify-between shrink-0 lg:h-full">
      {/* Topo do Repertório */}
      <div className="p-4 border-b border-stage-border">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-slate-100 font-bold text-sm uppercase tracking-wide">
            <ListMusic className="w-4 h-4 text-blue-400" />
            <span>Repertório do Culto</span>
          </div>
          <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full">
            {songs.length} Músicas
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-stage-muted mt-1">
          <Calendar className="w-3.5 h-3.5" />
          <span>Culto de Celebração • Lagoinha JP</span>
        </div>
      </div>

      {/* Lista de Músicas do Setlist */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {songs.map((song, idx) => {
          const isSelected = currentSongIndex === idx;

          return (
            <button
              key={song.id}
              onClick={() => onSelectSong(idx)}
              className={`w-full p-3 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                isSelected
                  ? 'bg-blue-600/20 border-blue-500/80 shadow-lg shadow-blue-500/10'
                  : 'bg-stage-card border-stage-border hover:border-slate-700 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono font-bold text-stage-muted">
                  #{idx + 1}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-black text-stage-amber bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 rounded">
                    Tom {song.currentKey}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">
                    {song.bpm} BPM
                  </span>
                </div>
              </div>

              <div className="font-bold text-sm text-slate-100 truncate flex items-center gap-2">
                {isSelected && isPlaying ? (
                  <Play className="w-3.5 h-3.5 text-emerald-400 fill-current shrink-0 animate-pulse" />
                ) : (
                  <Music className="w-3.5 h-3.5 text-stage-muted shrink-0" />
                )}
                <span className="truncate">{song.title}</span>
              </div>

              <div className="text-xs text-stage-muted truncate mt-0.5">
                {song.artist}
              </div>
            </button>
          );
        })}
      </div>

      {/* Botão de Importar Multitracks Locais */}
      <div className="p-4 border-t border-stage-border bg-stage-card/40">
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="audio/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 px-4 rounded-xl border border-dashed border-stage-border hover:border-blue-500/60 bg-stage-surface text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition"
        >
          <Plus className="w-4 h-4 text-blue-400" />
          <span>Importar Multitracks (WAV/MP3)</span>
        </button>
      </div>
    </aside>
  );
};
