import React from 'react';
import { TrackStem, StemType } from '../../domain/entities/TrackStem';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import { Headphones, Mic, Disc, Layers, Music, Sliders, Sparkles, VolumeX } from 'lucide-react';

interface MultitrackMixerProps {
  stems: TrackStem[];
  routingMode: RoutingMode;
  isPlaying: boolean;
  onVolumeChange: (stemId: string, vol: number) => void;
  onPanChange: (stemId: string, pan: number) => void;
  onToggleMute: (stemId: string) => void;
  onToggleSolo: (stemId: string) => void;
}

const STEM_ICONS: Record<StemType, React.ReactNode> = {
  click: <Headphones className="w-4 h-4 text-blue-400" />,
  guide: <Mic className="w-4 h-4 text-amber-400" />,
  drums: <Disc className="w-4 h-4 text-rose-400" />,
  bass: <Layers className="w-4 h-4 text-emerald-400" />,
  guitars: <Music className="w-4 h-4 text-cyan-400" />,
  keys: <Sliders className="w-4 h-4 text-purple-400" />,
  pad: <Sparkles className="w-4 h-4 text-indigo-400" />,
  vocals: <Mic className="w-4 h-4 text-pink-400" />,
  fx: <Sparkles className="w-4 h-4 text-yellow-400" />
};

export const MultitrackMixer: React.FC<MultitrackMixerProps> = ({
  stems,
  routingMode,
  isPlaying,
  onVolumeChange,
  onPanChange,
  onToggleMute,
  onToggleSolo
}) => {
  const hasAnySolo = stems.some((s) => s.isSolo);

  return (
    <div className="flex-1 bg-stage-bg p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          Console de Mixagem de Multitracks ({stems.length} Canais)
        </h2>
        <span className="text-xs text-stage-muted">
          Dica: Use <strong>SOLO</strong> para isolar instrumentos ou <strong>MUTE</strong> para tirar da mix
        </span>
      </div>

      <div className="flex items-stretch gap-3 min-w-max pb-4">
        {stems.map((stem) => {
          const isAudible = stem.isAudible(hasAnySolo);
          const isClickOrGuide = stem.type === 'click' || stem.type === 'guide';

          return (
            <div
              key={stem.id}
              className={`w-32 bg-stage-surface border rounded-2xl p-3 flex flex-col justify-between items-center transition-all ${
                stem.isSolo
                  ? 'border-emerald-500/80 shadow-lg shadow-emerald-500/10'
                  : stem.isMuted
                  ? 'border-rose-900/40 opacity-60'
                  : 'border-stage-border hover:border-slate-700'
              }`}
            >
              {/* Header do Canal */}
              <div className="w-full text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {STEM_ICONS[stem.type]}
                  <span className="text-[11px] font-bold text-slate-200 truncate max-w-[80px]">
                    {stem.name}
                  </span>
                </div>

                {/* Badge de Roteamento de Saída */}
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold block truncate ${
                    routingMode === 'SPLIT_IEM_PA' && isClickOrGuide
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}
                  title={
                    routingMode === 'SPLIT_IEM_PA' && isClickOrGuide
                      ? 'Roteado estritamente para o fone dos músicos (Canal L)'
                      : 'Roteado para o P.A. da igreja e monitoração'
                  }
                >
                  {routingMode === 'SPLIT_IEM_PA'
                    ? isClickOrGuide
                      ? 'FONE L'
                      : 'PA R + FONE'
                    : 'STEREO'}
                </span>
              </div>

              {/* Fader Vertical e VU Meter */}
              <div className="flex items-center justify-center gap-2 my-4 h-48">
                {/* Simulação de VU Meter Dinâmico */}
                <div className="w-2.5 h-44 bg-slate-900 rounded-full overflow-hidden flex flex-col-reverse p-0.5 border border-slate-800">
                  <div
                    className="w-full rounded-full transition-all duration-75"
                    style={{
                      height: isPlaying && isAudible ? `${Math.min(100, stem.volume * 85 + (Math.random() * 15))}%` : '0%',
                      backgroundColor: stem.volume > 0.85 ? '#f43f5e' : stem.volume > 0.6 ? '#f59e0b' : '#10b981'
                    }}
                  />
                </div>

                {/* Fader de Volume Vertical */}
                <div className="relative flex flex-col items-center">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={stem.volume}
                    onChange={(e) => onVolumeChange(stem.id, parseFloat(e.target.value))}
                    className="fader-vertical"
                    title={`Volume: ${Math.round(stem.volume * 100)}%`}
                  />
                </div>
              </div>

              {/* Percentual de Volume dB */}
              <div className="font-mono text-xs font-bold text-slate-300 mb-2">
                {Math.round(stem.volume * 100)}%
              </div>

              {/* Pan Slider */}
              <div className="w-full px-1 mb-3">
                <div className="flex justify-between text-[9px] text-stage-muted font-mono mb-0.5">
                  <span>L</span>
                  <span>{stem.pan === 0 ? 'C' : stem.pan > 0 ? `R${Math.round(stem.pan * 100)}` : `L${Math.round(Math.abs(stem.pan) * 100)}`}</span>
                  <span>R</span>
                </div>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={stem.pan}
                  onChange={(e) => onPanChange(stem.id, parseFloat(e.target.value))}
                  className="w-full accent-slate-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  title="Balanço Panorâmico"
                />
              </div>

              {/* Botões Mute e Solo */}
              <div className="grid grid-cols-2 gap-1.5 w-full">
                <button
                  onClick={() => onToggleMute(stem.id)}
                  className={`py-1.5 rounded-lg text-xs font-black transition active:scale-95 ${
                    stem.isMuted
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'bg-stage-card border border-stage-border text-slate-400 hover:text-white'
                  }`}
                  title="Mute Track"
                >
                  {stem.isMuted ? <VolumeX className="w-3.5 h-3.5 mx-auto" /> : 'M'}
                </button>

                <button
                  onClick={() => onToggleSolo(stem.id)}
                  className={`py-1.5 rounded-lg text-xs font-black transition active:scale-95 ${
                    stem.isSolo
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                      : 'bg-stage-card border border-stage-border text-slate-400 hover:text-emerald-400'
                  }`}
                  title="Solo Track"
                >
                  S
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
