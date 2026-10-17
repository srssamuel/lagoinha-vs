import React from 'react';
import { TrackStem, StemType } from '../../domain/entities/TrackStem';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import { Headphones, Mic, Disc, Layers, Music, Sliders, Sparkles, VolumeX } from 'lucide-react';

interface MultitrackMixerProps {
  stems: TrackStem[];
  routingMode: RoutingMode;
  isPlaying: boolean;
  isSoloClickActive: boolean;
  onVolumeChange: (stemId: string, vol: number) => void;
  onPanChange: (stemId: string, pan: number) => void;
  onToggleMute: (stemId: string) => void;
  onToggleSolo: (stemId: string) => void;
}

const STEM_ICONS: Record<StemType, React.ReactNode> = {
  click: <Headphones className="w-3.5 h-3.5 text-blue-400" />,
  guide: <Mic className="w-3.5 h-3.5 text-amber-400" />,
  drums: <Disc className="w-3.5 h-3.5 text-rose-400" />,
  bass: <Layers className="w-3.5 h-3.5 text-emerald-400" />,
  guitars: <Music className="w-3.5 h-3.5 text-cyan-400" />,
  keys: <Sliders className="w-3.5 h-3.5 text-purple-400" />,
  pad: <Sparkles className="w-3.5 h-3.5 text-indigo-400" />,
  vocals: <Mic className="w-3.5 h-3.5 text-pink-400" />,
  fx: <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
};

export const MultitrackMixer: React.FC<MultitrackMixerProps> = ({
  stems,
  routingMode,
  isPlaying,
  isSoloClickActive,
  onVolumeChange,
  onPanChange,
  onToggleMute,
  onToggleSolo
}) => {
  const hasAnySolo = stems.some((s) => s.isSolo);

  const formatDb = (volume: number) => {
    if (volume <= 0.001) return '-inf dB';
    const db = 20 * Math.log10(volume);
    return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
  };

  return (
    <div className="flex-1 bg-[#0b0e17] p-5 overflow-x-auto select-none">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-purple-400" />
          Console de Mixagem ({stems.length} Stems)
        </h2>
        {isSoloClickActive && (
          <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full animate-pulse">
            MODO RESGATE ATIVO: Apenas Click & Guia no Fone
          </span>
        )}
      </div>

      <div className="flex items-stretch gap-2.5 min-w-max pb-2">
        {stems.map((stem) => {
          let isAudible = stem.isAudible(hasAnySolo);
          if (isSoloClickActive && stem.type !== 'click' && stem.type !== 'guide') {
            isAudible = false;
          }

          const isClickOrGuide = stem.type === 'click' || stem.type === 'guide';

          return (
            <div
              key={stem.id}
              className={`w-28 bg-[#121824] border rounded-2xl p-2.5 flex flex-col justify-between items-center transition-all ${
                stem.isSolo
                  ? 'border-emerald-500/80 shadow-lg shadow-emerald-500/10'
                  : stem.isMuted || !isAudible
                  ? 'border-slate-800/80 opacity-55'
                  : 'border-stage-border hover:border-slate-700'
              }`}
            >
              {/* Header do Canal com Nome e Ícone */}
              <div className="w-full text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {STEM_ICONS[stem.type]}
                  <span className="text-[11px] font-bold text-slate-200 truncate max-w-[70px]">
                    {stem.name}
                  </span>
                </div>

                {/* Badge de Roteamento de Saída */}
                <span
                  className={`text-[8px] font-mono px-1 py-0.2 rounded uppercase font-semibold block truncate ${
                    routingMode === 'SPLIT_IEM_PA' && isClickOrGuide
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}
                >
                  {routingMode === 'SPLIT_IEM_PA'
                    ? isClickOrGuide
                      ? 'FONE L'
                      : 'PA R'
                    : 'STEREO'}
                </span>
              </div>

              {/* Rotary Knob Visual de Pan (Estilo Fader Club na gravação) */}
              <div className="my-2 flex flex-col items-center">
                <div
                  onClick={() => {
                    const nextPan = stem.pan === 0 ? 0.5 : stem.pan > 0 ? -0.5 : 0;
                    onPanChange(stem.id, nextPan);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center relative cursor-pointer group active:scale-90 transition-transform"
                  title={`Pan: ${stem.pan === 0 ? 'Centro (Clique para alternar R/L/C)' : stem.pan > 0 ? `R${Math.round(stem.pan * 100)}` : `L${Math.round(Math.abs(stem.pan) * 100)}`}`}
                >
                  {/* Ponteiro do Knob */}
                  <div
                    className="w-0.5 h-3 bg-purple-400 rounded-full origin-bottom absolute top-1 transition-transform"
                    style={{ transform: `rotate(${stem.pan * 135}deg)` }}
                  />
                  <div className="w-2 h-2 rounded-full bg-slate-700" />
                </div>
                <span className="text-[8px] font-mono text-slate-400 mt-0.5">
                  {stem.pan === 0 ? 'C' : stem.pan > 0 ? `R${Math.round(stem.pan * 100)}` : `L${Math.round(Math.abs(stem.pan) * 100)}`}
                </span>
              </div>

              {/* Botões Mute e Solo estilo Hardware Console */}
              <div className="grid grid-cols-2 gap-1 w-full mb-3">
                <button
                  onClick={() => onToggleSolo(stem.id)}
                  className={`py-1 rounded-md text-[10px] font-black transition active:scale-95 ${
                    stem.isSolo
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                      : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-emerald-400'
                  }`}
                  title="Solo"
                >
                  S
                </button>

                <button
                  onClick={() => onToggleMute(stem.id)}
                  className={`py-1 rounded-md text-[10px] font-black transition active:scale-95 ${
                    stem.isMuted
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
                  }`}
                  title="Mute"
                >
                  {stem.isMuted ? <VolumeX className="w-3 h-3 mx-auto" /> : 'M'}
                </button>
              </div>

              {/* Fader Vertical e VU Meter Estéreo Duplo (Roxo/Ciano) */}
              <div className="flex items-center justify-center gap-1.5 my-1 h-44">
                {/* VU Meter Estéreo (Canal L e Canal R) com animação suave */}
                <div className="flex gap-0.5 h-40 bg-slate-950 rounded-sm p-0.5 border border-slate-800">
                  {/* L Bar */}
                  <div className="w-1.5 h-full bg-slate-900 rounded-sm overflow-hidden flex flex-col-reverse">
                    <div
                      className="w-full transition-all duration-75 rounded-sm"
                      style={{
                        height: isPlaying && isAudible ? `${Math.min(100, stem.volume * 80 + Math.random() * 20)}%` : '0%',
                        backgroundColor: '#a855f7', // Roxo Fader Club
                        boxShadow: '0 0 4px rgba(168, 85, 247, 0.6)'
                      }}
                    />
                  </div>
                  {/* R Bar */}
                  <div className="w-1.5 h-full bg-slate-900 rounded-sm overflow-hidden flex flex-col-reverse">
                    <div
                      className="w-full transition-all duration-75 rounded-sm"
                      style={{
                        height: isPlaying && isAudible ? `${Math.min(100, stem.volume * 80 + Math.random() * 20)}%` : '0%',
                        backgroundColor: '#c084fc',
                        boxShadow: '0 0 4px rgba(192, 132, 252, 0.6)'
                      }}
                    />
                  </div>
                </div>

                {/* Fader Físico de Volume */}
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

              {/* Valor dB Numérico abaixo do Fader */}
              <div className="font-mono text-[10px] font-bold text-slate-300 mt-2">
                {formatDb(stem.volume)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
