import React from 'react';
import { Check, HardDrive, Music2, Plus } from 'lucide-react';
import { CloudSong } from '../../../domain/entities/CloudSong';

interface CloudSongRowProps {
  song: CloudSong;
  /** catalog = banco de VS (azul, tags e autor); drive = pasta Google Drive (verde, caminho). */
  variant: 'catalog' | 'drive';
  isAdded: boolean;
  onAdd: (song: CloudSong) => void;
}

const THEME = {
  catalog: {
    card: 'border-stage-border hover:border-slate-700',
    icon: 'bg-slate-800 text-blue-400',
    key: 'text-stage-amber bg-amber-500/10 border-amber-500/30',
    button: 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30',
    stemsNote: 'Stems Isolados (Bateria/Loops/Click em Pitch Lock)'
  },
  drive: {
    card: 'border-emerald-500/20 hover:border-emerald-500/50',
    icon: 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-400',
    key: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
    button: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30',
    stemsNote: 'Stems Isolados (Bateria, Baixo, Guitarras, Keys, Click & Guia)'
  }
} as const;

/** Uma música do banco de VS ou do Google Drive, com o botão "Carregar no Setlist". */
export const CloudSongRow: React.FC<CloudSongRowProps> = ({ song, variant, isAdded, onAdd }) => {
  const theme = THEME[variant];

  return (
    <div
      className={`p-3.5 rounded-2xl bg-stage-card border flex items-center justify-between gap-4 transition ${theme.card}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${theme.icon}`}>
          <Music2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-sm text-white truncate">{song.title}</h4>
            <span className={`text-[10px] font-mono font-bold border px-1.5 py-0.2 rounded shrink-0 ${theme.key}`}>
              Tom {song.originalKey}
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded shrink-0">
              {song.bpm} BPM
            </span>
          </div>
          <p className="text-xs text-stage-muted truncate">
            {song.artist} • {song.stemsCount} {theme.stemsNote}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {variant === 'catalog' ? (
              <>
                {song.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[9px] font-mono bg-blue-950/60 text-blue-300 border border-blue-800/40 px-1.5 py-0.2 rounded"
                  >
                    #{t}
                  </span>
                ))}
                <span className="text-[9px] text-slate-500">Enviado por: {song.uploadedBy}</span>
              </>
            ) : (
              <>
                <span className="text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800/40 px-1.5 py-0.2 rounded flex items-center gap-1">
                  <HardDrive className="w-2.5 h-2.5" />
                  Google Drive
                </span>
                <span className="text-[9px] text-slate-400">Caminho: {song.storageFolder || 'gdrive://oficial'}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onAdd(song)}
        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition active:scale-95 shrink-0 ${
          isAdded ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : theme.button
        }`}
      >
        {isAdded ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>Adicionado ao Culto</span>
          </>
        ) : (
          <>
            <Plus className="w-3.5 h-3.5" />
            <span>Carregar no Setlist</span>
          </>
        )}
      </button>
    </div>
  );
};
