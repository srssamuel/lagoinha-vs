import React, { useEffect, useRef, useState } from 'react';
import { Song } from '../../domain/entities/Song';
import { User } from '../../domain/entities/User';
import { SongSection } from '../../domain/value-objects/SongSection';
import {
  ListMusic,
  Play,
  Calendar,
  Music,
  Trash2,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  FolderArchive,
  Download,
  Upload
} from 'lucide-react';
import { TrackStem } from '../../domain/entities/TrackStem';
import { ZipMultitrackExtractor } from '../../infrastructure/audio/ZipMultitrackExtractor';
import { analyzeKeyFromStems, isAbortError } from '../../infrastructure/audio/AudioKeyAnalyzer';
import { KeyAnalysisSlot } from '../../infrastructure/audio/KeyAnalysisSlot';
import { resolveImportKey, stableImportId, stableStemId } from '../../application/setlist/importIdentity';
import { keyFromName, UNKNOWN_KEY, type SongKeyInfo } from '../../domain/value-objects/SongKey';
import { VstPluginRackService } from '../../domain/services/VstPluginRackService';
import { IndexedDbStorageService } from '../../infrastructure/storage/IndexedDbStorageService';
import { useBackend } from '../BackendContext';

interface SetlistSidebarProps {
  songs: Song[];
  currentSongIndex: number;
  isPlaying: boolean;
  currentUser?: User | null;
  onSelectSong: (index: number) => void;
  onRemoveSong: (index: number) => void;
  onMoveSong: (fromIndex: number, toIndex: number) => void;
  onRestoreDefaultSetlist: () => void;
  onImportCustomSong: (song: Song) => void;
  onImportFullSetlist?: (songs: Song[]) => void;
}

