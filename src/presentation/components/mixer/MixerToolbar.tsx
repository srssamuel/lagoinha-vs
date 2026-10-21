import React from 'react';
import { Sliders, Sparkles, VolumeX, Guitar, RotateCcw, Cpu, Lock, Music2 } from 'lucide-react';
import { TrackStem, StemType } from '../../../domain/entities/TrackStem';
import { ChordTransposer } from '../../../domain/services/ChordTransposer';
import { EnsaioMixMode } from '../../../domain/services/EnsaioMixService';
import { formatSemitones } from './meterMath';

export type MixerFilterGroup = 'ALL' | 'STRINGS' | 'RHYTHM_KEYS' | 'CUES_VOCALS';

const ALL_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const matchesFilterGroup = (stem: TrackStem, group: MixerFilterGroup): boolean => {
  if (group === 'ALL') return true;
  if (group === 'STRINGS') return stem.isStringInstrument();
  if (group === 'RHYTHM_KEYS') {
    return stem.type === 'drums' || stem.type === 'loop' || stem.type === 'keys' || stem.type === 'pad';
  }
  return stem.type === 'click' || stem.type === 'guide' || stem.type === 'vocals' || stem.type === 'fx';
};

interface MixerToolbarProps {
  stems: TrackStem[];
  filterGroup: MixerFilterGroup;
  onFilterGroupChange: (group: MixerFilterGroup) => void;
  originalKey: string;
  currentKey: string;
  pitchShiftSemitones: number;
  isSoloClickActive: boolean;
  ensaioTarget: StemType;
  ensaioMode: EnsaioMixMode;
  onTriggerEnsaioMix?: (target: StemType, mode: EnsaioMixMode) => void;
  onToggleMute: (stemId: string) => void;
  onToggleSolo: (stemId: string) => void;
  onClearAllSolos?: () => void;
  onResetMixer: () => void;
  onPitchShiftChange?: (semitones: number) => void;
  onOpenVstRack?: (stemId?: string) => void;
  onAutoFixAllStems?: () => void;
}

const filterButtonClass = (active: boolean) =>
  `px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
    active ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white'
  }`;

const muteToggleClass = (muted: boolean, hoverBorder: string) =>
  `px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
    muted ? 'bg-rose-600/20 border-rose-500 text-rose-300' : `bg-slate-900 border-slate-700 text-slate-300 ${hoverBorder}`
  }`;

