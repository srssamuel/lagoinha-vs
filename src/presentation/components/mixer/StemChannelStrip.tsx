import React, { useRef } from 'react';
import { Lock, VolumeX } from 'lucide-react';
import { TrackStem } from '../../../domain/entities/TrackStem';
import { RoutingMode } from '../../../domain/value-objects/AudioRouting';
import { MeterSource } from '../../../application/ports/AudioEnginePort';
import { useMeterListener } from '../../hooks/useMeterListener';
import { STEM_ICONS } from './stemIcons';
import { MixerFader, FaderTrimButtons } from './MixerFader';
import { formatPan, formatSemitones, stemMeterPercents } from './meterMath';

interface StemChannelStripProps {
  stem: TrackStem;
  routingMode: RoutingMode;
  pitchShiftSemitones: number;
  isPlaying: boolean;
  /** Já considera solos e o Modo Resgate (Solo Click). */
  isAudible: boolean;
  meterSource?: MeterSource;
  onVolumeChange: (stemId: string, vol: number) => void;
  onPanChange: (stemId: string, pan: number) => void;
  onToggleMute: (stemId: string) => void;
  onToggleSolo: (stemId: string) => void;
  onTogglePitchLock?: (stemId: string) => void;
  onOpenVstRack?: (stemId?: string) => void;
}

const pitchPolicyTitle = (stem: TrackStem, semitones: number): string => {
  if (stem.pitchPolicy === 'locked') {
    return `PROTEÇÃO LITÚRGICA (${stem.name}): Metrônomo e Guia de palco são imutáveis.`;
  }
  if (stem.pitchPolicy === 'percussive') {
    return `CONTEÚDO PERCUSSIVO/RÍTMICO (${stem.name}): Tom travado para preservar transientes e afinação de tambores. Clique para mudar para Harmônico.`;
  }
  const shift = semitones === 0 ? 'Tom Original' : formatSemitones(semitones, true);
  return `CONTEÚDO HARMÔNICO/MELÓDICO (${stem.name}): Acompanha a transposição de tom (${shift}). Clique para travar em Percussivo.`;
};

