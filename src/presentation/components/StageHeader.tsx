import React from 'react';
import { Volume2, Radio, Music2, ShieldCheck, Minus, Plus } from 'lucide-react';
import { Song } from '../../domain/entities/Song';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';

interface StageHeaderProps {
  songs: Song[];
  currentSongIndex: number;
  currentSong: Song | null;
  currentBeat: number;
  currentBar: number;
  isPlaying: boolean;
  routingMode: RoutingMode;
  masterVolume: number;
  onSelectSongIndex: (idx: number) => void;
  onBpmChange: (newBpm: number) => void;
  onMasterVolumeChange: (vol: number) => void;
  onOpenRoutingModal: () => void;
}

export const StageHeader: React.FC<StageHeaderProps> = ({
  songs,
  currentSongIndex,
  currentSong,
  currentBeat,
  currentBar,
  isPlaying,
  routingMode,
  masterVolume,
  onSelectSongIndex,
  onBpmChange,
  onMasterVolumeChange,
  onOpenRoutingModal
}) => {
  return (
    <header className="bg-stage-surface border-b border-stage-border px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
      {/* Brand & Church Identity */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10 shrink-0">
          <Music2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-white tracking-wide uppercase">
              Lagoinha VS
            </h1>
            <span className="text-[9px] font-bold px-2 py-0.2 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
              JOÃO PESSOA
            </span>
          </div>
          <p className="text-[11px] text-stage-muted truncate max-w-[200px]">
            {currentSong ? `${currentSong.title} • ${currentSong.artist}` : 'Repertório do Culto'}
          </p>
        </div>
      </div>

      {/* Setlist Song Thumbnails Ribbon (Estilo Fader Club / Multitracks Elite) */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-md lg:max-w-xl">
        {songs.map((song, idx) => {
          const isSelected = currentSongIndex === idx;
          return (
            <button
              key={song.id}
              onClick={() => onSelectSongIndex(idx)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all shrink-0 active:scale-95 ${
                isSelected
                  ? 'bg-blue-600/30 border-blue-400 text-white shadow-md shadow-blue-500/20 ring-1 ring-blue-400/50'
                  : 'bg-stage-card border-stage-border text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-[10px] font-black text-slate-300 font-mono">
                {idx + 1}
              </div>
              <div className="text-left">
                <div className="text-xs font-bold truncate max-w-[110px]">
                  {song.title}
                </div>
                <div className="text-[9px] font-mono text-stage-amber">
                  Tom {song.currentKey} • {song.bpm} BPM
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Musical Stage Telemetry */}
      {currentSong && (
        <div className="flex items-center gap-5 bg-stage-card/70 border border-stage-border px-4 py-1.5 rounded-2xl shadow-inner">
          {/* Tom / Key */}
          <div className="text-center">
            <span className="text-[9px] text-stage-muted uppercase tracking-wider block font-semibold">Tom</span>
            <span className="text-lg font-black text-stage-amber font-mono">
              {currentSong.currentKey}
            </span>
          </div>

          <div className="w-px h-7 bg-stage-border/60" />

          {/* BPM com Botões [-] [+] e LED pulsante */}
          <div className="text-center flex flex-col items-center">
            <span className="text-[9px] text-stage-muted uppercase tracking-wider block font-semibold">BPM</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onBpmChange(Math.max(40, currentSong.bpm - 1))}
                className="w-5 h-5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
                title="Diminuir 1 BPM"
              >
                <Minus className="w-3 h-3" />
              </button>

              <span className="text-lg font-black text-white font-mono min-w-[34px]">
                {currentSong.bpm}
              </span>

              <button
                onClick={() => onBpmChange(Math.min(240, currentSong.bpm + 1))}
                className="w-5 h-5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
                title="Aumentar 1 BPM"
              >
                <Plus className="w-3 h-3" />
              </button>

              <span
                className={`w-2.5 h-2.5 rounded-full transition-all duration-70 ml-1 ${
                  isPlaying
                    ? currentBeat === 1
                      ? 'bg-blue-400 shadow-md shadow-blue-400 scale-125'
                      : 'bg-blue-800 scale-90 opacity-60'
                    : 'bg-slate-700 opacity-40'
                }`}
              />
            </div>
          </div>

          <div className="w-px h-7 bg-stage-border/60" />

          {/* Compasso & Batida */}
          <div className="text-center">
            <span className="text-[9px] text-stage-muted uppercase tracking-wider block font-semibold">Compasso</span>
            <div className="font-mono text-base font-bold text-slate-100">
              <span className="text-white">{currentBar}</span>
              <span className="text-stage-muted text-xs mx-0.5">.</span>
              <span className="text-blue-400">{currentBeat}</span>
            </div>
          </div>

          <div className="w-px h-7 bg-stage-border/60" />

          {/* Métrica */}
          <div className="text-center">
            <span className="text-[9px] text-stage-muted uppercase tracking-wider block font-semibold">Métrica</span>
            <span className="text-xs font-bold text-slate-300 font-mono">
              {currentSong.timeSignature.beats}/{currentSong.timeSignature.value}
            </span>
          </div>
        </div>
      )}

      {/* Output Routing Badge & Master Volume */}
      <div className="flex items-center gap-3">
        {/* Roteamento de Palco (Split vs Stereo) */}
        <button
          onClick={onOpenRoutingModal}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all ${
            routingMode === 'SPLIT_IEM_PA'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
          }`}
          title="Clique para configurar saídas de áudio"
        >
          {routingMode === 'SPLIT_IEM_PA' ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>SPLIT L/R</span>
            </>
          ) : (
            <>
              <Radio className="w-3.5 h-3.5 text-blue-400" />
              <span>STEREO</span>
            </>
          )}
        </button>

        {/* Master Volume Slider */}
        <div className="flex items-center gap-2 bg-stage-card px-2.5 py-1.5 rounded-xl border border-stage-border">
          <Volume2 className="w-3.5 h-3.5 text-stage-muted" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
            className="w-16 accent-blue-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            title={`Volume Master: ${Math.round(masterVolume * 100)}%`}
          />
          <span className="text-[11px] font-mono text-slate-300 w-7 text-right">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>
      </div>
    </header>
  );
};
