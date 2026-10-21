import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { keyStatus, type SongKeyInfo } from '../../../domain/value-objects/SongKey';

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const ALL_KEYS = [...NAMES, ...NAMES.map((k) => `${k}m`)];

interface KeyIdentityProps {
  keyInfo: SongKeyInfo;
  /** Ausente = só mostra a situação do tom. */
  onConfirm?: (key: string) => void;
}

const buttonClass =
  'min-h-[44px] min-w-[44px] px-3 rounded-lg text-xs font-mono font-black border transition bg-amber-500/20 text-amber-200 border-amber-500/50 hover:bg-amber-500/30';

/**
 * Situação do tom da música, sem pontuação interna: não identificado, estimado, ambíguo (candidatos),
 * de registro antigo (não confirmado), do nome do arquivo ou confirmado. Confirmar grava a escolha.
 */
export const KeyIdentity: React.FC<KeyIdentityProps> = ({ keyInfo, onConfirm }) => {
  const status = keyStatus(keyInfo);
  const [picked, setPicked] = useState('C');
  const wrap = 'flex flex-wrap items-center gap-2 bg-[#121824] border rounded-xl px-2.5 py-1.5 text-[11px]';

  if (status === 'confirmed' || status === 'named') {
    return (
      <div className={`${wrap} border-emerald-500/40`} data-key-status={status}>
        <KeyRound className="w-3.5 h-3.5 text-emerald-300" />
        <span className="font-bold text-emerald-300">
          Tom {keyInfo.value} {status === 'confirmed' ? 'confirmado' : '(do nome do arquivo)'}
        </span>
      </div>
    );
  }

  if (status === 'estimated' || status === 'legacy') {
    return (
      <div className={`${wrap} border-amber-500/50`} data-key-status={status}>
        <KeyRound className="w-3.5 h-3.5 text-amber-300" />
        <span className="font-bold text-amber-200">
          {status === 'estimated' ? `Tom estimado: ${keyInfo.value}` : `Tom ${keyInfo.value} de registro antigo`}
        </span>
        <span className="text-slate-300">Não confirmado.</span>
        {onConfirm && keyInfo.value && (
          <button type="button" className={buttonClass} onClick={() => onConfirm(keyInfo.value!)}>
            Confirmar {keyInfo.value}
          </button>
        )}
      </div>
    );
  }

  if (status === 'ambiguous') {
    return (
      <div className={`${wrap} border-amber-500/50`} data-key-status={status}>
        <KeyRound className="w-3.5 h-3.5 text-amber-300" />
        <span className="font-bold text-amber-200">Tom ambíguo. Qual é?</span>
        {onConfirm &&
          keyInfo.candidates.map((k) => (
            <button key={k} type="button" className={buttonClass} onClick={() => onConfirm(k)}>
              {k}
            </button>
          ))}
      </div>
    );
  }

  return (
    <div className={`${wrap} border-slate-600`} data-key-status={status}>
      <KeyRound className="w-3.5 h-3.5 text-slate-400" />
      <span className="font-bold text-slate-200">Tom não identificado</span>
      <span className="text-slate-300">Subir e descer em semitons funciona.</span>
      {onConfirm && (
        <>
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            aria-label="Escolher o tom da música"
            className="bg-slate-950 text-amber-300 text-xs font-mono font-black rounded px-2 min-h-[44px] border border-amber-500/40"
          >
            {ALL_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button type="button" className={buttonClass} onClick={() => onConfirm(picked)}>
            Confirmar tom
          </button>
        </>
      )}
    </div>
  );
};
