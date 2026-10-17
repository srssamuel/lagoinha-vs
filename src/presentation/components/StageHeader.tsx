import React from 'react';
import { Volume2, Radio, Music2, ShieldCheck } from 'lucide-react';
import { Song } from '../../domain/entities/Song';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';

interface StageHeaderProps {
  currentSong: Song | null;
  currentBeat: number;
  currentBar: number;
  isPlaying: boolean;
  routingMode: RoutingMode;
  masterVolume: number;
  onMasterVolumeChange: (vol: number) => void;
  onOpenRoutingModal: () => void;
}

export const StageHeader: React.FC<StageHeaderProps> = ({
  currentSong,
  currentBeat,
  currentBar,
  isPlaying,
  routingMode,
  masterVolume,
  onMasterVolumeChange,
  onOpenRoutingModal
}) => {
  return (
    <header className="bg-stage-surface border-b border-stage-border px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-xl">
      {/* Brand & Church Identity */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
          <Music2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-white tracking-wide uppercase">
              Lagoinha VS
            </h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
              JOÃO PESSOA
            </span>
          </div>
          <p className="text-xs text-stage-muted">
            {currentSong ? `${currentSong.title} • ${currentSong.artist}` : 'Selecione uma música do repertório'}
          </p>
        </div>
      </div>

      {/* Musical Stage Telemetry */}
      {currentSong && (
        <div className="flex items-center gap-6 bg-stage-card/70 border border-stage-border px-5 py-2 rounded-2xl shadow-inner">
          {/* Tom / Key */}
          <div className="text-center">
            <span className="text-[10px] text-stage-muted uppercase tracking-wider block font-semibold">Tom</span>
            <span className="text-xl font-black text-stage-amber font-mono">
              {currentSong.currentKey}
            </span>
          </div>

          <div className="w-px h-8 bg-stage-border/60" />

          {/* BPM com LED pulsante */}
          <div className="text-center flex flex-col items-center">
            <span className="text-[10px] text-stage-muted uppercase tracking-wider block font-semibold">BPM</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-white font-mono">
                {currentSong.bpm}
              </span>
              <span
                className={`w-3 h-3 rounded-full transition-all duration-100 ${
                  isPlaying
                    ? currentBeat === 1
                      ? 'bg-blue-400 shadow-lg shadow-blue-500 scale-125'
                      : 'bg-blue-800 scale-90 opacity-60'
                    : 'bg-slate-700 opacity-40'
                }`}
              />
            </div>
          </div>

          <div className="w-px h-8 bg-stage-border/60" />

          {/* Compasso & Batida */}
          <div className="text-center">
            <span className="text-[10px] text-stage-muted uppercase tracking-wider block font-semibold">Compasso</span>
            <div className="font-mono text-xl font-bold text-slate-100">
              <span className="text-white">{currentBar}</span>
              <span className="text-stage-muted text-sm mx-1">.</span>
              <span className="text-blue-400">{currentBeat}</span>
            </div>
          </div>

          <div className="w-px h-8 bg-stage-border/60" />

          {/* Fórmula de Compasso */}
          <div className="text-center">
            <span className="text-[10px] text-stage-muted uppercase tracking-wider block font-semibold">Métrica</span>
            <span className="text-sm font-bold text-slate-300 font-mono">
              {currentSong.timeSignature.beats}/{currentSong.timeSignature.value}
            </span>
          </div>
        </div>
      )}

      {/* Output Routing Badge & Master Volume */}
      <div className="flex items-center gap-4">
        {/* Roteamento de Palco (Split vs Stereo) */}
        <button
          onClick={onOpenRoutingModal}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
            routingMode === 'SPLIT_IEM_PA'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
          }`}
          title="Clique para configurar saídas de áudio"
        >
          {routingMode === 'SPLIT_IEM_PA' ? (
            <>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>SPLIT: FONE L / PA R</span>
            </>
          ) : (
            <>
              <Radio className="w-4 h-4 text-blue-400" />
              <span>STEREO FULL</span>
            </>
          )}
        </button>

        {/* Master Volume Slider */}
        <div className="flex items-center gap-2 bg-stage-card px-3 py-1.5 rounded-xl border border-stage-border">
          <Volume2 className="w-4 h-4 text-stage-muted" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
            className="w-20 accent-blue-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            title={`Volume Geral: ${Math.round(masterVolume * 100)}%`}
          />
          <span className="text-xs font-mono text-slate-300 w-8 text-right">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>
      </div>
    </header>
  );
};