/** Canal do console: badges de rota/pitch/FX, pan, Solo/Mute, VU estéreo (rAF) e fader. */
export const StemChannelStrip: React.FC<StemChannelStripProps> = ({
  stem,
  routingMode,
  pitchShiftSemitones,
  isPlaying,
  isAudible,
  meterSource,
  onVolumeChange,
  onPanChange,
  onToggleMute,
  onToggleSolo,
  onTogglePitchLock,
  onOpenVstRack
}) => {
  const leftBarRef = useRef<HTMLDivElement>(null);
  const rightBarRef = useRef<HTMLDivElement>(null);

  const isClickOrGuide = stem.type === 'click' || stem.type === 'guide';
  const isString = stem.isStringInstrument();
  const isBoosted = stem.volume > 1.02;
  const isMeterActive = isPlaying && isAudible;
  const hasDspActive =
    stem.dsp.highPassHz > 25 ||
    stem.dsp.eqLowDb !== 0 ||
    stem.dsp.eqMidDb !== 0 ||
    stem.dsp.eqHighDb !== 0 ||
    stem.dsp.driveAmount > 0 ||
    stem.dsp.compressorEnabled;

  // VU fora do ciclo de render: escreve scaleY direto nas barras a cada quadro.
  useMeterListener(meterSource, (frame) => {
    const { left, right } = stemMeterPercents(frame.stemLevels[stem.id], stem.volume, stem.pan, isMeterActive);
    if (leftBarRef.current) leftBarRef.current.style.transform = `scaleY(${left / 100})`;
    if (rightBarRef.current) rightBarRef.current.style.transform = `scaleY(${right / 100})`;
  });

  return (
    <div
      className={`w-[122px] bg-[#121824] border rounded-2xl p-2 flex flex-col justify-between items-center transition-all ${
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
          <span className="text-[11px] font-bold text-slate-100 truncate max-w-[90px]" title={stem.name}>
            {stem.name}
          </span>
        </div>

        {/* Badge de Roteamento + Pitch Lock/Shift + Botão FX */}
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span
            className={`text-[8px] font-mono px-1 py-0.2 rounded uppercase font-semibold ${
              routingMode === 'SPLIT_IEM_PA' && isClickOrGuide
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }`}
          >
            {routingMode === 'SPLIT_IEM_PA' ? (isClickOrGuide ? 'FONE L' : 'PA R') : 'ST'}
          </span>

          {/* Indicador Explícito de Política de Afinação (PitchPolicy) por Canal */}
          <button
            type="button"
            onClick={() => onTogglePitchLock?.(stem.id)}
            className={`text-[8px] font-mono px-1 py-0.5 rounded uppercase font-bold border transition flex items-center gap-0.5 ${
              stem.pitchPolicy === 'locked'
                ? 'bg-slate-800 text-slate-400 border-slate-700 cursor-not-allowed'
                : stem.pitchPolicy === 'percussive'
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/35 hover:bg-rose-500/25'
                : pitchShiftSemitones !== 0
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                : 'bg-slate-900 text-cyan-300 border-cyan-500/30 hover:border-cyan-400'
            }`}
            title={pitchPolicyTitle(stem, pitchShiftSemitones)}
          >
            {stem.pitchPolicy === 'locked' ? (
              <>
                <Lock className="w-2 h-2 text-slate-400" />
                <span>FIXO</span>
              </>
            ) : stem.pitchPolicy === 'percussive' ? (
              <>
                <Lock className="w-2 h-2 text-rose-400" />
                <span>RITMO</span>
              </>
            ) : (
              <span>{pitchShiftSemitones === 0 ? 'TOM' : formatSemitones(pitchShiftSemitones)}</span>
            )}
          </button>

          {onOpenVstRack && (
            <button
              type="button"
              onClick={() => onOpenVstRack(stem.id)}
              className={`text-[8px] font-mono px-1 py-0.2 rounded uppercase font-bold border transition ${
                hasDspActive
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-amber-400'
              }`}
              title={`Abrir Channel Strip VST de ${stem.name} (${stem.dsp.presetName})`}
            >
              FX
            </button>
          )}
        </div>
      </div>

      {/* Rotary Knob de Pan */}
      <div className="my-1 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            const nextPan = stem.pan === 0 ? 0.45 : stem.pan > 0 ? -0.45 : 0;
            onPanChange(stem.id, nextPan);
          }}
          className="w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center relative cursor-pointer active:scale-90 transition-transform"
          title={`Pan: ${formatPan(stem.pan, 'Centro')} (Clique para alternar)`}
        >
          <div
            className="w-0.5 h-2 bg-sky-400 rounded-full origin-bottom absolute top-1 transition-transform"
            style={{ transform: `rotate(${stem.pan * 135}deg)` }}
          />
          <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
        </button>
        <span className="text-[9px] font-mono text-slate-400">Pan {formatPan(stem.pan)}</span>
      </div>

      {/* Botões Solo (S) e Mute (M) */}
      <div className="grid grid-cols-2 gap-1 w-full mb-1.5">
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
      <div className="flex items-center justify-center gap-1.5 my-0.5 h-36 w-full relative">
        {/* Escala dB Lateral */}
        <div className="flex flex-col justify-between h-32 text-[8px] font-mono text-slate-300 select-none text-right pr-0.5">
          <span className="text-amber-300 font-bold">+6</span>
          <span className="text-emerald-300 font-bold">0dB</span>
          <span>-6</span>
          <span>-∞</span>
        </div>

        {/* VU Meter Estéreo Real (AnalyserNode RMS), desenhado por requestAnimationFrame */}
        <div className="flex gap-0.5 h-32 bg-slate-950 rounded p-0.5 border border-slate-800">
          <div className="w-1.5 h-full bg-slate-900 rounded-sm overflow-hidden">
            <div
              ref={leftBarRef}
              className="w-full h-full rounded-sm origin-bottom will-change-transform"
              style={{ transform: 'scaleY(0)', backgroundColor: isBoosted ? '#f59e0b' : '#38bdf8' }}
            />
          </div>
          <div className="w-1.5 h-full bg-slate-900 rounded-sm overflow-hidden">
            <div
              ref={rightBarRef}
              className="w-full h-full rounded-sm origin-bottom will-change-transform"
              style={{ transform: 'scaleY(0)', backgroundColor: isBoosted ? '#fbbf24' : '#34d399' }}
            />
          </div>
        </div>

        {/* Fader Vertical Rotacionado (base = 0.0, meio = 1.0 (0dB), topo = 2.0 (+6dB)) */}
        <MixerFader
          value={stem.volume}
          max={2}
          step={0.02}
          label={stem.name}
          unityLineClassName="bg-emerald-500/50"
          onChange={(vol) => onVolumeChange(stem.id, vol)}
        />
      </div>

      {/* Botões de Ajuste Fino (- / 0dB / +) para Aumentar ou Reduzir com Precisão */}
      <div className="flex items-center justify-between gap-1 w-full mt-1">
        <FaderTrimButtons
          value={stem.volume}
          max={2}
          nudge={0.15}
          label={stem.name}
          centerClassName={
            isBoosted
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-slate-900/90 border-slate-800 text-slate-200 hover:border-emerald-500/40'
          }
          plusHoverClassName="hover:border-amber-400"
          onChange={(vol) => onVolumeChange(stem.id, vol)}
        />
      </div>
    </div>
  );
};
