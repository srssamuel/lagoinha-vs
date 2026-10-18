import React, { useState, useEffect } from 'react';
import { CloudSong } from '../../domain/entities/CloudSong';
import { DemoCloudVSLibrary } from '../../infrastructure/mock/DemoCloudVSLibrary';
import { Song } from '../../domain/entities/Song';
import { ZipMultitrackExtractor } from '../../infrastructure/audio/ZipMultitrackExtractor';
import {
  X,
  Search,
  Cloud,
  Plus,
  Check,
  Music2,
  HardDrive,
  UploadCloud,
  Globe,
  ExternalLink
} from 'lucide-react';

interface CloudVSLibraryModalProps {
  isOpen: boolean;
  canUpload: boolean;
  onClose: () => void;
  onAddSongToSetlist: (song: Song) => void;
}

const EXTERNAL_REPOSITORIES = [
  {
    name: 'MultiTracks.com.br — Conteúdo Gratuito (MultiTrack Gratuita do Mês & Pads)',
    url: 'https://www.multitracks.com.br/products/free/',
    badge: 'CONTEÚDO GRATUITO OFICIAL',
    description:
      'Página oficial de recursos gratuitos da MultiTracks.com.br: inclui a MultiTrack Gratuita do Mês (Free Play), Pacotes de Pads Ambiente gratuitos e recursos de teste que podem ser importados diretamente no Lagoinha VS.'
  },
  {
    name: 'MultiTracks.com.br — Catálogo Completo Gospel & Worship (Brasil)',
    url: 'https://www.multitracks.com.br/songs/',
    badge: 'CATÁLOGO OFICIAL WORSHIP',
    description:
      'Maior acervo mundial de multitracks originais de estúdio (Casa Worship, Gabriel Guedes, Isaías Saad, Lagoinha, Elevation, Bethel) com canais isolados de Violão, Guitarra, Baixo, Bateria, Keys, Click e Guia.'
  },
  {
    name: 'Cambridge MT — Open Multitrack Download Library (500+ Projetos WAV Grátis)',
    url: 'https://cambridge-mt.com/ms/mtk/',
    badge: 'DOWNLOAD DIRETO GRATUITO (WAV)',
    description:
      'Maior biblioteca pública de multitracks reais de estúdio abertas para download gratuito em ZIP/WAV, com canais individuais de Violão Acústico, Guitarra Elétrica, Contrabaixo, Bateria, Piano, Cordas e Vozes.'
  },
  {
    name: 'Telefunken — Live From The Lab (Stems Reais de Estúdio Grátis)',
    url: 'https://www.telefunken-elektroakustik.com/live-from-the-lab-season-4/',
    badge: 'MULTITRACKS DE ESTÚDIO GRÁTIS',
    description:
      'Sessões multitrack reais gravadas ao vivo em estúdio com microfones Telefunken, disponibilizadas gratuitamente em arquivos WAV stem-por-stem.'
  },
  {
    name: 'Loop Community — Prime Multitracks & Community Stems',
    url: 'https://loopcommunity.com/en-us/tracks',
    badge: 'PRODUTORES & COMUNIDADE',
    description:
      'Repositório global de produtores de louvor com pacotes de stems WAV/MP3 prontos para importar diretamente no Lagoinha VS.'
  },
  {
    name: 'Worship Backing Band — MultiTrack Player Stems',
    url: 'https://www.worshipbackingband.com/',
    badge: 'LOUVOR CONGREGACIONAL',
    description:
      'Multitracks econômicas em WAV separadas por instrumento para igrejas e ministérios de louvor.'
  }
];

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
  const [activeTab, setActiveTab] = useState<'catalog' | 'upload' | 'repositories'>('catalog');
  const [addedSongIds, setAddedSongIds] = useState<Set<string>>(new Set());

  // Upload Form State
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newKey, setNewKey] = useState('B');
  const [newBpm, setNewBpm] = useState(140);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
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

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;

    const zipFile = rawFiles.find((f) => f.name.toLowerCase().endsWith('.zip'));
    if (zipFile) {
      setIsExtractingZip(true);
      try {
        const meta = ZipMultitrackExtractor.parseMetadataFromZipName(zipFile.name);
        if (!newTitle) setNewTitle(meta.title);
        if (!newArtist) setNewArtist(meta.artist);
        setNewBpm(meta.bpm);
        setNewKey(meta.originalKey);

        const zipBuffer = await zipFile.arrayBuffer();
        const extracted = await ZipMultitrackExtractor.extractAudioFiles(zipBuffer);
        const asFiles = extracted.map(
          (entry) => new File([entry.data], entry.filename, { type: 'audio/wav' })
        );
        setUploadedFiles(asFiles.length > 0 ? asFiles : rawFiles);
      } catch {
        setUploadedFiles(rawFiles);
      } finally {
        setIsExtractingZip(false);
      }
    } else {
      setUploadedFiles(rawFiles);
    }
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
          duration: 247
        },
        uploadedFiles
      );

      setNewTitle('');
      setNewArtist('');
      setUploadedFiles([]);
      setActiveTab('catalog');
      const list = await repository.listAllSongs();
      setSongs(list);
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
                  Banco de VS na Nuvem & Repositórios
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  SUPORTE A .ZIP / WAV / MP3
                </span>
              </div>
              <p className="text-xs text-stage-muted">
                Catálogo com stems isolados (Click, Guia, Bateria, Loops, Baixo, Guitarras, Violão, Teclados, Pad e Vozes).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-stage-card border border-stage-border text-stage-muted hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas: Catálogo na Nuvem | Subir Novo VS | Repositórios Reais de Multitracks */}
        <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'catalog'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-stage-card text-slate-400 hover:text-white'
            }`}
          >
            Catálogo Lagoinha ({songs.length} Músicas)
          </button>

          {canUpload && (
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'upload'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-stage-card text-slate-400 hover:text-white'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Subir Novo VS (ZIP / WAV / MP3)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('repositories')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'repositories'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-stage-card text-amber-300 border border-amber-500/30 hover:bg-amber-500/10'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Repositórios Externos de Multitracks</span>
          </button>
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
                  placeholder="Pesquisar por título, artista ou tag (ex: O Nosso General, Casa Worship, Bondade de Deus)..."
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
                          {song.artist} • {song.stemsCount} Stems Isolados (Bateria/Loops/Click em Pitch Lock)
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
                      type="button"
                      onClick={() => void handleSelectSong(song)}
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
          <form onSubmit={(e) => void handleUploadSubmit(e)} className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-300 uppercase block mb-1">
                  Título da Música
                </label>
                <input
                  type="text"
                  placeholder="ex: O Nosso General"
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
                  placeholder="ex: Versão Mateus Brito"
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

            {/* Seletor de Pacote ZIP ou Arquivos de Áudio */}
            <div>
              <label className="text-[10px] font-bold text-slate-300 uppercase block mb-1">
                Pacote .ZIP de Multitrack ou Stems Individuais (WAV / MP3)
              </label>
              <div className="border-2 border-dashed border-stage-border rounded-2xl p-6 text-center hover:border-blue-500/60 bg-slate-900/40">
                <HardDrive className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-300">
                  Selecione o arquivo .ZIP completo da Multitrack ou os arquivos WAV/MP3
                </p>
                <p className="text-[11px] text-stage-muted mt-0.5">
                  O sistema extrai o .ZIP automaticamente, identifica BPM/Tom e protege Bateria, Loops, Click e Guia contra mudança de tom.
                </p>
                <input
                  type="file"
                  multiple
                  accept=".zip,application/zip,audio/*,.wav,.mp3,.ogg,.flac,.m4a"
                  onChange={(e) => void handleFilesSelected(e)}
                  className="mt-3 text-xs text-slate-400"
                />
              </div>

              {isExtractingZip && (
                <div className="mt-2 text-xs text-amber-300 font-mono">
                  Descompactando pacote .ZIP de Multitracks...
                </div>
              )}

              {uploadedFiles.length > 0 && !isExtractingZip && (
                <div className="mt-2 text-xs text-emerald-400 font-mono">
                  ✓ {uploadedFiles.length} stems prontos para abrir no Mixer (Bateria, Loops, Click e Guia com Pitch Lock automático).
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isExtractingZip || !newTitle}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-lg shadow-blue-600/30 disabled:opacity-50"
            >
              {isSubmitting ? 'Carregando Stems no Mixer...' : 'Salvar e Abrir Multitrack no Culto'}
            </button>
          </form>
        )}

        {/* Conteúdo Aba Repositórios Externos Reais */}
        {activeTab === 'repositories' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            <div className="p-3 rounded-2xl bg-blue-950/30 border border-blue-500/30 text-xs text-slate-300">
              Baixe pacotes de Multitracks (<strong className="text-white">.ZIP, WAV ou MP3</strong>) de qualquer um dos repositórios abaixo e clique em{' '}
              <strong className="text-white">&ldquo;Subir Track (.ZIP / WAV / MP3)&rdquo;</strong> na barra lateral para abrir os canais separados automaticamente.
            </div>

            {EXTERNAL_REPOSITORIES.map((repo) => (
              <a
                key={repo.url}
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 rounded-2xl bg-stage-card border border-stage-border hover:border-amber-400/60 transition group"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white group-hover:text-amber-300 transition">
                      {repo.name}
                    </span>
                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {repo.badge}
                    </span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-amber-300 shrink-0" />
                </div>
                <p className="text-xs text-stage-muted leading-relaxed">{repo.description}</p>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
