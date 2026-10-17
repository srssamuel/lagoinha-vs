import React from 'react';
import { Sparkles, Power, Volume2 } from 'lucide-react';
import { MusicalKey } from '../../infrastructure/audio/PolyphonicAmbientPad';

interface AmbientPadBarProps {
  currentPadKey: MusicalKey | null;
  isPadActive: boolean;
  padVolume: number;
  onSelectKey: (key: MusicalKey) => void;
  onTogglePad: () => void;
  onPadVolumeChange: (vol: number) => void;
}

const KEYS: MusicalKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

export const AmbientPadBar: React.FC<AmbientPadBarProps> = ({
  currentPadKey,
  isPadActive,
  padVolume,
  onSelectKey,
  onTogglePad,
  onPadVolumeChange
}) => {
  return (
    <div className="bg-stage-surface border-t border-stage-border px-6 py-3 flex flex-wrap items-center justify-between gap-4">
      {/* Informações do Pad Contínuo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePad}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition active:scale-95 ${
            isPadActive
              ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30 ring-2 ring-purple-400/50'
              : 'bg-stage-card border border-stage-border text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title="Ativar/Desativar Pad Atmosférico Contínuo"
        >
          <Power className={`w-4 h-4 ${isPadActive ? 'text-white' : 'text-slate-400'}`} />
          <span>{isPadActive ? 'PAD ATIVO' : 'LIGAR PAD'}</span>
        </button>

        <div className="flex items-center gap-2 text-xs">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="font-semibold text-slate-300">
            Fundo de Oração / Transição:
          </span>
          <span className="font-mono font-bold text-purple-300 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded">
            {currentPadKey ? `Tom ${currentPadKey}` : 'Selecione o Tom'}
          </span>
        </div>
      </div>

      {/* Teclado de Seleção Rápida de Tons (12 Notas) */}
      <div className="flex items-center gap-1 overflow-x-auto py-1">
        {KEYS.map((k) => {
          const isSelected = currentPadKey === k;
          return (
            <button
              key={k}
              onClick={() => onSelectKey(k)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition active:scale-95 ${
                isSelected
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/40 ring-1 ring-white/30'
                  : 'bg-stage-card border border-stage-border text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {k}
            </button>
          );
        })}
      </div>

      {/* Controle de Volume do Pad */}
      <div className="flex items-center gap-2 bg-stage-card border border-stage-border px-3 py-1.5 rounded-xl">
        <Volume2 className="w-4 h-4 text-purple-400" />
        <span className="text-[10px] uppercase font-bold text-stage-muted">Vol Pad</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={padVolume}
          onChange={(e) => onPadVolumeChange(parseFloat(e.target.value))}
          className="w-16 accent-purple-500 h-1.5 bg-slate-700 rounded cursor-pointer"
        />
        <span className="text-xs font-mono text-slate-300 w-8 text-right">
          {Math.round(padVolume * 100)}%
        </span>
      </div>
    </div>
  );
};
