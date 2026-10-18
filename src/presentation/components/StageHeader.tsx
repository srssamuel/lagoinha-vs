import React from 'react';
import {
  Volume2,
  Radio,
  Music2,
  ShieldCheck,
  Minus,
  Plus,
  Cloud,
  LogOut,
  User as UserIcon,
  FileText,
  Lock,
  Cpu
} from 'lucide-react';
import { Song } from '../../domain/entities/Song';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import { User } from '../../domain/entities/User';

interface StageHeaderProps {
  songs: Song[];
  currentSongIndex: number;
  currentSong: Song | null;
  currentBeat: number;
  currentBar: number;
  isPlaying: boolean;
  routingMode: RoutingMode;
  masterVolume: number;
  currentUser: User | null;
  onSelectSongIndex: (idx: number) => void;
  onBpmChange: (newBpm: number) => void;
  onPitchShiftChange: (semitones: number) => void;
  onMasterVolumeChange: (vol: number) => void;
  onOpenRoutingModal: () => void;
  onOpenCloudLibrary: () => void;
  onOpenCifraModal: () => void;
  onOpenVstRack?: () => void;
  onSignOut: () => void;
}

export const StageHeader: React.FC<StageHeaderProps> = ({
  songs,
  currentSongIndex,
  currentSong,
  currentBeat,
  currentBar,
  isPlaying,
  routingMode,
  masterVolume,
  currentUser,
  onSelectSongIndex,
  onBpmChange,
  onPitchShiftChange,
  onMasterVolumeChange,
  onOpenRoutingModal,
  onOpenCloudLibrary,
  onOpenCifraModal,
  onOpenVstRack,
  onSignOut
}) => {
  return (
    <header className="bg-stage-surface border-b border-stage-border px-5 py-2 flex flex-wrap items-center justify-between gap-3 shadow-xl">
      {/* Brand & Church Identity */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10 shrink-0">
          <Music2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-white tracking-wide uppercase">
              Lagoinha VS
            </h1>
            <span className="text-[9px] font-bold px-2 py-0.2 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
              JOÃO PESSOA
            </span>
          </div>
          <p className="text-[11px] text-stage-muted truncate max-w-[220px]">
            {currentSong ? `${currentSong.title} • ${currentSong.artist}` : 'Repertório do Culto'}
          </p>
        </div>
      </div>

      {/* Setlist Song Thumbnails Ribbon */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full sm:max-w-md lg:max-w-lg">
        {songs.map((song, idx) => {
          const isSelected = currentSongIndex === idx;
          return (
            <button
              type="button"
              key={song.id}
              onClick={() => onSelectSongIndex(idx)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all shrink-0 active:scale-95 ${
                isSelected
                  ? 'bg-blue-600/30 border-blue-400 text-white shadow-md shadow-blue-500/20 ring-1 ring-blue-400/50'
                  : 'bg-stage-card border-stage-border text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-200 font-mono">
                {idx + 1}
              </div>
              <div className="text-left">
                <div className="text-xs font-bold truncate max-w-[115px]">
                  {song.title}
                </div>
                <div className="text-[9px] font-mono text-stage-amber">
                  Tom {song.currentKey} • {song.bpm} BPM
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Musical Stage Telemetry */}
      {currentSong && (
        <div className="flex flex-wrap items-center gap-3 bg-stage-card/70 border border-stage-border px-3 py-1 rounded-2xl shadow-inner max-w-full">
          {/* Tom / Key com Transposição em Tempo Real (-6 a +6 semitons) + Proteção Bateria/Loop/Click */}
          <div className="text-center flex flex-col items-center">
            <span
              className="text-[9px] text-amber-300 uppercase tracking-wider flex items-center gap-1 font-bold"
              title="Pitchproof Constant-Tempo DSP: Muda o tom apenas de Baixo, Guitarras, Violão, Teclados, Pad e Vocais. Bateria, Loops, Click e Guia permanecem bloqueados no tom original."
            >
              <Lock className="w-2.5 h-2.5 text-emerald-400" />
              <span>Tom (Bateria/Click Fixos)</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onPitchShiftChange(currentSong.pitchShiftSemitones - 1)}
                className="w-5 h-5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition"
                title="Baixar 1 semitom (-1) nos instrumentos harmônicos e na cifra (Bateria, Loops, Click e Guia protegidos)"
              >
                <Minus className="w-3 h-3" />
              </button>

              <span
                onClick={() => onPitchShiftChange(0)}
                className="text-lg font-black text-stage-amber font-mono min-w-[34px] cursor-pointer flex items-center justify-center gap-1"
                title={`Tom Original: ${currentSong.originalKey} (Clique para restaurar 0 st)`}
              >
                <span>{currentSong.currentKey}</span>
                {currentSong.pitchShiftSemitones !== 0 && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {currentSong.pitchShiftSemitones > 0
                      ? `+${currentSong.pitchShiftSemitones}`
                      : currentSong.pitchShiftSemitones}
                  </span>
                )}
              </span>

              <button
                type="button"
                onClick={() => onPitchShiftChange(currentSong.pitchShiftSemitones + 1)}
                className="w-5 h-5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition"
                title="Subir 1 semitom (+1) nos instrumentos harmônicos e na cifra (Bateria, Loops, Click e Guia protegidos)"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="w-px h-7 bg-stage-border/60" />

          {/* BPM */}
          <div className="text-center flex flex-col items-center">
            <span className="text-[9px] text-stage-muted uppercase tracking-wider block font-semibold">
              BPM
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onBpmChange(Math.max(40, currentSong.bpm - 1))}
                className="w-5 h-5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
                title="Diminuir 1 BPM"
              >
                <Minus className="w-3 h-3" />
              </button>

              <span className="text-lg font-black text-white font-mono min-w-[34px]">
                {currentSong.bpm}
              </span>

              <button
                type="button"
                onClick={() => onBpmChange(Math.min(240, currentSong.bpm + 1))}
                className="w-5 h-5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
                title="Aumentar 1 BPM"
              >
                <Plus className="w-3 h-3" />
              </button>

              <span
                className={`w-2.5 h-2.5 rounded-full transition-all duration-70 ml-1 ${
                  isPlaying
                    ? currentBeat === 1
                      ? 'bg-blue-400 shadow-md shadow-blue-400 scale-125'
                      : 'bg-blue-800 scale-90 opacity-60'
                    : 'bg-slate-700 opacity-40'
                }`}
              />
            </div>
          </div>

          <div className="w-px h-7 bg-stage-border/60" />

          {/* Compasso */}
          <div className="text-center">
            <span className="text-[9px] text-stage-muted uppercase tracking-wider block font-semibold">
              Compasso
            </span>
            <div className="font-mono text-base font-bold text-slate-100">
              <span className="text-white">{currentBar}</span>
              <span className="text-stage-muted text-xs mx-0.5">.</span>
              <span className="text-blue-400">{currentBeat}</span>
            </div>
          </div>
        </div>
      )}

      {/* Cifra Pro, Rack VST, Cloud VS Button, Output Routing & User Profile */}
      <div className="flex flex-wrap items-center gap-1.5 max-w-full">
        {/* Botão Cifra Pro® & Mapa Dinâmico (MultiTracks ChartBuilder) */}
        <button
          type="button"
          onClick={onOpenCifraModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-bold transition active:scale-95"
          title="Abrir Cifra Pro® Sincronizada e Graus Nashville"
        >
          <FileText className="w-3.5 h-3.5 text-amber-300" />
          <span>CIFRA PRO®</span>
        </button>

        {/* Botão Rack VST & Plugins (Plugin Boutique Free FX) */}
        {onOpenVstRack && (
          <button
            type="button"
            onClick={onOpenVstRack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[11px] font-bold transition active:scale-95"
            title="Abrir Rack de Plugins VST (TDR Nova EQ, OTT Compressor, Pitchproof Pitch Shifter & Plugin Boutique)"
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-300" />
            <span>PLUGINS VST</span>
          </button>
        )}

        {/* Botão Banco de VS (Google Cloud) */}
        <button
          type="button"
          onClick={onOpenCloudLibrary}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-blue-500/40 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-[11px] font-bold transition active:scale-95 shadow-md shadow-blue-600/10"
          title="Abrir Banco de Multitracks na Nuvem e Repositórios"
        >
          <Cloud className="w-3.5 h-3.5 text-blue-400" />
          <span>BANCO DE VS</span>
        </button>

        {/* Roteamento de Palco (Split vs Stereo) */}
        <button
          onClick={onOpenRoutingModal}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all ${
            routingMode === 'SPLIT_IEM_PA'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
          }`}
          title="Clique para configurar saídas de áudio"
        >
          {routingMode === 'SPLIT_IEM_PA' ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>SPLIT L/R</span>
            </>
          ) : (
            <>
              <Radio className="w-3.5 h-3.5 text-blue-400" />
              <span>STEREO</span>
            </>
          )}
        </button>

        {/* Master Volume */}
        <div className="flex items-center gap-1.5 bg-stage-card px-2 py-1.5 rounded-xl border border-stage-border">
          <Volume2 className="w-3.5 h-3.5 text-stage-muted" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
            className="w-14 accent-blue-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            title={`Volume Master: ${Math.round(masterVolume * 100)}%`}
          />
        </div>

        {/* User Profile Badge & Logout */}
        {currentUser && (
          <div className="flex items-center gap-1.5 pl-1 border-l border-stage-border">
            <div className="flex items-center gap-1.5 bg-stage-card px-2 py-1 rounded-xl border border-stage-border">
              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[9px] font-black">
                {currentUser.displayName.charAt(0).toUpperCase() || <UserIcon className="w-3 h-3" />}
              </div>
              <div className="text-left text-[10px]">
                <div className="font-bold text-white truncate max-w-[75px]">
                  {currentUser.displayName}
                </div>
              </div>
            </div>

            <button
              onClick={onSignOut}
              className="p-1.5 rounded-xl bg-stage-card border border-stage-border text-slate-400 hover:text-rose-400 transition"
              title="Sair da Conta (Logout)"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