/** Barra superior do console: filtros, Mudar Tom (Pitch Lock), EnsaioMix®, mutes rápidos, Auto-Fix, Rack VST e Reset. */
export const MixerToolbar: React.FC<MixerToolbarProps> = ({
  stems,
  filterGroup,
  onFilterGroupChange,
  originalKey,
  currentKey,
  pitchShiftSemitones,
  isSoloClickActive,
  ensaioTarget,
  ensaioMode,
  onTriggerEnsaioMix,
  onToggleMute,
  onToggleSolo,
  onClearAllSolos,
  onResetMixer,
  onPitchShiftChange,
  onOpenVstRack,
  onAutoFixAllStems
}) => {
  const violaoStem = stems.find((s) => s.type === 'violao');
  const guitarraStem = stems.find((s) => s.type === 'guitars');
  const stringStems = stems.filter((s) => s.isStringInstrument());
  const soloCount = stems.filter((s) => s.isSolo).length;
  const lockedStemsCount = stems.filter((s) => !s.isPitchShiftable).length;
  const pitchableStemsCount = stems.length - lockedStemsCount;
  const areStringsSoloed = stringStems.length > 0 && stringStems.every((s) => s.isSolo);

  const handleToggleStringsSolo = () => {
    const targetSoloState = !areStringsSoloed;
    stems.forEach((s) => {
      if (s.isStringInstrument()) {
        if (s.isSolo !== targetSoloState) onToggleSolo(s.id);
      } else if (s.isSolo) {
        onToggleSolo(s.id);
      }
    });
  };

  const handleSelectTargetKey = (targetKey: string) => {
    if (!onPitchShiftChange) return;
    // Distância em semitons entre o tom original e o tom alvo, no intervalo [-6, +6]
    for (let st = -6; st <= 6; st++) {
      if (ChordTransposer.transposeChordLine(originalKey, st).trim() === targetKey) {
        onPitchShiftChange(st);
        return;
      }
    }
  };

  return (
    <div className="flex flex-col gap-2 mb-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5 mr-1">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span>Console Multitrack ({stems.length} Canais)</span>
          </h2>

          {/* Filtros de Grupo */}
          <button type="button" onClick={() => onFilterGroupChange('ALL')} className={filterButtonClass(filterGroup === 'ALL')}>
            Todos ({stems.length})
          </button>
          <button
            type="button"
            onClick={() => onFilterGroupChange('STRINGS')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
              filterGroup === 'STRINGS'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 border border-amber-500/30 text-amber-300 hover:bg-amber-500/10'
            }`}
          >
            <Guitar className="w-3 h-3" />
            <span>Cordas ({stringStems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => onFilterGroupChange('RHYTHM_KEYS')}
            className={filterButtonClass(filterGroup === 'RHYTHM_KEYS')}
          >
            Bateria, Loops & Teclas
          </button>
          <button
            type="button"
            onClick={() => onFilterGroupChange('CUES_VOCALS')}
            className={filterButtonClass(filterGroup === 'CUES_VOCALS')}
          >
            Click, Guia & Voz
          </button>
        </div>

        {/* Controle Visível de Mudança de Tom + Proteção Rítmica (Pitchproof Constant-Tempo DSP) */}
        {onPitchShiftChange && (
          <div className="flex flex-wrap items-center gap-2 bg-[#121824] border border-amber-500/35 rounded-xl px-2.5 py-1">
            <div className="flex items-center gap-1.5">
              <Music2 className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-mono font-bold uppercase text-amber-300">Mudar Tom (Pitch):</span>
              <button
                type="button"
                onClick={() => onPitchShiftChange(pitchShiftSemitones - 1)}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black transition"
                title="Baixar 1 semitom (-1) apenas nos instrumentos harmônicos"
              >
                -1
              </button>
              <select
                value={currentKey}
                onChange={(e) => handleSelectTargetKey(e.target.value)}
                aria-label="Selecionar Tom da Música"
                className="bg-slate-950 text-amber-300 text-xs font-mono font-black rounded px-2 py-1.5 min-h-[44px] sm:min-h-0 border border-amber-500/40 cursor-pointer"
              >
                {ALL_KEYS.map((k) => (
                  <option key={k} value={k}>
                    Tom {k} {k === originalKey ? '(Orig)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onPitchShiftChange(pitchShiftSemitones + 1)}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black transition"
                title="Subir 1 semitom (+1) apenas nos instrumentos harmônicos"
              >
                +1
              </button>
              {pitchShiftSemitones !== 0 && (
                <button
                  type="button"
                  onClick={() => onPitchShiftChange(0)}
                  className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-mono font-bold"
                  title="Restaurar Tom Original"
                >
                  {formatSemitones(pitchShiftSemitones, true)} (Reset)
                </button>
              )}
            </div>

            <span
              className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"
              title="Pitchproof DSP: Bateria, Loops, Click e Guia ficam travados em Pitch Lock para nunca deformar timbres percussivos nem sair do BPM"
            >
              <Lock className="w-2.5 h-2.5 text-emerald-400" />
              <span>
                PITCH LOCK ({lockedStemsCount} fixos: Bateria/Loop/Click/Guia • {pitchableStemsCount} tonais)
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Segunda Linha da Barra: EnsaioMix® + Isolamento de Cordas + Auto-Fix DSP + Rack VST */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {onTriggerEnsaioMix && (
            <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 rounded-lg px-2 py-0.5">
              <span className="text-[10px] font-mono font-bold text-amber-300 uppercase">EnsaioMix®:</span>
              <select
                value={ensaioTarget}
                onChange={(e) => onTriggerEnsaioMix(e.target.value as StemType, ensaioMode)}
                aria-label="Selecionar instrumento do EnsaioMix"
                className="bg-slate-950 text-slate-200 text-[11px] font-bold rounded px-2 py-1.5 min-h-[44px] sm:min-h-0 border border-slate-800"
              >
                <option value="guitars">Guitarras (EG 1/2/3)</option>
                <option value="violao">Violão Acústico</option>
                <option value="bass">Baixo (Bass)</option>
                <option value="keys">Teclados (EP / Órgão / Lead)</option>
                <option value="pad">Synth Pad</option>
                <option value="drums">Bateria (Drums)</option>
                <option value="loop">Percussão / Loops</option>
                <option value="vocals">Backing Vocals</option>
              </select>
              <button
                type="button"
                onClick={() => onTriggerEnsaioMix(ensaioTarget, 'AUMENTADA')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                  ensaioMode === 'AUMENTADA'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Mix Aumentada (MultiTracks EnsaioMix): coloca este instrumento em destaque (+4.3dB) acima da banda para estudo"
              >
                Mix Aumentada (+)
              </button>
              <button
                type="button"
                onClick={() => onTriggerEnsaioMix(ensaioTarget, 'DIMINUTA')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                  ensaioMode === 'DIMINUTA' ? 'bg-rose-600 text-white font-black' : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Mix Diminuta / Minus One (MultiTracks EnsaioMix): remove apenas este instrumento para você tocar por cima"
              >
                Mix Diminuta (-)
              </button>
            </div>
          )}

          {violaoStem && (
            <button
              type="button"
              onClick={() => onToggleMute(violaoStem.id)}
              className={muteToggleClass(violaoStem.isMuted, 'hover:border-amber-400')}
              title="Muta ou ativa o Violão Acústico caso tenha violonista ao vivo no palco"
            >
              {violaoStem.isMuted ? 'Violão Mutado (Ativar)' : 'Mutar Violão'}
            </button>
          )}

          {guitarraStem && (
            <button
              type="button"
              onClick={() => onToggleMute(guitarraStem.id)}
              className={muteToggleClass(guitarraStem.isMuted, 'hover:border-cyan-400')}
              title="Muta ou ativa a Guitarra Elétrica"
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
            title="Isola apenas os instrumentos de corda (Violão, Guitarras e Baixo)"
          >
            {areStringsSoloed ? 'Cordas em Solo (Sair)' : 'Isolar Cordas'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onAutoFixAllStems && (
            <button
              type="button"
              onClick={onAutoFixAllStems}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-1 transition"
              title="Corrige automaticamente vazamento de graves (De-Bleed), devolve brilho agudo (TDR Nova) e ativa compressão OTT nos stems"
            >
              <Sparkles className="w-3 h-3 text-emerald-300" />
              <span>Auto-Fix Stems (DSP)</span>
            </button>
          )}

          {onOpenVstRack && (
            <button
              type="button"
              onClick={() => onOpenVstRack()}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 flex items-center gap-1 transition"
              title="Abrir Rack de Plugins VST (TDR Nova EQ, OTT Compressor, Tube Drive, Pitchproof & Catálogo Plugin Boutique)"
            >
              <Cpu className="w-3 h-3 text-amber-300" />
              <span>Rack VST & FX</span>
            </button>
          )}

          <button
            type="button"
            onClick={onResetMixer}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 transition"
            title="Restaurar todos os volumes para 0.0 dB e limpar Mutes/Solos/Plugins"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Resetar Mix</span>
          </button>

          {soloCount > 0 && onClearAllSolos && (
            <button
              type="button"
              onClick={onClearAllSolos}
              className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-500 text-slate-950 hover:bg-amber-400 flex items-center gap-1 shadow-lg shadow-amber-500/25 animate-pulse transition"
              title="Limpar todos os canais em Solo e voltar à mixagem completa da banda"
            >
              <VolumeX className="w-3 h-3" />
              <span>Limpar Solos ({soloCount})</span>
            </button>
          )}

          {isSoloClickActive && (
            <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full animate-pulse">
              MODO RESGATE: Apenas Click no Fone
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
