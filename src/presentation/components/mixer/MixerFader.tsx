import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatDb } from './meterMath';

interface MixerFaderProps {
  value: number;
  max: number;
  step: number;
  label: string;
  /** Linha guia do ganho nominal (0 dB). */
  unityLineClassName: string;
  onChange: (value: number) => void;
}

/** Fader vertical com linha de 0 dB; duplo clique volta ao ganho nominal. */
export const MixerFader: React.FC<MixerFaderProps> = ({ value, max, step, label, unityLineClassName, onChange }) => (
  <div className="relative w-8 h-32 flex items-center justify-center">
    <div
      className={`absolute left-0 right-0 top-1/2 h-[1px] pointer-events-none ${unityLineClassName}`}
      title="0.0 dB (Ganho Nominal)"
    />
    <input
      type="range"
      min="0"
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onDoubleClick={() => onChange(1.0)}
      className="fader-vertical"
      aria-label={`Volume ${label}`}
      title={`Volume ${label}: ${formatDb(value)} (Duplo clique para 0 dB)`}
    />
  </div>
);

interface FaderTrimButtonsProps {
  value: number;
  max: number;
  /** Incremento dos botões - / +. */
  nudge: number;
  label: string;
  centerClassName: string;
  plusHoverClassName: string;
  onChange: (value: number) => void;
}

/** Ajuste fino (- / 0 dB / +) abaixo do fader. */
export const FaderTrimButtons: React.FC<FaderTrimButtonsProps> = ({
  value,
  max,
  nudge,
  label,
  centerClassName,
  plusHoverClassName,
  onChange
}) => (
  <>
    <button
      type="button"
      onClick={() => onChange(Math.max(0, Number((value - nudge).toFixed(2))))}
      className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 text-[10px] font-bold flex items-center justify-center"
      title={`Reduzir volume de ${label}`}
    >
      <Minus className="w-3 h-3" />
    </button>
    <button
      type="button"
      onClick={() => onChange(1.0)}
      className={`flex-1 py-0.5 rounded font-mono text-[9px] font-bold border transition text-center ${centerClassName}`}
      title="Clique para voltar a 0.0 dB (Ganho Nominal)"
    >
      {formatDb(value)}
    </button>
    <button
      type="button"
      onClick={() => onChange(Math.min(max, Number((value + nudge).toFixed(2))))}
      className={`px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 text-[10px] font-bold flex items-center justify-center ${plusHoverClassName}`}
      title={`Aumentar volume de ${label}`}
    >
      <Plus className="w-3 h-3" />
    </button>
  </>
);
