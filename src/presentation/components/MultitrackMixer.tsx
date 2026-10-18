import React, { useState } from 'react';
import { TrackStem, StemType } from '../../domain/entities/TrackStem';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import {
  Headphones,
  Mic,
  Disc,
  Layers,
  Music,
  Sliders,
  Sparkles,
  VolumeX,
  Guitar,
  RotateCcw,
  Plus,
  Minus
} from 'lucide-react';

interface MultitrackMixerProps {
  stems: TrackStem[];
  routingMode: RoutingMode;
  isPlaying: boolean;
  isSoloClickActive: boolean;
  stemLevels?: Record<string, number>;
  onVolumeChange: (stemId: string, vol: number) => void;
  onPanChange: (stemId: string, pan: number) => void;
  onToggleMute: (stemId: string) => void;
  onToggleSolo: (stemId: string) => void;
  onResetMixer: () => void;
}

type MixerFilterGroup = 'ALL' | 'STRINGS' | 'RHYTHM_KEYS' | 'CUES_VOCALS';

const STEM_ICONS: Record<StemType, React.ReactNode> = {
  click: <Headphones className="w-3.5 h-3.5 text-blue-400" />,
  guide: <Mic className="w-3.5 h-3.5 text-amber-400" />,
  drums: <Disc className="w-3.5 h-3.5 text-rose-400" />,
  bass: <Layers className="w-3.5 h-3.5 text-emerald-400" />,
  violao: <Guitar className="w-3.5 h-3.5 text-amber-300" />,
  guitars: <Guitar className="w-3.5 h-3.5 text-cyan-400" />,
  strings: <Music className="w-3.5 h-3.5 text-teal-300" />,
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
  stemLevels = {},
  onVolumeChange,
  onPanChange,
  onToggleMute,
  onToggleSolo,
  onResetMixer
}) => {
  const [filterGroup, setFilterGroup] = useState<MixerFilterGroup>('ALL');
  const hasAnySolo = stems.some((s) => s.isSolo);

  const formatDb = (volume: number) => {
    if (volume <= 0.001) return '-∞ dB';
    const db = 20 * Math.log10(volume);
    const sign = db > 0.05 ? '+' : '';
    return `${sign}${db.toFixed(1)} dB`;
  };

  const filteredStems = stems.filter((stem) => {
    if (filterGroup === 'ALL') return true;
    if (filterGroup === 'STRINGS') return stem.isStringInstrument();
    if (filterGroup === 'RHYTHM_KEYS') {
      return stem.type === 'drums' || stem.type === 'keys' || stem.type === 'pad';
    }
    return stem.type === 'click' || stem.type === 'guide' || stem.type === 'vocals' || stem.type === 'fx';
  });

  const violaoStem = stems.find((s) => s.type === 'violao');
  const guitarraStem = stems.find((s) => s.type === 'guitars');
  const stringStems = stems.filter((s) => s.isStringInstrument());
  const areStringsSoloed =
    stringStems.length > 0 && stringStems.every((s) => s.isSolo);

  const handleToggleStringsSolo = () => {
    const targetSoloState = !areStringsSoloed;
    stems.forEach((s) => {
      if (s.isStringInstrument()) {
        if (s.isSolo !== targetSoloState) {
          onToggleSolo(s.id);
        }
      } else if (s.isSolo) {
        onToggleSolo(s.id);
      }
    });
  };

  return (
    <div className="flex-1 bg-[#0b0e17] p-4 lg:p-5 overflow-x-auto select-none flex flex-col justify-between">
      {/* Barra Superior do Console: Filtros de Cordas/Instrumentos + Presets Rápidos de Palco */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5 mr-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span>Mixer Neural A100 ({stems.length} Canais)</span>
          </h2>

          {/* Filtros de Grupo */}
          <button
            type="button"
            onClick={() => setFilterGroup('ALL')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
              filterGroup === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Todos ({stems.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterGroup('STRINGS')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
              filterGroup === 'STRINGS'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 border border-amber-500/30 text-amber-300 hover:bg-amber-500/10'
            }`}
          >
            <Guitar className="w-3 h-3" />
            <span>Cordas: Violão, Guitarra & Baixo ({stringStems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterGroup('RHYTHM_KEYS')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
              filterGroup === 'RHYTHM_KEYS'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Bateria & Teclas
          </button>
          <button
            type="button"
            onClick={() => setFilterGroup('CUES_VOCALS')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
              filterGroup === 'CUES_VOCALS'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Click, Guia & Voz
          </button>
        </div>

        {/* Atalhos Rápidos de Palco para Apartar Violão / Guitarra / Cordas */}
        <div className="flex flex-wrap items-center gap-1.5">
          {violaoStem && (
            <button
              type="button"
              onClick={() => onToggleMute(violaoStem.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                violaoStem.isMuted
                  ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-amber-400'
              }`}
              title="Muta ou ativa o Violão Acústico caso tenha violonista ao vivo no palco"
            >
              {violaoStem.isMuted ? 'Violão Mutado (Ativar)' : 'Mutar Violão'}
            </button>
          )}

          {guitarraStem && (
            <button
              type="button"
              onClick={() => onToggleMute(guitarraStem.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                guitarraStem.isMuted
                  ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-400'
              }`}
              title="Muta ou ativa a Guitarra Elétrica caso tenha guitarrista ao vivo no palco"
            >
              {guitarraStem.isMuted ? 'Guitarra Mutada (Ativar)' : 'Mutar Guitarra'}
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleStringsSolo}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
              areStringsSoloed
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                : 'bg-slate-900 border-slate-700 text-emerald-300 hover:border-emerald-500'
            }`}
            title="Isola apenas os instrumentos de corda (Violão, Guitarra e Baixo)"
          >
            {areStringsSoloed ? 'Cordas em Solo (Sair)' : 'Isolar Cordas'}
          </button>

          <button
            type="button"
            onClick={onResetMixer}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 transition"
            title="Restaurar todos os volumes para 0.0 dB e limpar Mutes/Solos"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Resetar Mix</span>
          </button>

          {isSoloClickActive && (
            <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full animate-pulse">
              MODO RESGATE: Apenas Click no Fone
            </span>
          )}
        </div>
      </div>

      {/* Canais do Mixer */}
      <div className="flex items-stretch gap-2.5 min-w-max pb-1">
        {filteredStems.map((stem) => {
          let isAudible = stem.isAudible(hasAnySolo);
          if (isSoloClickActive && stem.type !== 'click' && stem.type !== 'guide') {
            isAudible = false;
          }

          const isClickOrGuide = stem.type === 'click' || stem.type === 'guide';
          const isString = stem.isStringInstrument();
          const liveLevel = stemLevels[stem.id] ?? (isPlaying && isAudible ? Math.min(1, stem.volume * 0.65) : 0);
          const leftMeterPct = isPlaying && isAudible ? Math.min(100, Math.round(liveLevel * (stem.pan <= 0 ? 100 : 75))) : 0;
          const rightMeterPct = isPlaying && isAudible ? Math.min(100, Math.round(liveLevel * (stem.pan >= 0 ? 100 : 75))) : 0;
          const isBoosted = stem.volume > 1.02;

          return (
            <div
              key={stem.id}
              className={`w-32 bg-[#121824] border rounded-2xl p-2.5 flex flex-col justify-between items-center transition-all ${
                stem.isSolo
                  ? 'border-emerald-500/90 shadow-lg shadow-emerald-500/10'
                  : stem.isMuted || !isAudible
                  ? 'border-slate-800/80 opacity-60'
                  : isString
                  ? 'border-amber-500/35 hover:border-amber-400/70'
                  : 'border-stage-border hover:border-slate-700'
              }`}
            >
              {/* Header do Canal com Nome e Ícone */}
              <div className="w-full text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  {STEM_ICONS[stem.type]}
                  <span
                    className="text-[11px] font-bold text-slate-100 truncate max-w-[92px]"
                    title={stem.name}
                  >
                    {stem.name}
                  </span>
                </div>

                {/* Badge de Roteamento + Família */}
                <div className="flex items-center justify-center gap-1">
                  <span
                    className={`text-[8px] font-mono px-1.5 py-0.2 rounded uppercase font-semibold ${
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
                  {isString && (
                    <span className="text-[8px] font-mono px-1 py-0.2 rounded uppercase font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      CORDA
                    </span>
                  )}
                </div>
              </div>

              {/* Rotary Knob de Pan */}
              <div className="my-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextPan = stem.pan === 0 ? 0.45 : stem.pan > 0 ? -0.45 : 0;
                    onPanChange(stem.id, nextPan);
                  }}
                  className="w-7 h-7 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center relative cursor-pointer active:scale-90 transition-transform"
                  title={`Pan: ${stem.pan === 0 ? 'Centro' : stem.pan > 0 ? `R${Math.round(stem.pan * 100)}` : `L${Math.round(Math.abs(stem.pan) * 100)}`} (Clique para alternar)`}
                >
                  <div
                    className="w-0.5 h-2.5 bg-sky-400 rounded-full origin-bottom absolute top-1 transition-transform"
                    style={{ transform: `rotate(${stem.pan * 135}deg)` }}
                  />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                </button>
                <span className="text-[9px] font-mono text-slate-400">
                  Pan {stem.pan === 0 ? 'C' : stem.pan > 0 ? `R${Math.round(stem.pan * 100)}` : `L${Math.round(Math.abs(stem.pan) * 100)}`}
                </span>
              </div>

              {/* Botões Solo (S) e Mute (M) */}
              <div className="grid grid-cols-2 gap-1 w-full mb-2">
                <button
                  type="button"
                  onClick={() => onToggleSolo(stem.id)}
                  className={`py-1 rounded-lg text-[10px] font-black transition active:scale-95 ${
                    stem.isSolo
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                      : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-emerald-400'
                  }`}
                  title={`Solo ${stem.name}`}
                >
                  SOLO
                </button>

                <button
                  type="button"
                  onClick={() => onToggleMute(stem.id)}
                  className={`py-1 rounded-lg text-[10px] font-black transition active:scale-95 ${
                    stem.isMuted
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
                  }`}
                  title={`Mutar ${stem.name}`}
                >
                  {stem.isMuted ? <VolumeX className="w-3 h-3 mx-auto" /> : 'MUTE'}
                </button>
              </div>

              {/* Fader Vertical (0.0 a 2.0 = -∞ dB até +6.0 dB) + VU Meter Real */}
              <div className="flex items-center justify-center gap-2 my-1 h-40 w-full relative">
                {/* Escala dB Lateral */}
                <div className="flex flex-col justify-between h-36 text-[8px] font-mono text-slate-300 select-none text-right pr-0.5">
                  <span className="text-amber-300 font-bold">+6</span>
                  <span className="text-emerald-300 font-bold">0dB</span>
                  <span>-6</span>
                  <span>-∞</span>
                </div>

                {/* VU Meter Estéreo Real (AnalyserNode RMS) */}
                <div className="flex gap-0.5 h-36 bg-slate-950 rounded p-0.5 border border-slate-800">
                  <div className="w-1.5 h-full bg-slate-900 rounded-sm overflow-hidden flex flex-col-reverse">
                    <div
                      className="w-full transition-all duration-75 rounded-sm"
                      style={{
                        height: `${leftMeterPct}%`,
                        backgroundColor: isBoosted ? '#f59e0b' : '#38bdf8'
                      }}
                    />
                  </div>
                  <div className="w-1.5 h-full bg-slate-900 rounded-sm overflow-hidden flex flex-col-reverse">
                    <div
                      className="w-full transition-all duration-75 rounded-sm"
                      style={{
                        height: `${rightMeterPct}%`,
                        backgroundColor: isBoosted ? '#fbbf24' : '#34d399'
                      }}
                    />
                  </div>
                </div>

                {/* Fader Vertical Rotacionado (-90deg: base = 0.0, meio = 1.0 (0dB), topo = 2.0 (+6dB)) */}
                <div className="relative w-8 h-36 flex items-center justify-center">
                  {/* Linha guia de 0 dB (Unity Gain = 50% da altura) */}
                  <div
                    className="absolute left-0 right-0 top-1/2 h-[1px] bg-emerald-500/50 pointer-events-none"
                    title="0.0 dB (Ganho Nominal)"
                  />
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.02"
                    value={stem.volume}
                    onChange={(e) => onVolumeChange(stem.id, parseFloat(e.target.value))}
                    onDoubleClick={() => onVolumeChange(stem.id, 1.0)}
                    className="fader-vertical"
                    aria-label={`Volume ${stem.name}`}
                    title={`Volume ${stem.name}: ${formatDb(stem.volume)} (Duplo clique para 0 dB)`}
                  />
                </div>
              </div>

              {/* Botões de Ajuste Fino (- / 0dB / +) para Aumentar ou Reduzir com Precisão */}
              <div className="flex items-center justify-between gap-1 w-full mt-1">
                <button
                  type="button"
                  onClick={() => onVolumeChange(stem.id, Math.max(0, Number((stem.volume - 0.15).toFixed(2))))}
                  className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 text-[10px] font-bold flex items-center justify-center"
                  title={`Reduzir volume de ${stem.name}`}
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onVolumeChange(stem.id, 1.0)}
                  className={`flex-1 py-0.5 rounded font-mono text-[10px] font-bold border transition ${
                    isBoosted
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-slate-900/90 border-slate-800 text-slate-200 hover:border-emerald-500/40'
                  }`}
                  title="Clique para voltar a 0.0 dB (Ganho Nominal)"
                >
                  {formatDb(stem.volume)}
                </button>
                <button
                  type="button"
                  onClick={() => onVolumeChange(stem.id, Math.min(2, Number((stem.volume + 0.15).toFixed(2))))}
                  className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-200 text-[10px] font-bold flex items-center justify-center"
                  title={`Aumentar volume (+Boost até +6dB) de ${stem.name}`}
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