export const SetlistSidebar: React.FC<SetlistSidebarProps> = ({
  songs,
  currentSongIndex,
  isPlaying,
  currentUser,
  onSelectSong,
  onRemoveSong,
  onMoveSong,
  onRestoreDefaultSetlist,
  onImportCustomSong,
  onImportFullSetlist
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const { deviceCache } = useBackend();
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipProgressText, setZipProgressText] = useState<string>('');
  const keySlotRef = useRef<KeyAnalysisSlot>(new KeyAnalysisSlot());
  const pendingImportsRef = useRef(0);
  useEffect(() => {
    const slot = keySlotRef.current;
    return () => slot.cancelAll();
  }, []);

  /** Música já conhecida neste aparelho (mesmo id estável): a confirmação manual do tom prevalece. */
  const knownKeyOf = async (songId: string): Promise<SongKeyInfo | null> => {
    try {
      const known = (await deviceCache.loadCustomSongs(currentUser?.churchId || 'lagoinha-jp')).find((s) => s.id === songId);
      return known ? known.keyInfo : null;
    } catch {
      return null;
    }
  };

  /** Análise de tom em segundo plano, com porcentagem de progresso do trabalho (não de certeza) e cancelamento. */
  const analyzeStemKey = async (pairs: { stem: TrackStem; blob: Blob }[]): Promise<SongKeyInfo> => {
    // Uma execução por importação: Cancelar aborta todas as enfileiradas
    const run = keySlotRef.current.begin(false);
    try {
      return await analyzeKeyFromStems(
        pairs.map((p) => ({ type: p.stem.type, blob: p.blob })),
        {
          signal: run.signal,
          onProgress: (p) => setZipProgressText(`Identificando o tom pelo áudio... ${Math.round(p.fraction * 100)}%`)
        }
      );
    } catch (err) {
      if (isAbortError(err)) return UNKNOWN_KEY;
      throw err;
    } finally {
      run.release();
    }
  };
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const buildStandardSections = (prefix: string, duration: number, bpm: number): SongSection[] => {
    const barSec = (60 / bpm) * 4;
    const totalBars = Math.max(16, Math.round(duration / barSec));
    const introEnd = Math.max(4, Math.min(Math.round(duration * 0.1), 20));
    const v1End = Math.max(introEnd + 4, Math.min(Math.round(duration * 0.28), 60));
    const ref1End = Math.max(v1End + 4, Math.min(Math.round(duration * 0.5), 110));
    const ponteEnd = Math.max(ref1End + 4, Math.min(Math.round(duration * 0.78), 180));
    const finalEnd = Math.max(ponteEnd + 4, Math.round(duration));

    return [
      new SongSection({ id: `${prefix}-intro`, name: 'Intro', type: 'intro', startBar: 1, barCount: 8, startTime: 0, endTime: introEnd }),
      new SongSection({ id: `${prefix}-v1`, name: 'Verso', type: 'verse', startBar: 9, barCount: 16, startTime: introEnd, endTime: v1End }),
      new SongSection({ id: `${prefix}-ref`, name: 'Refrão', type: 'chorus', startBar: 25, barCount: 16, startTime: v1End, endTime: ref1End }),
      new SongSection({ id: `${prefix}-ponte`, name: 'Ponte / Instrumental', type: 'bridge', startBar: 41, barCount: 16, startTime: ref1End, endTime: ponteEnd }),
      new SongSection({ id: `${prefix}-final`, name: 'Refrão Final / Outro', type: 'outro', startBar: 57, barCount: Math.max(8, totalBars - 56), startTime: ponteEnd, endTime: finalEnd })
    ];
  };

  const processImportedFiles = async (fileArray: File[]) => {
    if (fileArray.length === 0) return;

    const zipFile = fileArray.find(
      (f) =>
        f.name.toLowerCase().endsWith('.zip') ||
        f.type === 'application/zip' ||
        f.type === 'application/x-zip-compressed'
    );

    // Caso 1: Pacote Multitrack completo em .ZIP
    if (zipFile) {
      pendingImportsRef.current++;
      setIsExtractingZip(true);
      setZipProgressText('Lendo pacote .ZIP...');
      const songId = stableImportId('zip', [{ name: zipFile.name, size: zipFile.size }]);
      try {
        const meta = ZipMultitrackExtractor.parseMetadataFromZipName(zipFile.name);
        const entries = await ZipMultitrackExtractor.extractFromZipBlob(
          zipFile,
          (current, total, currentFilename) => {
            setZipProgressText(`Extraindo ${current}/${total}: ${currentFilename}`);
          }
        );

        let detectedDuration = 0;
        const stemBlobPairs = entries.map((entry, idx) => {
          if (entry.durationSeconds && entry.durationSeconds > detectedDuration) {
            detectedDuration = entry.durationSeconds;
          }
          const info = TrackStem.classifyStemFromFilename(entry.filename);
          const stem = new TrackStem({
            id: stableStemId(songId, idx),
            name: info.displayName,
            type: info.type,
            volume: info.type === 'click' ? 0.85 : info.type === 'guide' ? 0.95 : 1.0,
            pan: info.defaultPan,
            isMuted: false,
            isSolo: false,
            isPitchShiftable: info.isPitchShiftable,
            audioUrl: URL.createObjectURL(entry.blob)
          });
          return { stem, blob: entry.blob };
        });

        const orderRank: Record<TrackStem['type'], number> = {
          click: 1,
          guide: 2,
          drums: 3,
          loop: 4,
          bass: 5,
          violao: 6,
          guitars: 7,
          strings: 8,
          keys: 9,
          pad: 10,
          vocals: 11,
          fx: 12
        };
        stemBlobPairs.sort((a, b) => orderRank[a.stem.type] - orderRank[b.stem.type]);
        const stems = stemBlobPairs.map((p) => p.stem);

        VstPluginRackService.applySmartAutoFixAll(stems);

        const duration = detectedDuration > 10 ? detectedDuration : 247;
        // Nome sem tom: analisa o áudio (Worker, uma música por vez). Inconclusivo = sem tom, nunca um tom padrão.
        const keyInfo = await resolveImportKey(
          await knownKeyOf(songId),
          meta.keyFromName ? keyFromName(meta.originalKey) : null,
          () => analyzeStemKey(stemBlobPairs)
        );
        const newSong = new Song({
          id: songId,
          title: meta.title,
          artist: `${meta.artist} (ZIP ${stems.length} Stems)`,
          originalKey: keyInfo.value,
          keyInfo,
          currentKey: keyInfo.value,
          bpm: meta.bpm,
          timeSignature: { beats: 4, value: 4 },
          duration,
          sections: buildStandardSections(songId, duration, meta.bpm),
          stems,
          churchId: currentUser?.churchId || 'lagoinha-jp'
        });

        // Salva no IndexedDB para persistência offline permanente (metadados + blobs de áudio pareados)
        await deviceCache.saveCustomSong(newSong);
        for (const pair of stemBlobPairs) {
          await deviceCache.saveStemAudioBlob(songId, pair.stem.id, pair.blob);
        }

        onImportCustomSong(newSong);
      } catch (err) {
        console.error('Erro ao extrair pacote Multitrack .ZIP:', err);
      } finally {
        pendingImportsRef.current = Math.max(0, pendingImportsRef.current - 1);
        if (pendingImportsRef.current === 0) {
          setIsExtractingZip(false);
          setZipProgressText('');
        }
      }
      return;
    }

    // Caso 2: Arquivos de áudio WAV/MP3/OGG/FLAC/M4A soltos
    let detectedDuration = 0;
    for (const file of fileArray) {
      if (file.name.toLowerCase().endsWith('.wav') && file.size > 44) {
        try {
          const headerBuf = await file.slice(0, 256).arrayBuffer();
          const secs = ZipMultitrackExtractor.parseWavDurationFromHeader(headerBuf, file.size);
          if (secs && secs > detectedDuration) {
            detectedDuration = secs;
          }
        } catch {
          // Ignora falha de leitura
        }
      }
    }

    const sortedFiles = [...fileArray].sort((a, b) => a.name.localeCompare(b.name) || a.size - b.size);
    const songId = stableImportId('stems', sortedFiles.map((x) => ({ name: x.name, size: x.size })));
    const stemBlobPairs = sortedFiles.map((file, idx) => {
      const info = TrackStem.classifyStemFromFilename(file.name);
      const stem = new TrackStem({
        id: stableStemId(songId, idx),
        name: info.displayName,
        type: info.type,
        volume: info.type === 'click' ? 0.85 : info.type === 'guide' ? 0.95 : 1.0,
        pan: info.defaultPan,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: info.isPitchShiftable,
        audioUrl: URL.createObjectURL(file)
      });
      return { stem, blob: file };
    });

    const orderRank: Record<TrackStem['type'], number> = {
      click: 1,
      guide: 2,
      drums: 3,
      loop: 4,
      bass: 5,
      violao: 6,
      guitars: 7,
      strings: 8,
      keys: 9,
      pad: 10,
      vocals: 11,
      fx: 12
    };
    stemBlobPairs.sort((a, b) => orderRank[a.stem.type] - orderRank[b.stem.type]);
    const stems = stemBlobPairs.map((p) => p.stem);

    VstPluginRackService.applySmartAutoFixAll(stems);

    const duration = detectedDuration > 10 ? detectedDuration : 240;
    // Stems soltos não têm nome de pacote: tom pelo áudio; inconclusivo fica sem tom
    const keyInfo = await resolveImportKey(await knownKeyOf(songId), null, () => analyzeStemKey(stemBlobPairs));
    const newSong = new Song({
      id: songId,
      title: 'Multitrack Importada (Stems Locais)',
      artist: 'Lagoinha Worship',
      originalKey: keyInfo.value,
      keyInfo,
      currentKey: keyInfo.value,
      bpm: 120,
      timeSignature: { beats: 4, value: 4 },
      duration,
      sections: buildStandardSections(songId, duration, 120),
      stems,
      churchId: currentUser?.churchId || 'lagoinha-jp'
    });

    await deviceCache.saveCustomSong(newSong);
    for (const pair of stemBlobPairs) {
      await deviceCache.saveStemAudioBlob(songId, pair.stem.id, pair.blob);
    }
    onImportCustomSong(newSong);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processImportedFiles(Array.from(files));
    e.target.value = '';
  };

  const handleJsonSetlistUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const importedSongs = IndexedDbStorageService.importSetlistFromJson(text);
      if (importedSongs.length > 0) {
        if (onImportFullSetlist) {
          onImportFullSetlist(importedSongs);
        } else {
          importedSongs.forEach((s) => onImportCustomSong(s));
        }
      }
    } catch (err) {
      console.warn('Erro ao importar setlist JSON:', err);
    }
    e.target.value = '';
  };

  const handleExportSetlist = () => {
    const json = IndexedDbStorageService.exportSetlistToJson(songs, 'Culto de Celebração');
    IndexedDbStorageService.downloadJsonFile(json, `setlist-lagoinha-${Date.now()}.json`);
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      await processImportedFiles(files);
    }
  };

  return (
    <aside
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => void handleDrop(e)}
      className={`w-full lg:w-72 xl:w-80 bg-stage-surface border-b lg:border-b-0 lg:border-r flex flex-col justify-between shrink-0 lg:h-full transition-colors ${
        isDraggingOver ? 'border-amber-400 bg-amber-500/5' : 'border-stage-border'
      }`}
    >
      {/* Topo do Repertório */}
      <div className="p-4 border-b border-stage-border">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-slate-100 font-bold text-sm uppercase tracking-wide">
            <ListMusic className="w-4 h-4 text-blue-400" />
            <span>Repertório do Culto</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full">
              {songs.length} {songs.length === 1 ? 'Música' : 'Músicas'}
            </span>
            <button
              type="button"
              onClick={onRestoreDefaultSetlist}
              className="p-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-blue-500/50 text-slate-400 hover:text-white transition"
              title="Restaurar repertório padrão do culto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-stage-muted mt-1">
          <Calendar className="w-3.5 h-3.5" />
          <span>Culto de Celebração • Lagoinha JP</span>
        </div>
      </div>

      {/* Lista de Músicas do Setlist com Opção de Excluir e Reordenar */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {songs.length === 0 ? (
          <div className="p-5 rounded-2xl border border-dashed border-slate-800 text-center space-y-2">
            <p className="text-xs text-slate-400 font-semibold">
              Nenhuma música ativa no repertório.
            </p>
            <button
              type="button"
              onClick={onRestoreDefaultSetlist}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Repertório</span>
            </button>
          </div>
        ) : (
          songs.map((song, idx) => {
            const isSelected = currentSongIndex === idx;

            return (
              <div
                key={song.id}
                onClick={() => onSelectSong(idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSong(idx);
                  }
                }}
                className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer group ${
                  isSelected
                    ? 'bg-blue-600/20 border-blue-500/80 shadow-lg shadow-blue-500/10'
                    : 'bg-stage-card border-stage-border hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-mono font-bold text-stage-muted">
                    #{idx + 1}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-black text-stage-amber bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 rounded">
                      Tom {song.currentKey}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">
                      {song.bpm} BPM
                    </span>

                    {/* Botões de Subir / Descer na Ordem do Culto */}
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveSong(idx, idx - 1);
                      }}
                      className="p-1 rounded bg-slate-900/90 border border-slate-700/80 text-slate-400 hover:text-white disabled:opacity-30"
                      title="Subir música na ordem do culto"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === songs.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveSong(idx, idx + 1);
                      }}
                      className="p-1 rounded bg-slate-900/90 border border-slate-700/80 text-slate-400 hover:text-white disabled:opacity-30"
                      title="Descer música na ordem do culto"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>

                    {/* Botão Excluir do Repertório do Culto */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSong(idx);
                      }}
                      aria-label={`Excluir ${song.title} do repertório`}
                      title={`Excluir "${song.title}" do repertório do culto`}
                      className="p-1 rounded bg-rose-950/60 border border-rose-500/30 text-rose-400 hover:bg-rose-600 hover:text-white transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="font-bold text-sm text-slate-100 truncate flex items-center gap-2">
                  {isSelected && isPlaying ? (
                    <Play className="w-3.5 h-3.5 text-emerald-400 fill-current shrink-0 animate-pulse" />
                  ) : (
                    <Music className="w-3.5 h-3.5 text-stage-muted shrink-0" />
                  )}
                  <span className="truncate">{song.title}</span>
                </div>

                <div className="flex items-center justify-between text-xs text-stage-muted mt-0.5">
                  <span className="truncate">{song.artist}</span>
                  <span className="text-[10px] font-mono text-slate-300 shrink-0">
                    {song.stems.length} stems
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Painel Inferior: Importação de Multitracks (.ZIP / WAV) + Backup JSON */}
      <div className="p-3 border-t border-stage-border bg-stage-card/40 space-y-2">
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept=".zip,application/zip,application/x-zip-compressed,audio/*,.wav,.mp3,.ogg,.flac,.m4a"
          className="hidden"
          onChange={(e) => void handleFileUpload(e)}
        />
        <input
          type="file"
          ref={jsonFileInputRef}
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void handleJsonSetlistUpload(e)}
        />

        <button
          type="button"
          disabled={isExtractingZip}
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 px-3 rounded-xl border border-dashed border-amber-500/50 hover:border-amber-400 bg-stage-surface text-amber-300 hover:text-white text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition disabled:opacity-50"
          title="Suba ou arraste um arquivo .ZIP de Multitrack (ex: O Nosso General 140Bpm - B.zip) ou vários arquivos .WAV/.MP3"
        >
          {isExtractingZip ? (
            <span className="font-mono text-[11px] text-amber-300 truncate max-w-full">
              {zipProgressText || 'Extraindo pacote Multitrack .ZIP...'}
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <FolderArchive className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Importar Track (.ZIP / WAV / MP3)</span>
            </div>
          )}
          <span className="text-[9px] font-mono text-slate-400">
            Arraste ou clique para selecionar
          </span>
        </button>

        {isExtractingZip && zipProgressText.startsWith('Identificando') && (
          <button
            type="button"
            onClick={() => keySlotRef.current.abortAnalyses()}
            className="w-full min-h-[44px] rounded-xl border border-slate-600 text-slate-200 text-xs font-bold"
          >
            Cancelar análise do tom (importa sem tom)
          </button>
        )}

        {/* Barra de Backup do Setlist (JSON) */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <button
            type="button"
            onClick={handleExportSetlist}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-blue-400 text-slate-300 hover:text-white text-[10px] font-bold flex items-center justify-center gap-1 transition"
            title="Exportar repertório atual em arquivo .json"
          >
            <Download className="w-3 h-3 text-blue-400" />
            <span>Exportar JSON</span>
          </button>

          <button
            type="button"
            onClick={() => jsonFileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-emerald-400 text-slate-300 hover:text-white text-[10px] font-bold flex items-center justify-center gap-1 transition"
            title="Importar repertório a partir de arquivo .json"
          >
            <Upload className="w-3 h-3 text-emerald-400" />
            <span>Importar JSON</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
