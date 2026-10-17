import React, { useState } from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, Repeat, AlertOctagon, Activity } from 'lucide-react';

interface TransportBarProps {
  isPlaying: boolean;
  isLoopingSection: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrevSong: () => void;
  onNextSong: () => void;
  onToggleLoop: () => void;
  onPanic: () => void;
  onTapTempo: (bpm: number) => void;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  isPlaying,
  isLoopingSection,
  onPlay,
  onPause,
  onStop,
  onPrevSong,
  onNextSong,
  onToggleLoop,
  onPanic,
  onTapTempo
}) => {
  // Tap tempo local calculation
  const [tapTimes, setTapTimes] = useState<number[]>([]);

  const handleTap = () => {
    const now = performance.now();
    const newTaps = [...tapTimes, now].filter((t) => now - t < 3000); // 3s window
    setTapTimes(newTaps);

    if (newTaps.length >= 3) {
      const intervals = [];
      for (let i = 1; i < newTaps.length; i++) {
        const prev = newTaps[i - 1];
        const curr = newTaps[i];
        if (prev !== undefined && curr !== undefined) {
          intervals.push(curr - prev);
        }
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avgInterval);
      if (bpm >= 40 && bpm <= 240) {
        onTapTempo(bpm);
      }
    }
  };

  return (
    <div className="bg-stage-surface/90 border-b border-stage-border px-6 py-3 flex items-center justify-between gap-4">
      {/* Setlist Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPrevSong}
          className="p-3 rounded-xl bg-stage-card border border-stage-border text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95"
          title="Música Anterior (Tecla P)"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        <button
          onClick={onNextSong}
          className="p-3 rounded-xl bg-stage-card border border-stage-border text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95"
          title="Próxima Música (Tecla N)"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>

      {/* Primary Transport Engine Controls */}
      <div className="flex items-center gap-3">
        {/* Play / Pause - Grande e tátil para palco */}
        <button
          onClick={isPlaying ? onPause : onPlay}
          className={`flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl font-black text-sm tracking-wide transition-all shadow-lg active:scale-95 ${
            isPlaying
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25 ring-2 ring-amber-400/40'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25 ring-2 ring-blue-400/40'
          }`}
          title="Reproduzir / Pausar (Barra de Espaço)"
        >
          {isPlaying ? (
            <>
              <Pause className="w-5 h-5 fill-current" />
              <span>PAUSAR</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              <span>DAR PLAY</span>
            </>
          )}
        </button>

        {/* Stop Button */}
        <button
          onClick={onStop}
          className="p-3.5 rounded-2xl bg-stage-card border border-stage-border text-slate-300 hover:text-rose-400 hover:border-rose-500/40 transition active:scale-95"
          title="Parar e voltar ao início"
        >
          <Square className="w-5 h-5 fill-current" />
        </button>

        {/* Section Looper (Repetir Seção) */}
        <button
          onClick={onToggleLoop}
          className={`flex items-center gap-2 px-4 py-3 rounded-2xl border text-xs font-bold transition active:scale-95 ${
            isLoopingSection
              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-lg shadow-emerald-500/10'
              : 'bg-stage-card border-stage-border text-stage-muted hover:text-white hover:bg-slate-800'
          }`}
          title="Repetir Seção Atual Infinitamente para Ministração Espontânea (Tecla R)"
        >
          <Repeat className={`w-4 h-4 ${isLoopingSection ? 'animate-spin' : ''}`} />
          <span>{isLoopingSection ? 'LOOP ATIVO' : 'REPETIR SEÇÃO'}</span>
        </button>
      </div>

      {/* Tap Tempo & Panic Safety */}
      <div className="flex items-center gap-3">
        {/* Tap Tempo */}
        <button
          onClick={handleTap}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stage-card border border-stage-border text-xs font-bold text-slate-300 hover:text-white hover:border-blue-500/50 transition active:scale-95"
          title="Bata no ritmo para ajustar o BPM da música"
        >
          <Activity className="w-4 h-4 text-blue-400" />
          <span>TAP TEMPO</span>
        </button>

        {/* Panic Button (Corte seguro de som) */}
        <button
          onClick={onPanic}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition active:scale-95"
          title="Botão de Pânico: Fade out rápido de emergência (Tecla ESC)"
        >
          <AlertOctagon className="w-4 h-4 text-rose-400" />
          <span>PÂNICO</span>
        </button>
      </div>
    </div>
  );
};
