import React, { useMemo } from 'react';
import { Song } from '../../domain/entities/Song';

interface WaveformDisplayProps {
  currentSong: Song | null;
  currentTime: number;
  duration: number;
  activeSectionId: string | null;
  queuedSectionId: string | null;
  onSeek: (seconds: number) => void;
  onSelectSection: (sectionId: string) => void;
}

export const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
  currentSong,
  currentTime,
  duration,
  activeSectionId,
  queuedSectionId,
  onSeek,
  onSelectSection
}) => {
  // Gera formato de onda pseudo-aleatório consistente por música
  const waveformBars = useMemo(() => {
    const barsCount = 120;
    const bars: number[] = [];
    const seed = currentSong?.bpm || 120;
    for (let i = 0; i < barsCount; i++) {
      // Simula dinâmica de culto (intro suave, versos médios, refrões altos com bateria pesada)
      const phase = (i / barsCount) * Math.PI * 4;
      const baseHeight = 0.25 + 0.35 * Math.abs(Math.sin(phase));
      const variation = 0.15 * Math.sin(i * 13 + seed);
      bars.push(Math.min(1.0, Math.max(0.12, baseHeight + variation)));
    }
    return bars;
  }, [currentSong?.id, currentSong?.bpm]);

  if (!currentSong || duration <= 0) return null;

  const playheadPercent = Math.min(100, (currentTime / duration) * 100);

  return (
    <div className="bg-stage-surface/95 border-b border-stage-border px-6 py-2 select-none relative">
      {/* Waveform Canvas & Slices Container */}
      <div
        className="relative h-20 bg-slate-950/80 rounded-xl overflow-hidden border border-stage-border/60 cursor-pointer shadow-inner"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, clickX / rect.width));
          onSeek(ratio * duration);
        }}
      >
        {/* Fatias Coloridas de Seção no Fundo (Estilo Fader Club / Multitracks Elite) */}
        <div className="absolute inset-0 flex pointer-events-none">
          {currentSong.sections.map((sec, idx) => {
            const widthPercent = (sec.duration / duration) * 100;
            const isActive = activeSectionId === sec.id;
            const isQueued = queuedSectionId === sec.id;

            // Cores alternadas e vivas de palco
            const sectionColors = [
              'bg-blue-600/15 border-blue-500/30 text-blue-300',
              'bg-indigo-600/15 border-indigo-500/30 text-indigo-300',
              'bg-amber-600/15 border-amber-500/30 text-amber-300',
              'bg-purple-600/15 border-purple-500/30 text-purple-300',
              'bg-emerald-600/15 border-emerald-500/30 text-emerald-300',
              'bg-rose-600/15 border-rose-500/30 text-rose-300'
            ];
            const colorClass = sectionColors[idx % sectionColors.length];

            return (
              <div
                key={sec.id}
                style={{ width: `${widthPercent}%` }}
                className={`relative h-full border-r ${colorClass} flex flex-col justify-between p-1 transition-all ${
                  isActive
                    ? 'ring-1 ring-inset ring-blue-400 bg-blue-500/25 shadow-lg'
                    : isQueued
                    ? 'ring-2 ring-inset ring-amber-400 bg-amber-500/30 animate-pulse'
                    : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSection(sec.id);
                }}
              >
                {/* Tag Curta de Seção (ex: V1, R8, P9 estilo Fader Club) */}
                <div className="flex items-center justify-between text-[9px] font-mono font-black tracking-wider">
                  <span className="bg-slate-900/80 px-1 py-0.2 rounded border border-white/10 uppercase">
                    {sec.type === 'chorus' ? `R${idx + 1}` : sec.type === 'bridge' ? `P${idx + 1}` : `V${idx + 1}`}
                  </span>
                  <span className="text-[8px] opacity-70 truncate ml-1">{sec.name}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Barras da Onda Sonora (Waveform Peaks) */}
        <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none opacity-85">
          {waveformBars.map((bar, i) => {
            const barPosPercent = (i / waveformBars.length) * 100;
            const isPlayed = barPosPercent <= playheadPercent;

            return (
              <div
                key={i}
                className="w-1 rounded-full transition-all duration-75"
                style={{
                  height: `${bar * 100}%`,
                  backgroundColor: isPlayed ? '#60a5fa' : '#334155',
                  boxShadow: isPlayed ? '0 0 6px rgba(96, 165, 250, 0.5)' : 'none'
                }}
              />
            );
          })}
        </div>

        {/* Playhead Scrubber / Agulha de Reprodução em Tempo Real */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-300 via-white to-amber-300 shadow-lg shadow-amber-400 z-10 pointer-events-none transition-all duration-75"
          style={{ left: `${playheadPercent}%` }}
        >
          <div className="w-2.5 h-2.5 bg-amber-400 rounded-full -ml-1 -mt-0.5 shadow-md ring-2 ring-slate-950" />
        </div>
      </div>
    </div>
  );
};
