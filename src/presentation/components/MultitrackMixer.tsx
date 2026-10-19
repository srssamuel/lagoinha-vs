import React, { useState } from 'react';
import { TrackStem, StemType } from '../../domain/entities/TrackStem';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import { ChordTransposer } from '../../domain/services/ChordTransposer';
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
  Minus,
  Cpu,
  Lock,
  Music2
} from 'lucide-react';
import { EnsaioMixMode } from '../../domain/services/EnsaioMixService';
import { MasterRtaData } from '../../application/ports/AudioEnginePort';

interface MultitrackMixerProps {
  stems: TrackStem[];
  routingMode: RoutingMode;
  isPlaying: boolean;
  isSoloClickActive: boolean;
  stemLevels?: Record<string, number>;
  originalKey?: string;
  currentKey?: string;
  pitchShiftSemitones?: number;
  masterVolume?: number;
  masterRta?: MasterRtaData;
  onVolumeChange: (stemId: string, vol: number) => void;
  onPanChange: (stemId: string, pan: number) => void;
  onToggleMute: (stemId: string) => void;
  onToggleSolo: (stemId: string) => void;
  onClearAllSolos?: () => void;
  onMasterVolumeChange?: (vol: number) => void;
  onResetMixer: () => void;
  onPitchShiftChange?: (semitones: number) => void;
  onTogglePitchLock?: (stemId: string) => void;
  onApplyEnsaioMix?: (targetType: StemType, mode: EnsaioMixMode) => void;
  onOpenVstRack?: (stemId?: string) => void;
  onAutoFixAllStems?: () => void;
}

type MixerFilterGroup = 'ALL' | 'STRINGS' | 'RHYTHM_KEYS' | 'CUES_VOCALS';

