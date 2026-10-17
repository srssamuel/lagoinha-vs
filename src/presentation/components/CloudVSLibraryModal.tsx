import React, { useState, useEffect } from 'react';
import { CloudSong } from '../../domain/entities/CloudSong';
import { DemoCloudVSLibrary } from '../../infrastructure/mock/DemoCloudVSLibrary';
import { Song } from '../../domain/entities/Song';
import { X, Search, Cloud, Plus, Check, Music2, HardDrive, UploadCloud } from 'lucide-react';

interface CloudVSLibraryModalProps {
  isOpen: boolean;
  canUpload: boolean;
  onClose: () => void;
  onAddSongToSetlist: (song: Song) => void;
}

export const CloudVSLibraryModal: React.FC<CloudVSLibraryModalProps> = ({
  isOpen,
  canUpload,
  onClose,
  onAddSongToSetlist
}) => {
  const [repository] = useState(() => new DemoCloudVSLibrary());
  const [songs, setSongs] = useState<CloudSong[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'catalog' | 'upload'>('catalog');
  const [addedSongIds, setAddedSongIds] = useState<Set<string>>(new Set());

  // Upload Form State
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newKey, setNewKey] = useState('G');
  const [newBpm, setNewBpm] = useState(120);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void repository.searchSongs(searchQuery, selectedKey).then(setSongs);
    }
  }, [isOpen, searchQuery, selectedKey, repository]);

  const handleSelectSong = async (cloudSong: CloudSong) => {
    const playbackSong = await repository.convertCloudSongToPlaybackSong(cloudSong);
    onAddSongToSetlist(playbackSong);
    setAddedSongIds((prev) => new Set([...prev, cloudSong.id]));
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle) return;

    setIsSubmitting(true);
    try {
      const created = await repository.uploadSong(
        {
          title: newTitle,
          artist: newArtist || 'Lagoinha Worship',
          originalKey: newKey,
          bpm: newBpm,
          duration: 300
        },
        uploadedFiles
      );

      setNewTitle('');
      setNewArtist('');
      setUploadedFiles([]);
      setActiveTab('catalog');
      // Recarrega catálogo
      const list = await repository.listAllSongs();
      setSongs(list);
      // Auto adiciona ao setlist
      await handleSelectSong(created);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
      <div className="bg-[#121824] border border-stage-border rounded-3xl max-w-3xl w-full p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[85vh]">
        {/* Header do Banco de VS */}
        <div className="flex items-center justify-between border-b border-stage-border pb-4 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white tracking-wide uppercase">
                  Banco de VS na Nuvem
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  GOOGLE CLOUD STORAGE
                </span>
              </div>
              <p className="text-xs text-stage-muted">
                Catálogo oficial de multitracks sincronizadas do ministério de louvor Lagoinha João Pessoa.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-stage-card border border-stage-border text-stage-muted hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas: Catálogo na Nuvem vs Upload de Novo VS */}
        <div className="flex items-center gap-2 mb-4 shrink-0">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'catalog'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-stage-card text-slate-400 hover:text-white'
            }`}
          >
            Catálogo na Nuvem ({songs.length} Músicas)
          </button>

          {canUpload && (
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'upload'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-stage-card text-slate-400 hover:text-white'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Subir Novo VS (Upload Stems)</span>
            </button>
          )}
        </div>

        {/* Conteúdo Aba Catálogo */}
        {activeTab === 'catalog' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Barra de Pesquisa e Filtros */}
            <div className="flex items-center gap-3 mb-4 shrink-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stage-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Pesquisar por título, artista ou tag (ex: Casa Worship, Entrada, Ceia)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Filtro por Tom */}
              <select
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-slate-300 focus:outline-none font-mono"
              >
                <option value="">Todos os Tons</option>
                {['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Em', 'Ab', 'Gb'].map((k) => (
                  <option key={k} value={k}>
                    Tom {k}
                  </option>
                ))}
              </select>
            </div>

            {/* Lista de Músicas no Banco de VS */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {songs.map((song) => {
                const isAdded = addedSongIds.has(song.id);

                return (
                  <div
                    key={song.id}
                    className="p-3.5 rounded-2xl bg-stage-card border border-stage-border hover:border-slate-700 flex items-center justify-between gap-4 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 text-blue-400">
                        <Music2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-white truncate">
                            {song.title}
                          </h4>
                          <span className="text-[10px] font-mono font-bold text-stage-amber bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 rounded shrink-0">
                            Tom {song.originalKey}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded shrink-0">
                            {song.bpm} BPM
                          </span>
                        </div>
                        <p className="text-xs text-stage-muted truncate">
                          {song.artist} • {song.stemsCount} Stems de Áudio
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {song.tags.map((t) => (
                            <span
                              key={t}
                              className="text-[9px] font-mono bg-blue-950/60 text-blue-300 border border-blue-800/40 px-1.5 py-0.2 rounded"
                            >
                              #{t}
                            </span>
                          ))}
                          <span className="text-[9px] text-slate-500">
                            Enviado por: {song.uploadedBy}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectSong(song)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition active:scale-95 shrink-0 ${
                        isAdded
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30'
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
              })}
            </div>
          </div>
        )}

        {/* Conteúdo Aba Upload de Novo VS */}
        {activeTab === 'upload' && canUpload && (
          <form onSubmit={handleUploadSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase block mb-1">
                  Título da Música
                </label>
                <input
                  type="text"
                  placeholder="ex: Ruja o Leão"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase block mb-1">
                  Artista / Banda
                </label>
                <input
                  type="text"
                  placeholder="ex: Talitha Pereira"
                  value={newArtist}
                  onChange={(e) => setNewArtist(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase block mb-1">
                  Tom Original
                </label>
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase block mb-1">
                  BPM (Tempo)
                </label>
                <input
                  type="number"
                  value={newBpm}
                  onChange={(e) => setNewBpm(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white font-mono"
                />
              </div>
            </div>

            {/* Seletor de Arquivos de Áudio */}
            <div>
              <label className="text-[10px] font-bold text-slate-300 uppercase block mb-1">
                Arquivos das Multitracks (Stems WAV ou MP3)
              </label>
              <div className="border-2 border-dashed border-stage-border rounded-2xl p-6 text-center hover:border-blue-500/60 bg-slate-900/40">
                <HardDrive className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-300">
                  Arraste os arquivos de áudio dos stems ou clique para selecionar
                </p>
                <p className="text-[11px] text-stage-muted mt-0.5">
                  Click, Guia, Bateria, Baixo, Guitarras, Teclados, Pads, FX
                </p>
                <input
                  type="file"
                  multiple
                  accept="audio/*"
                  onChange={(e) => setUploadedFiles(Array.from(e.target.files || []))}
                  className="mt-3 text-xs text-slate-400"
                />
              </div>

              {uploadedFiles.length > 0 && (
                <div className="mt-2 text-xs text-emerald-400 font-mono">
                  {uploadedFiles.length} arquivos selecionados para upload no Google Cloud.
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !newTitle}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-lg shadow-blue-600/30 disabled:opacity-50"
            >
              {isSubmitting ? 'Sincronizando no Google Cloud...' : 'Salvar no Banco de VS da Lagoinha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
