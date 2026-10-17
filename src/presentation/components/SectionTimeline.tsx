import React from 'react';
import { Song } from '../../domain/entities/Song';
import { SectionType } from '../../domain/value-objects/SongSection';
import { CornerDownRight, CheckCircle2 } from 'lucide-react';

interface SectionTimelineProps {
  currentSong: Song | null;
  currentTime: number;
  duration: number;
  activeSectionId: string | null;
  queuedSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
  onSeek: (seconds: number) => void;
}

const SECTION_COLORS: Record<SectionType, { bg: string; border: string; text: string }> = {
  intro: { bg: 'bg-slate-800/60', border: 'border-slate-700', text: 'text-slate-300' },
  verse: { bg: 'bg-blue-900/40', border: 'border-blue-700/60', text: 'text-blue-300' },
  'pre-chorus': { bg: 'bg-cyan-900/40', border: 'border-cyan-700/60', text: 'text-cyan-300' },
  chorus: { bg: 'bg-amber-900/40', border: 'border-amber-600/60', text: 'text-amber-300' },
  bridge: { bg: 'bg-purple-900/40', border: 'border-purple-600/60', text: 'text-purple-300' },
  vamp: { bg: 'bg-emerald-900/40', border: 'border-emerald-600/60', text: 'text-emerald-300' },
  interlude: { bg: 'bg-indigo-900/40', border: 'border-indigo-600/60', text: 'text-indigo-300' },
  outro: { bg: 'bg-rose-900/40', border: 'border-rose-700/60', text: 'text-rose-300' }
};

export const SectionTimeline: React.FC<SectionTimelineProps> = ({
  currentSong,
  currentTime,
  duration,
  activeSectionId,
  queuedSectionId,
  onSelectSection,
  onSeek
}) => {
  if (!currentSong || currentSong.sections.length === 0) {
    return (
      <div className="bg-stage-card/50 border-b border-stage-border p-6 text-center text-stage-muted text-sm">
        Nenhum mapa de seções disponível para esta música.
      </div>
    );
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-stage-surface border-b border-stage-border px-6 py-4">
      {/* Header com Tempo Atual e Duração */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-stage-muted">
            Mapa de Seções
          </span>
          {queuedSectionId && (
            <span className="flex items-center gap-1.5 text-xs font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full animate-pulse">
              <CornerDownRight className="w-3.5 h-3.5" />
              PULO QUANTIZADO AGENDADO NO PRÓXIMO COMPASSO
            </span>
          )}
        </div>
        <div className="font-mono text-xs font-bold text-slate-300">
          <span className="text-white text-sm">{formatTime(currentTime)}</span>
          <span className="text-stage-muted mx-1">/</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Barra de Progresso Global Clicável */}
      <div
        className="relative h-2 bg-slate-800 rounded-full cursor-pointer overflow-hidden mb-3 border border-slate-700/50"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, clickX / rect.width));
          onSeek(ratio * duration);
        }}
        title="Clique para avançar ou retroceder a música"
      >
        <div
          className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-100 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Grade de Seções da Música (Táteis para Palco) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {currentSong.sections.map((sec, idx) => {
          const isActive = activeSectionId === sec.id;
          const isQueued = queuedSectionId === sec.id;
          const styling = SECTION_COLORS[sec.type] || SECTION_COLORS.verse;

          return (
            <button
              key={sec.id}
              onClick={() => onSelectSection(sec.id)}
              className={`relative px-3 py-2.5 rounded-xl border text-left transition-all active:scale-95 ${
                isActive
                  ? 'bg-blue-600/30 border-blue-400 text-white shadow-lg shadow-blue-500/20 ring-1 ring-blue-400/50'
                  : isQueued
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200 animate-pulse ring-2 ring-amber-400/50'
                  : `${styling.bg} ${styling.border} ${styling.text} hover:brightness-125`
              }`}
              title={`Atalho: Tecla ${idx + 1}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono opacity-60">
                  #{idx + 1}
                </span>
                {isActive && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                )}
              </div>
              <div className="font-bold text-xs truncate mt-0.5">
                {sec.name}
              </div>
              <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between mt-1">
                <span>{sec.barCount} comp.</span>
                <span>{formatTime(sec.startTime)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
