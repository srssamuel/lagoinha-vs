import React from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, FolderOpen, HardDrive, RefreshCw } from 'lucide-react';
import { CloudSong } from '../../../domain/entities/CloudSong';
import { GoogleDriveConfig } from '../../../domain/entities/GoogleDriveConfig';
import { CloudSongRow } from './CloudSongRow';

export interface DriveSyncMessage {
  text: string;
  type: 'success' | 'error';
}

interface GoogleDriveTabProps {
  config: GoogleDriveConfig | null;
  folderInput: string;
  onFolderInputChange: (value: string) => void;
  isSyncing: boolean;
  syncMessage: DriveSyncMessage | null;
  songs: CloudSong[];
  addedSongIds: Set<string>;
  onSync: () => void;
  onAddSong: (song: CloudSong) => void;
}

const OFFICIAL_FOLDER_URL = 'https://drive.google.com/drive/folders/1UFb_TsRge8lBSMSDbzeIueQUlm3aKGL_';

/** Aba Google Drive Lagoinha: pasta compartilhada da igreja + cache offline no IndexedDB. */
export const GoogleDriveTab: React.FC<GoogleDriveTabProps> = ({
  config,
  folderInput,
  onFolderInputChange,
  isSyncing,
  syncMessage,
  songs,
  addedSongIds,
  onSync,
  onAddSong
}) => (
  <div className="flex-1 flex flex-col overflow-hidden space-y-3">
    {/* Header de Sincronização da Pasta do Google Drive */}
    <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <HardDrive className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              {config?.folderName || 'Pasta Oficial Google Drive — Louvor Lagoinha JP'}
              <span className="text-[9px] font-mono px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                SEM CUSTOS DE NUVEM
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Todos os membros e líderes sincronizam a mesma pasta. Stems baixados ficam salvos em cache local seguro
              (IndexedDB) para o culto.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono bg-emerald-950/50 px-2.5 py-1 rounded-xl border border-emerald-500/30">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Cache Offline Seguro</span>
        </div>
      </div>

      {/* Input de URL da Pasta + Botão de Sincronização */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <FolderOpen className="w-4 h-4 text-emerald-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={folderInput}
            onChange={(e) => onFolderInputChange(e.target.value)}
            placeholder="Cole o link ou ID da pasta do Google Drive da igreja..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        <button
          type="button"
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-md shadow-emerald-600/30 shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Pasta'}</span>
        </button>
      </div>

      {/* Feedback de Sincronização */}
      {syncMessage && (
        <div
          className={`mt-2 flex items-center gap-2 text-xs rounded-xl px-3 py-1.5 ${
            syncMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
          }`}
        >
          {syncMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{syncMessage.text}</span>
        </div>
      )}

      {/* Dica Didática para Conectar a Pasta Real do Google Drive */}
      <div className="mt-2.5 p-3 rounded-xl bg-slate-900/90 border border-slate-700/60 text-[11px] text-slate-300">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase">
            Passo a Passo para Conectar sua Pasta
          </span>
          <a
            href={OFFICIAL_FOLDER_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition shadow-sm"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Abrir Pasta Louvor_Lagoinha_GoogleDrive</span>
          </a>
        </div>
        <ol className="list-decimal list-inside space-y-1 text-slate-300/90 leading-relaxed">
          <li>
            No Google Drive, clique em <strong>Novo &gt; Nova Pasta</strong> (ex: <em>Louvor Lagoinha — Multitracks e PADs</em>).
          </li>
          <li>
            Clique com o botão direito na pasta &gt; <strong>Compartilhar &gt; Compartilhar</strong>.
          </li>
          <li>
            Em <em>Acesso Geral</em>, altere para <strong>&quot;Qualquer pessoa com o link&quot;</strong> e clique em{' '}
            <strong>Copiar link</strong>.
          </li>
          <li>
            Cole o link copiado no campo acima e clique em <strong>Sincronizar Pasta</strong>.
          </li>
        </ol>
      </div>
    </div>

    {/* Lista de Multitracks do Google Drive */}
    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
      {songs.map((song) => (
        <CloudSongRow key={song.id} song={song} variant="drive" isAdded={addedSongIds.has(song.id)} onAdd={onAddSong} />
      ))}
    </div>

    {/* Dica Didática para a Equipe de Louvor */}
    <div className="p-3 rounded-2xl bg-slate-900 border border-stage-border text-[11px] text-slate-400 shrink-0">
      <strong className="text-white font-semibold block mb-0.5">
        💡 Como organizar as multitracks no Google Drive da Lagoinha:
      </strong>
      Para adicionar uma nova música, basta arrastar o arquivo <span className="font-mono text-emerald-400">.ZIP</span> com os
      stems para a pasta compartilhada e clicar em <span className="font-bold text-white">&ldquo;Sincronizar Pasta&rdquo;</span>.
      Qualquer líder ou técnico de som tem acesso imediato.
    </div>
  </div>
);
