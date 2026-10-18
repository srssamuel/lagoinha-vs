import React, { useRef, useState } from 'react';
import { Song } from '../../domain/entities/Song';
import { SongSection } from '../../domain/value-objects/SongSection';
import {
  ListMusic,
  Play,
  Calendar,
  Music,
  Trash2,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  FolderArchive
} from 'lucide-react';
import { TrackStem } from '../../domain/entities/TrackStem';
import { ZipMultitrackExtractor } from '../../infrastructure/audio/ZipMultitrackExtractor';
import { VstPluginRackService } from '../../domain/services/VstPluginRackService';

interface SetlistSidebarProps {
  songs: Song[];
  currentSongIndex: number;
  isPlaying: boolean;
  onSelectSong: (index: number) => void;
  onRemoveSong: (index: number) => void;
  onMoveSong: (fromIndex: number, toIndex: number) => void;
  onRestoreDefaultSetlist: () => void;
  onImportCustomSong: (song: Song) => void;
}

export const SetlistSidebar: React.FC<SetlistSidebarProps> = ({
  songs,
  currentSongIndex,
  isPlaying,
  onSelectSong,
  onRemoveSong,
  onMoveSong,
  onRestoreDefaultSetlist,
  onImportCustomSong
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExtractingZip, setIsExtractingZip] = useState(false);

  const buildStandardSections = (prefix: string, duration: number, bpm: number): SongSection[] => {
    const barSec = (60 / bpm) * 4;
    const totalBars = Math.max(16, Math.round(duration / barSec));
    const introEnd = Math.min(duration * 0.1, 20);
    const v1End = Math.min(duration * 0.28, 60);
    const ref1End = Math.min(duration * 0.5, 110);
    const ponteEnd = Math.min(duration * 0.78, 180);

    return [
      new SongSection({ id: `${prefix}-intro`, name: 'Intro', type: 'intro', startBar: 1, barCount: 8, startTime: 0, endTime: Math.round(introEnd) }),
      new SongSection({ id: `${prefix}-v1`, name: 'Verso', type: 'verse', startBar: 9, barCount: 16, startTime: Math.round(introEnd), endTime: Math.round(v1End) }),
      new SongSection({ id: `${prefix}-ref`, name: 'Refrão', type: 'chorus', startBar: 25, barCount: 16, startTime: Math.round(v1End), endTime: Math.round(ref1End) }),
      new SongSection({ id: `${prefix}-ponte`, name: 'Ponte / Instrumental', type: 'bridge', startBar: 41, barCount: 16, startTime: Math.round(ref1End), endTime: Math.round(ponteEnd) }),
      new SongSection({ id: `${prefix}-final`, name: 'Refrão Final / Outro', type: 'outro', startBar: 57, barCount: Math.max(8, totalBars - 56), startTime: Math.round(ponteEnd), endTime: Math.round(duration) })
    ];
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const zipFile = fileArray.find((f) => f.name.toLowerCase().endsWith('.zip'));

    // Caso 1: Pacote Multitrack completo em .ZIP (ex: "O Nosso General (Versão Mateus Brito) 140Bpm - B.zip")
    if (zipFile) {
      setIsExtractingZip(true);
      try {
        const meta = ZipMultitrackExtractor.parseMetadataFromZipName(zipFile.name);
        const arrayBuf = await zipFile.arrayBuffer();
        const entries = await ZipMultitrackExtractor.extractAudioFiles(arrayBuf);

        const stems: TrackStem[] = entries.map((entry, idx) => {
          const info = TrackStem.classifyStemFromFilename(entry.filename);
          const blob = new Blob([entry.data], {
            type: entry.filename.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'
          });
          return new TrackStem({
            id: `zip-stem-${Date.now()}-${idx}`,
            name: info.displayName,
            type: info.type,
            volume: info.type === 'click' ? 0.85 : info.type === 'guide' ? 0.95 : 1.0,
            pan: info.defaultPan,
            isMuted: false,
            isSolo: false,
            isPitchShiftable: info.isPitchShiftable,
            audioUrl: URL.createObjectURL(blob)
          });
        });

        // Ordena os stems na sequência padrão de palco: Click, Guia, Bateria, Loop, Baixo, Violão, Guitarras, Teclas, Pad, Vocals
        const orderRank: Record<TrackStem['type'], number> = {
          click: 1,
          guide: 2,
          drums: 3,
          loop: 4,
          bass: 5,
          violao: 6,
          guitars: 7,
          strings: 8,
          keys: 9,
          pad: 10,
          vocals: 11,
          fx: 12
        };
        stems.sort((a, b) => orderRank[a.type] - orderRank[b.type]);

        VstPluginRackService.applySmartAutoFixAll(stems);

        const duration = 247;
        const songId = `zip-song-${Date.now()}`;
        const newSong = new Song({
          id: songId,
          title: meta.title,
          artist: `${meta.artist} (ZIP ${stems.length} Stems)`,
          originalKey: meta.originalKey,
          currentKey: meta.originalKey,
          bpm: meta.bpm,
          timeSignature: { beats: 4, value: 4 },
          duration,
          sections: buildStandardSections(songId, duration, meta.bpm),
          stems
        });

        onImportCustomSong(newSong);
      } catch (err) {
        console.error('Erro ao extrair pacote Multitrack .ZIP:', err);
      } finally {
        setIsExtractingZip(false);
        e.target.value = '';
      }
      return;
    }

    // Caso 2: Arquivos de áudio WAV/MP3 soltos
    const stems: TrackStem[] = fileArray.map((file, idx) => {
      const info = TrackStem.classifyStemFromFilename(file.name);
      return new TrackStem({
        id: `imported-stem-${Date.now()}-${idx}`,
        name: info.displayName,
        type: info.type,
        volume: info.type === 'click' ? 0.85 : info.type === 'guide' ? 0.95 : 1.0,
        pan: info.defaultPan,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: info.isPitchShiftable,
        audioUrl: URL.createObjectURL(file)
      });
    });

    VstPluginRackService.applySmartAutoFixAll(stems);

    const songId = `imported-song-${Date.now()}`;
    const newSong = new Song({
      id: songId,
      title: 'Multitrack Importada (Stems Locais)',
      artist: 'Lagoinha Worship',
      originalKey: 'G',
      currentKey: 'G',
      bpm: 120,
      timeSignature: { beats: 4, value: 4 },
      duration: 240,
      sections: buildStandardSections(songId, 240, 120),
      stems
    });

    onImportCustomSong(newSong);
    e.target.value = '';
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
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full">
              {songs.length} {songs.length === 1 ? 'Música' : 'Músicas'}
            </span>
            <button
              type="button"
              onClick={onRestoreDefaultSetlist}
              className="p-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-blue-500/50 text-slate-400 hover:text-white transition"
              title="Restaurar repertório padrão do culto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-stage-muted mt-1">
          <Calendar className="w-3.5 h-3.5" />
          <span>Culto de Celebração • Lagoinha JP</span>
        </div>
      </div>

      {/* Lista de Músicas do Setlist com Opção de Excluir e Reordenar */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {songs.length === 0 ? (
          <div className="p-5 rounded-2xl border border-dashed border-slate-800 text-center space-y-2">
            <p className="text-xs text-slate-400 font-semibold">
              Nenhuma música ativa no repertório.
            </p>
            <button
              type="button"
              onClick={onRestoreDefaultSetlist}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Repertório</span>
            </button>
          </div>
        ) : (
          songs.map((song, idx) => {
            const isSelected = currentSongIndex === idx;

            return (
              <div
                key={song.id}
                onClick={() => onSelectSong(idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSong(idx);
                  }
                }}
                className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer group ${
                  isSelected
                    ? 'bg-blue-600/20 border-blue-500/80 shadow-lg shadow-blue-500/10'
                    : 'bg-stage-card border-stage-border hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-mono font-bold text-stage-muted">
                    #{idx + 1}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-black text-stage-amber bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 rounded">
                      Tom {song.currentKey}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">
                      {song.bpm} BPM
                    </span>

                    {/* Botões de Subir / Descer na Ordem do Culto */}
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveSong(idx, idx - 1);
                      }}
                      className="p-1 rounded bg-slate-900/90 border border-slate-700/80 text-slate-400 hover:text-white disabled:opacity-30"
                      title="Subir música na ordem do culto"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === songs.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveSong(idx, idx + 1);
                      }}
                      className="p-1 rounded bg-slate-900/90 border border-slate-700/80 text-slate-400 hover:text-white disabled:opacity-30"
                      title="Descer música na ordem do culto"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>

                    {/* Botão Excluir do Repertório do Culto */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSong(idx);
                      }}
                      aria-label={`Excluir ${song.title} do repertório`}
                      title={`Excluir "${song.title}" do repertório do culto`}
                      className="p-1 rounded bg-rose-950/60 border border-rose-500/30 text-rose-400 hover:bg-rose-600 hover:text-white transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
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

                <div className="flex items-center justify-between text-xs text-stage-muted mt-0.5">
                  <span className="truncate">{song.artist}</span>
                  <span className="text-[10px] font-mono text-slate-300 shrink-0">
                    {song.stems.length} stems
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Botão de Importar Multitracks Locais (.ZIP ou WAV/MP3) */}
      <div className="p-4 border-t border-stage-border bg-stage-card/40">
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept=".zip,application/zip,audio/*"
          className="hidden"
          onChange={(e) => void handleFileUpload(e)}
        />
        <button
          type="button"
          disabled={isExtractingZip}
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 px-4 rounded-xl border border-dashed border-amber-500/40 hover:border-amber-400 bg-stage-surface text-amber-300 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
          title="Suba um arquivo .ZIP de Multitrack (ex: O Nosso General 140Bpm - B.zip) ou vários arquivos .WAV/.MP3"
        >
          {isExtractingZip ? (
            <span>Extraindo pacote Multitrack .ZIP...</span>
          ) : (
            <>
              <FolderArchive className="w-4 h-4 text-amber-400" />
              <span>Subir Multitrack (.ZIP / WAV / MP3)</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
