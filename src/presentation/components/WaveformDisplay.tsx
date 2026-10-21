import React, { useMemo, useState } from 'react';
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
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // Calcula picos reais a partir do buffer decodificado da música (ex: Bateria ou Mix),
  // ou gera perfil dinâmico de culto se ainda não decodificado
  // Tenta encontrar o buffer da bateria ou baixo ou primeiro stem carregado.
  // Fica fora do useMemo porque os stems são mutáveis: o buffer decodificado
  // chega no mesmo array e precisa invalidar a forma de onda.
  const referenceBuffer = currentSong
    ? (currentSong.stems.find((s) => s.type === 'drums' && s.audioBuffer) ||
        currentSong.stems.find((s) => s.type === 'bass' && s.audioBuffer) ||
        currentSong.stems.find((s) => s.audioBuffer))?.audioBuffer ?? null
    : null;
  const songBpm = currentSong?.bpm;
  const hasSong = Boolean(currentSong);

  const waveformBars = useMemo(() => {
    const barsCount = 130;
    if (!hasSong) return [];

    if (referenceBuffer) {
      const buffer = referenceBuffer;
      const channelData = buffer.getChannelData(0);
      const blockSize = Math.floor(channelData.length / barsCount);
      const peaks: number[] = [];

      for (let i = 0; i < barsCount; i++) {
        let max = 0;
        const start = i * blockSize;
        const end = Math.min(start + blockSize, channelData.length);
        // Amostragem RMS a cada 16 samples para máxima performance
        for (let j = start; j < end; j += 16) {
          const val = Math.abs(channelData[j] ?? 0);
          if (val > max) max = val;
        }
        peaks.push(Math.max(0.12, Math.min(1.0, max * 1.8)));
      }
      return peaks;
    }

    // Perfil dinâmico de palco enquanto o arquivo de áudio carrega
    const bars: number[] = [];
    const seed = songBpm || 120;
    for (let i = 0; i < barsCount; i++) {
      const phase = (i / barsCount) * Math.PI * 4;
      const baseHeight = 0.28 + 0.35 * Math.abs(Math.sin(phase));
      const variation = 0.15 * Math.sin(i * 13 + seed);
      bars.push(Math.min(1.0, Math.max(0.12, baseHeight + variation)));
    }
    return bars;
  }, [hasSong, referenceBuffer, songBpm]);

  if (!currentSong || duration <= 0) return null;

  const playheadPercent = Math.min(100, (currentTime / duration) * 100);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    setHoverTime(ratio * duration);
    setHoverX(x);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    setHoverX(null);
  };

  const hoverSection = hoverTime !== null ? currentSong.getActiveSection(hoverTime) : null;

  return (
    <div className="bg-stage-surface/95 border-b border-stage-border px-5 py-2 select-none relative">
      {/* Waveform Canvas & Slices Container */}
      <div
        className="relative h-20 bg-slate-950/90 rounded-xl overflow-hidden border border-stage-border/60 cursor-pointer shadow-inner"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, clickX / rect.width));
          onSeek(ratio * duration);
        }}
      >
        {/* Fatias Coloridas de Seção no Fundo (Estilo MultiTracks Playback / Fader Club) */}
        <div className="absolute inset-0 flex pointer-events-none">
          {currentSong.sections.map((sec, idx) => {
            const widthPercent = (sec.duration / duration) * 100;
            const isActive = activeSectionId === sec.id;
            const isQueued = queuedSectionId === sec.id;

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
                {/* Tag Curta de Seção */}
                <div className="flex items-center justify-between text-[9px] font-mono font-black tracking-wider">
                  <span className="bg-slate-900/80 px-1 py-0.2 rounded border border-white/10 uppercase">
                    {sec.type === 'chorus' ? `R${idx + 1}` : sec.type === 'bridge' ? `P${idx + 1}` : `V${idx + 1}`}
                  </span>
                  <span className="text-[8px] opacity-75 truncate ml-1">{sec.name}</span>
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
                  boxShadow: isPlayed ? '0 0 6px rgba(96, 165, 250, 0.4)' : 'none'
                }}
              />
            );
          })}
        </div>

        {/* Linha e Tooltip de Hover */}
        {hoverX !== null && hoverTime !== null && (
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-white/50 pointer-events-none z-20"
            style={{ left: `${hoverX}px` }}
          >
            <div className="absolute top-1 left-2 bg-slate-900/95 border border-slate-700 px-2 py-0.5 rounded text-[10px] font-mono text-slate-200 shadow-xl whitespace-nowrap">
              <span>{formatTime(hoverTime)}</span>
              {hoverSection && <span className="text-amber-300 ml-1.5">• {hoverSection.name}</span>}
            </div>
          </div>
        )}

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
