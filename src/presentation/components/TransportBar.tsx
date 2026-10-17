import React, { useState } from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, Repeat, AlertOctagon, Activity, Headphones, SlidersHorizontal } from 'lucide-react';

interface TransportBarProps {
  isPlaying: boolean;
  isLoopingSection: boolean;
  isSoloClickActive: boolean;
  isLoopClickActive: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrevSong: () => void;
  onNextSong: () => void;
  onToggleLoop: () => void;
  onToggleSoloClick: () => void;
  onToggleLoopClick: () => void;
  onOpenMidiModal: () => void;
  onPanic: () => void;
  onTapTempo: (bpm: number) => void;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  isPlaying,
  isLoopingSection,
  isSoloClickActive,
  isLoopClickActive,
  onPlay,
  onPause,
  onStop,
  onPrevSong,
  onNextSong,
  onToggleLoop,
  onToggleSoloClick,
  onToggleLoopClick,
  onOpenMidiModal,
  onPanic,
  onTapTempo
}) => {
  const [tapTimes, setTapTimes] = useState<number[]>([]);

  const handleTap = () => {
    const now = performance.now();
    const newTaps = [...tapTimes, now].filter((t) => now - t < 3000);
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
    <div className="bg-stage-surface/90 border-b border-stage-border px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
      {/* Setlist Navigation */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onPrevSong}
          className="p-2.5 rounded-xl bg-stage-card border border-stage-border text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95"
          title="Música Anterior (Tecla P)"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        <button
          onClick={onNextSong}
          className="p-2.5 rounded-xl bg-stage-card border border-stage-border text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95"
          title="Próxima Música (Tecla N)"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Transport Engine Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Play / Pause */}
        <button
          onClick={isPlaying ? onPause : onPlay}
          className={`flex items-center justify-center gap-2 px-5 sm:px-7 py-2.5 rounded-2xl font-black text-xs tracking-wide transition-all shadow-lg active:scale-95 ${
            isPlaying
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25 ring-2 ring-amber-400/40'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25 ring-2 ring-blue-400/40'
          }`}
          title="Reproduzir / Pausar (Barra de Espaço)"
        >
          {isPlaying ? (
            <>
              <Pause className="w-4 h-4 fill-current" />
              <span>PAUSAR</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>DAR PLAY</span>
            </>
          )}
        </button>

        {/* Stop Button */}
        <button
          onClick={onStop}
          className="p-2.5 rounded-2xl bg-stage-card border border-stage-border text-slate-300 hover:text-rose-400 hover:border-rose-500/40 transition active:scale-95"
          title="Parar e voltar ao início"
        >
          <Square className="w-4 h-4 fill-current" />
        </button>

        {/* Section Looper */}
        <button
          onClick={onToggleLoop}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-2xl border text-xs font-bold transition active:scale-95 ${
            isLoopingSection
              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/10'
              : 'bg-stage-card border-stage-border text-stage-muted hover:text-white hover:bg-slate-800'
          }`}
          title="Repetir Seção Atual Infinitamente para Ministração Espontânea (Tecla R)"
        >
          <Repeat className={`w-3.5 h-3.5 ${isLoopingSection ? 'animate-spin' : ''}`} />
          <span>{isLoopingSection ? 'LOOP ATIVO' : 'REPETIR SEÇÃO'}</span>
        </button>

        {/* Solo Click (Live Rescue: Banda Errou?) - Estilo Fader Club */}
        <button
          onClick={onToggleSoloClick}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-bold transition active:scale-95 ${
            isSoloClickActive
              ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md shadow-amber-500/20'
              : 'bg-stage-card border-stage-border text-slate-300 hover:text-amber-400 hover:border-amber-500/40'
          }`}
          title="Banda Errou? Deixa estritamente o click e guia no fone para recuperação (Tecla C)"
        >
          <Headphones className="w-3.5 h-3.5" />
          <span>SOLO CLICK</span>
        </button>

        {/* Loop Click */}
        <button
          onClick={onToggleLoopClick}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-bold transition active:scale-95 ${
            isLoopClickActive
              ? 'bg-blue-500/20 border-blue-400 text-blue-300'
              : 'bg-stage-card border-stage-border text-stage-muted hover:text-white'
          }`}
          title="Mantém o metrônomo rodando continuamente mesmo se a música parar"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>LOOP CLICK</span>
        </button>
      </div>

      {/* MIDI Modal, Tap Tempo & Panic */}
      <div className="flex flex-wrap items-center gap-2">
        {/* MIDI / Teclado Mapper Button */}
        <button
          onClick={onOpenMidiModal}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stage-card border border-stage-border text-xs font-bold text-slate-300 hover:text-purple-400 hover:border-purple-500/40 transition active:scale-95"
          title="Configurar Pedaleira MIDI e Atalhos de Teclado"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
          <span>MIDI / TECLADO</span>
        </button>

        {/* Tap Tempo */}
        <button
          onClick={handleTap}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stage-card border border-stage-border text-xs font-bold text-slate-300 hover:text-white hover:border-blue-500/50 transition active:scale-95"
          title="Bata no ritmo para ajustar o BPM"
        >
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          <span>TAP</span>
        </button>

        {/* Panic Button */}
        <button
          onClick={onPanic}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition active:scale-95"
          title="Botão de Pânico: Corte rápido com fade out de emergência (Tecla ESC)"
        >
          <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
          <span>PÂNICO</span>
        </button>
      </div>
    </div>
  );
};