const ALL_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const STEM_ICONS: Record<StemType, React.ReactNode> = {
  click: <Headphones className="w-3.5 h-3.5 text-blue-400" />,
  guide: <Mic className="w-3.5 h-3.5 text-amber-400" />,
  drums: <Disc className="w-3.5 h-3.5 text-rose-400" />,
  loop: <Disc className="w-3.5 h-3.5 text-orange-400" />,
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
  originalKey = 'B',
  currentKey = 'B',
  pitchShiftSemitones = 0,
  masterVolume = 1.0,
  masterRta,
  onVolumeChange,
  onPanChange,
  onToggleMute,
  onToggleSolo,
  onClearAllSolos,
  onMasterVolumeChange,
  onResetMixer,
  onPitchShiftChange,
  onTogglePitchLock,
  onApplyEnsaioMix,
  onOpenVstRack,
  onAutoFixAllStems
}) => {
  const [filterGroup, setFilterGroup] = useState<MixerFilterGroup>('ALL');
  const [ensaioTarget, setEnsaioTarget] = useState<StemType>('guitars');
  const [ensaioMode, setEnsaioMode] = useState<EnsaioMixMode>('PADRAO');
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
      return (
        stem.type === 'drums' ||
        stem.type === 'loop' ||
        stem.type === 'keys' ||
        stem.type === 'pad'
      );
    }
    return (
      stem.type === 'click' ||
      stem.type === 'guide' ||
      stem.type === 'vocals' ||
      stem.type === 'fx'
    );
  });

  const violaoStem = stems.find((s) => s.type === 'violao');
  const guitarraStem = stems.find((s) => s.type === 'guitars');
  const stringStems = stems.filter((s) => s.isStringInstrument());
  const lockedStemsCount = stems.filter((s) => !s.isPitchShiftable).length;
  const pitchableStemsCount = stems.filter((s) => s.isPitchShiftable).length;
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

  const triggerEnsaioMix = (target: StemType, mode: EnsaioMixMode) => {
    setEnsaioTarget(target);
    setEnsaioMode(mode);
    onApplyEnsaioMix?.(target, mode);
  };

  const handleSelectTargetKey = (targetKey: string) => {
    if (!onPitchShiftChange) return;
    // Find semitone distance between originalKey and targetKey in [-6, +6]
    for (let st = -6; st <= 6; st++) {
      if (ChordTransposer.transposeChordLine(originalKey, st).trim() === targetKey) {
        onPitchShiftChange(st);
        return;
      }
    }
  };

  return (
    <div className="flex-1 bg-[#0c0c0e] p-3.5 lg:p-4 overflow-x-auto select-none flex flex-col justify-between">
      {/* Barra Superior do Console: Filtros + Mudança de Tom Inteligente (Pitch Lock) + EnsaioMix® + Rack VST */}
      <div className="flex flex-col gap-2 mb-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5 mr-1">
              <Sliders className="w-4 h-4 text-blue-400" />
              <span>Console Multitrack ({stems.length} Canais)</span>
            </h2>

            {/* Filtros de Grupo */}
            <button
              type="button"
              onClick={() => setFilterGroup('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                filterGroup === 'ALL'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white'
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
              <span>Cordas ({stringStems.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterGroup('RHYTHM_KEYS')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                filterGroup === 'RHYTHM_KEYS'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              Bateria, Loops & Teclas
            </button>
            <button
              type="button"
              onClick={() => setFilterGroup('CUES_VOCALS')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                filterGroup === 'CUES_VOCALS'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              Click, Guia & Voz
            </button>
          </div>

          {/* Controle Visível de Mudança de Tom + Proteção Rítmica (Pitchproof Constant-Tempo DSP) */}
          {onPitchShiftChange && (
            <div className="flex flex-wrap items-center gap-2 bg-[#121824] border border-amber-500/35 rounded-xl px-2.5 py-1">
              <div className="flex items-center gap-1.5">
                <Music2 className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-mono font-bold uppercase text-amber-300">
                  Mudar Tom (Pitch):
                </span>
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
                    {pitchShiftSemitones > 0 ? `+${pitchShiftSemitones} st` : `${pitchShiftSemitones} st`} (Reset)
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
            {onApplyEnsaioMix && (
              <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 rounded-lg px-2 py-0.5">
                <span className="text-[10px] font-mono font-bold text-amber-300 uppercase">
                  EnsaioMix®:
                </span>
                <select
                  value={ensaioTarget}
                  onChange={(e) => triggerEnsaioMix(e.target.value as StemType, ensaioMode)}
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
                  onClick={() => triggerEnsaioMix(ensaioTarget, 'AUMENTADA')}
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
                  onClick={() => triggerEnsaioMix(ensaioTarget, 'DIMINUTA')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                    ensaioMode === 'DIMINUTA'
                      ? 'bg-rose-600 text-white font-black'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
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
              onClick={() => {
                setEnsaioMode('PADRAO');
                onResetMixer();
              }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 transition"
              title="Restaurar todos os volumes para 0.0 dB e limpar Mutes/Solos/Plugins"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Resetar Mix</span>
            </button>

            {hasAnySolo && onClearAllSolos && (
              <button
                type="button"
                onClick={onClearAllSolos}
                className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-500 text-slate-950 hover:bg-amber-400 flex items-center gap-1 shadow-lg shadow-amber-500/25 animate-pulse transition"
                title="Limpar todos os canais em Solo e voltar à mixagem completa da banda"
              >
                <VolumeX className="w-3 h-3" />
                <span>Limpar Solos ({stems.filter((s) => s.isSolo).length})</span>
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

      {/* Canais do Mixer */}
      <div className="flex items-stretch gap-2 min-w-max pb-1">
        {filteredStems.map((stem) => {
          let isAudible = stem.isAudible(hasAnySolo);
          if (isSoloClickActive && stem.type !== 'click' && stem.type !== 'guide') {
            isAudible = false;
          }

          const isClickOrGuide = stem.type === 'click' || stem.type === 'guide';
          const isString = stem.isStringInstrument();
          const liveLevel =
            stemLevels[stem.id] ?? (isPlaying && isAudible ? Math.min(1, stem.volume * 0.65) : 0);
          const leftMeterPct =
            isPlaying && isAudible ? Math.min(100, Math.round(liveLevel * (stem.pan <= 0 ? 100 : 75))) : 0;
          const rightMeterPct =
            isPlaying && isAudible ? Math.min(100, Math.round(liveLevel * (stem.pan >= 0 ? 100 : 75))) : 0;
          const isBoosted = stem.volume > 1.02;
          const hasDspActive =
            stem.dsp.highPassHz > 25 ||
            stem.dsp.eqLowDb !== 0 ||
            stem.dsp.eqMidDb !== 0 ||
            stem.dsp.eqHighDb !== 0 ||
            stem.dsp.driveAmount > 0 ||
            stem.dsp.compressorEnabled;

          return (
            <div
              key={stem.id}
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
                  <span
                    className="text-[11px] font-bold text-slate-100 truncate max-w-[90px]"
                    title={stem.name}
                  >
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
                    {routingMode === 'SPLIT_IEM_PA'
                      ? isClickOrGuide
                        ? 'FONE L'
                        : 'PA R'
                      : 'ST'}
                  </span>

                  {/* Indicador Explícito de Pitch Lock vs Mudança de Tom por Canal */}
                  <button
                    type="button"
                    onClick={() => onTogglePitchLock?.(stem.id)}
                    className={`text-[8px] font-mono px-1 py-0.2 rounded uppercase font-bold border transition flex items-center gap-0.5 ${
                      !stem.isPitchShiftable
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                        : pitchShiftSemitones !== 0
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                        : 'bg-slate-900 text-cyan-300 border-cyan-500/30 hover:border-cyan-400'
                    }`}
                    title={
                      !stem.isPitchShiftable
                        ? `PITCH LOCK ATIVO (${stem.name}): Bateria, Loops, Click e Guia NUNCA sofrem mudança de tom. Clique se desejar destravar.`
                        : ` CANAL HARMÔNICO (${stem.name}): Muda de tom junto com a música (${
                            pitchShiftSemitones === 0
                              ? 'Tom Original'
                              : pitchShiftSemitones > 0
                              ? `+${pitchShiftSemitones} st`
                              : `${pitchShiftSemitones} st`
                          }). Clique para travar em Pitch Lock.`
                    }
                  >
                    {!stem.isPitchShiftable ? (
                      <>
                        <Lock className="w-2 h-2" />
                        <span>FIXO</span>
                      </>
                    ) : (
                      <span>
                        {pitchShiftSemitones === 0
                          ? 'TOM'
                          : pitchShiftSemitones > 0
                          ? `+${pitchShiftSemitones}st`
                          : `${pitchShiftSemitones}st`}
                      </span>
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
                  title={`Pan: ${stem.pan === 0 ? 'Centro' : stem.pan > 0 ? `R${Math.round(stem.pan * 100)}` : `L${Math.round(Math.abs(stem.pan) * 100)}`} (Clique para alternar)`}
                >
                  <div
                    className="w-0.5 h-2 bg-sky-400 rounded-full origin-bottom absolute top-1 transition-transform"
                    style={{ transform: `rotate(${stem.pan * 135}deg)` }}
                  />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                </button>
                <span className="text-[9px] font-mono text-slate-400">
                  Pan {stem.pan === 0 ? 'C' : stem.pan > 0 ? `R${Math.round(stem.pan * 100)}` : `L${Math.round(Math.abs(stem.pan) * 100)}`}
                </span>
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

                {/* VU Meter Estéreo Real (AnalyserNode RMS) */}
                <div className="flex gap-0.5 h-32 bg-slate-950 rounded p-0.5 border border-slate-800">
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
                <div className="relative w-8 h-32 flex items-center justify-center">
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
                  className={`flex-1 py-0.5 rounded font-mono text-[9px] font-bold border transition ${
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

        {/* Divisor Físico de Barramento Master */}
        <div className="w-[1.5px] bg-slate-800 self-stretch my-1 mx-1.5 shrink-0" />

        {/* Master Output Channel Strip (FOH & Stage Master Bus) */}
        <div className="w-36 flex flex-col items-center bg-[#10141f] border-2 border-blue-500/40 rounded-2xl p-2.5 shadow-2xl relative shrink-0">
          {/* Header do Master Bus */}
          <div className="w-full flex items-center justify-between pb-1 border-b border-slate-800 mb-1.5">
            <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider flex items-center gap-1">
              <Sliders className="w-3 h-3 text-blue-400" />
              <span>MASTER</span>
            </span>
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                masterRta?.isLimiting
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}
              title="Master Brickwall Limiter №6 (-1.0 dBFS Ceiling): Impede distorção no PA da igreja"
            >
              {masterRta?.isLimiting ? `${masterRta.gainReductionDb}dB GR` : 'LIM №6'}
            </span>
          </div>

          {/* RTA 5 Bandas em Tempo Real (Sub, Low, Mid, High, Air) */}
          <div className="w-full bg-slate-950/90 border border-slate-800 rounded-lg p-1.5 mb-2">
            <div className="flex items-center justify-between text-[8px] font-mono text-slate-400 mb-1">
              <span>RTA FFT</span>
              <span className="text-blue-300 font-bold">{isPlaying ? 'LIVE' : 'IDLE'}</span>
            </div>
            <div className="grid grid-cols-5 gap-1 h-10 items-end bg-slate-900/60 p-1 rounded">
              {/* SUB (<60Hz) */}
              <div
                className="flex flex-col items-center h-full justify-end cursor-help"
                title="SUBGRAVE (<60Hz): Peso do bumbo e subgraves eletrônicos"
              >
                <div
                  className="w-full bg-indigo-500 rounded-xs transition-all duration-75 min-h-[2px]"
                  style={{ height: `${Math.round((masterRta?.sub || 0) * 100)}%` }}
                />
                <span className="text-[7px] font-mono text-slate-500 mt-0.5">SUB</span>
              </div>
              {/* LOW (60-250Hz) */}
              <div
                className="flex flex-col items-center h-full justify-end cursor-help"
                title="GRAVES (60-250Hz): Linha de contrabaixo e corpo rítmico"
              >
                <div
                  className="w-full bg-blue-500 rounded-xs transition-all duration-75 min-h-[2px]"
                  style={{ height: `${Math.round((masterRta?.low || 0) * 100)}%` }}
                />
                <span className="text-[7px] font-mono text-slate-500 mt-0.5">LOW</span>
              </div>
              {/* MID (250-2.5k) */}
              <div
                className="flex flex-col items-center h-full justify-end cursor-help"
                title="MÉDIOS (250Hz-2.5kHz): Vocais, guitarras elétricas e piano"
              >
                <div
                  className="w-full bg-emerald-500 rounded-xs transition-all duration-75 min-h-[2px]"
                  style={{ height: `${Math.round((masterRta?.mid || 0) * 100)}%` }}
                />
                <span className="text-[7px] font-mono text-slate-500 mt-0.5">MID</span>
              </div>
              {/* HIGH (2.5k-8k) */}
              <div
                className="flex flex-col items-center h-full justify-end cursor-help"
                title="AGUDOS (2.5kHz-8kHz): Ataque da caixa, estalo e violão"
              >
                <div
                  className="w-full bg-amber-500 rounded-xs transition-all duration-75 min-h-[2px]"
                  style={{ height: `${Math.round((masterRta?.high || 0) * 100)}%` }}
                />
                <span className="text-[7px] font-mono text-slate-500 mt-0.5">HIGH</span>
              </div>
              {/* AIR (>8k) */}
              <div
                className="flex flex-col items-center h-full justify-end cursor-help"
                title="AR (>8kHz): Pratos da bateria, reverberação e ambiência"
              >
                <div
                  className="w-full bg-rose-500 rounded-xs transition-all duration-75 min-h-[2px]"
                  style={{ height: `${Math.round((masterRta?.air || 0) * 100)}%` }}
                />
                <span className="text-[7px] font-mono text-slate-500 mt-0.5">AIR</span>
              </div>
            </div>
          </div>

          {/* Medidores Estéreo Master L/R + Fader Vertical */}
          <div className="flex items-center justify-center gap-2 w-full my-auto">
            {/* Medidor Estéreo L / R */}
            <div className="flex items-center gap-1 h-32 py-1">
              {/* L */}
              <div className="w-2 h-full bg-slate-950 rounded-xs overflow-hidden flex flex-col-reverse border border-slate-800">
                <div
                  className="w-full transition-all duration-75 rounded-xs"
                  style={{
                    height: `${Math.min(100, Math.round(((masterRta?.peakL || 0) / 1.2) * 100))}%`,
                    backgroundColor: (masterRta?.peakL || 0) > 1.0 ? '#f43f5e' : (masterRta?.peakL || 0) > 0.85 ? '#f59e0b' : '#38bdf8'
                  }}
                />
              </div>
              {/* R */}
              <div className="w-2 h-full bg-slate-950 rounded-xs overflow-hidden flex flex-col-reverse border border-slate-800">
                <div
                  className="w-full transition-all duration-75 rounded-xs"
                  style={{
                    height: `${Math.min(100, Math.round(((masterRta?.peakR || 0) / 1.2) * 100))}%`,
                    backgroundColor: (masterRta?.peakR || 0) > 1.0 ? '#f43f5e' : (masterRta?.peakR || 0) > 0.85 ? '#f59e0b' : '#34d399'
                  }}
                />
              </div>
            </div>

            {/* Fader Master Vertical */}
            <div className="relative w-8 h-32 flex items-center justify-center">
              <div
                className="absolute left-0 right-0 top-1/2 h-[1px] bg-blue-400/60 pointer-events-none"
                title="0.0 dB (Unity Gain)"
              />
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={masterVolume}
                onChange={(e) => onMasterVolumeChange?.(parseFloat(e.target.value))}
                onDoubleClick={() => onMasterVolumeChange?.(1.0)}
                className="fader-vertical"
                aria-label="Volume Master"
                title={`Volume Master: ${formatDb(masterVolume)} (Duplo clique para 0.0 dB)`}
              />
            </div>
          </div>

          {/* Ajuste Fino Master (- / 0dB / +) */}
          <div className="flex items-center justify-between gap-1 w-full mt-2">
            <button
              type="button"
              onClick={() => onMasterVolumeChange?.(Math.max(0, Number((masterVolume - 0.1).toFixed(2))))}
              className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 text-[10px] font-bold"
              title="Reduzir Master (-0.1)"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onMasterVolumeChange?.(1.0)}
              className="flex-1 py-0.5 rounded font-mono text-[9px] font-bold bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30 transition text-center"
              title="Restaurar Ganho Nominal (0.0 dB)"
            >
              {formatDb(masterVolume)}
            </button>
            <button
              type="button"
              onClick={() => onMasterVolumeChange?.(Math.min(1.5, Number((masterVolume + 0.1).toFixed(2))))}
              className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-blue-400 text-slate-200 text-[10px] font-bold"
              title="Aumentar Master (+0.1)"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
