import React, { useState, useEffect, useCallback } from "react";
import { CloudSong } from "../../domain/entities/CloudSong";
import {
  churchScope,
  GLOBAL_SCOPE,
  LibraryScope,
} from "../../application/ports/SongLibraryPort";
import { useBackend } from "../BackendContext";
import { Song } from "../../domain/entities/Song";
import { GoogleDriveConfig } from "../../domain/entities/GoogleDriveConfig";
import { X, Cloud, HardDrive, UploadCloud, Globe } from "lucide-react";
import { CatalogTab } from "./cloud-library/CatalogTab";
import {
  GoogleDriveTab,
  DriveSyncMessage,
} from "./cloud-library/GoogleDriveTab";
import {
  UploadVsTab,
  useVsUploadForm,
  VsUploadDraft,
} from "./cloud-library/UploadVsTab";
import { ExternalRepositoriesTab } from "./cloud-library/ExternalRepositoriesTab";

interface CloudVSLibraryModalProps {
  isOpen: boolean;
  canUpload: boolean;
  /** Igreja do usuário: a biblioteca dela aparece junto do catálogo e recebe os uploads. */
  churchId?: string;
  onClose: () => void;
  onAddSongToSetlist: (song: Song) => void;
}

type LibraryTab = "catalog" | "gdrive" | "upload" | "repositories";

const tabClass = (active: boolean, activeClass: string, idleClass: string) =>
  `flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${active ? activeClass : idleClass}`;

export const CloudVSLibraryModal: React.FC<CloudVSLibraryModalProps> = ({
  isOpen,
  canUpload,
  churchId,
  onClose,
  onAddSongToSetlist,
}) => {
  const { library, drive: driveService, kind } = useBackend();
  // Sem Drive na operação normal do banco online: o Drive só existe no migrador administrativo.
  const showDrive = kind === "local";
  const [busySongId, setBusySongId] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [songs, setSongs] = useState<CloudSong[]>([]);
  const [scopeBySongId, setScopeBySongId] = useState<Map<string, LibraryScope>>(
    new Map(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [activeTab, setActiveTab] = useState<LibraryTab>("catalog");
  const [addedSongIds, setAddedSongIds] = useState<Set<string>>(new Set());

  // Google Drive Central Storage State
  const [driveConfig, setDriveConfig] = useState<GoogleDriveConfig | null>(
    null,
  );
  const [driveFolderInput, setDriveFolderInput] = useState("");
  const [driveSongs, setDriveSongs] = useState<CloudSong[]>([]);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [driveSyncMessage, setDriveSyncMessage] =
    useState<DriveSyncMessage | null>(null);

  const uploadForm = useVsUploadForm();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Biblioteca da igreja primeiro, depois o catálogo global; cada música lembra de qual prateleira veio.
  const refreshSongs = useCallback(async () => {
    const shelves: LibraryScope[] = churchId
      ? [churchScope(churchId), GLOBAL_SCOPE]
      : [GLOBAL_SCOPE];
    // Uma prateleira fora do ar (ou sem permissão) não esconde a outra.
    const found = await Promise.all(
      shelves.map(async (scope) => {
        try {
          return (await library.search(scope, searchQuery, selectedKey)).map(
            (song) => ({ scope, song }),
          );
        } catch {
          return [];
        }
      }),
    );
    const entries = found.flat();
    setScopeBySongId(
      new Map(entries.map(({ scope, song }) => [song.id, scope])),
    );
    setSongs(entries.map(({ song }) => song));
  }, [churchId, library, searchQuery, selectedKey]);

  useEffect(() => {
    if (isOpen) void refreshSongs();
  }, [isOpen, refreshSongs]);

  // Carrega configuração salva do Google Drive
  useEffect(() => {
    if (!showDrive) return;
    void driveService.getConfig().then((cfg) => {
      if (cfg) {
        setDriveConfig(cfg);
        if (cfg.sharedUrl) setDriveFolderInput(cfg.sharedUrl);
      }
    });
  }, [driveService, showDrive]);

  const loadDriveSongs = useCallback(async () => {
    setIsSyncingDrive(true);
    setDriveSyncMessage(null);
    try {
      const list = await driveService.syncDriveFolder(driveFolderInput);
      setDriveSongs(list);
      setDriveSyncMessage({
        type: "success",
        text:
          driveFolderInput.trim().length > 0
            ? `Pasta conectada com sucesso! ${list.length} multitracks e PADs sincronizados do Google Drive.`
            : `Acervo padrão carregado (${list.length} faixas e PADs). Para conectar sua pasta da igreja, cole o link acima e clique em Sincronizar.`,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Link ou ID inválido";
      setDriveSyncMessage({
        type: "error",
        text: `Erro ao sincronizar: ${message}`,
      });
    } finally {
      setIsSyncingDrive(false);
    }
  }, [driveService, driveFolderInput]);

  useEffect(() => {
    if (
      showDrive &&
      isOpen &&
      activeTab === "gdrive" &&
      driveSongs.length === 0
    ) {
      void loadDriveSongs();
    }
  }, [showDrive, isOpen, activeTab, driveSongs.length, loadDriveSongs]);

  const handleSelectSong = async (cloudSong: CloudSong) => {
    const scope = scopeBySongId.get(cloudSong.id) ?? GLOBAL_SCOPE;
    setBusySongId(cloudSong.id);
    setLibraryError(null);
    try {
      const playbackSong = await library.toPlaybackSong(scope, cloudSong);
      onAddSongToSetlist(playbackSong);
      setAddedSongIds((prev) => new Set([...prev, cloudSong.id]));
    } catch (err: unknown) {
      setLibraryError(
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível carregar a música.",
      );
    } finally {
      setBusySongId(null);
    }
  };

  const handleUploadSubmit = async (draft: VsUploadDraft) => {
    setIsSubmitting(true);
    try {
      if (!churchId)
        throw new Error("Entre com uma conta de igreja para enviar VS.");
      const shelf = churchScope(churchId);
      // Upload vai para a biblioteca da igreja como origem não documentada (spec, seção 7).
      const created = await library.upload(
        shelf,
        {
          title: draft.title,
          artist: draft.artist || "Lagoinha Worship",
          originalKey: draft.originalKey,
          bpm: draft.bpm,
          duration: draft.duration,
          rightsClass: "unknown",
        },
        draft.files,
      );

      uploadForm.reset();
      setActiveTab("catalog");
      await refreshSongs();
      const playbackSong = await library.toPlaybackSong(shelf, created);
      onAddSongToSetlist(playbackSong);
      setAddedSongIds((prev) => new Set([...prev, created.id]));
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
                Catálogo com stems isolados (Click, Guia, Bateria, Loops, Baixo,
                Guitarras, Violão, Teclados, Pad e Vozes).
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

        {/* Abas: Catálogo na Nuvem | Google Drive Lagoinha | Subir Novo VS | Repositórios Reais de Multitracks */}
        <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("catalog")}
            className={tabClass(
              activeTab === "catalog",
              "bg-blue-600 text-white shadow-md shadow-blue-600/20",
              "bg-stage-card text-slate-400 hover:text-white",
            )}
          >
            Catálogo Geral ({songs.length} Músicas)
          </button>

          {showDrive && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("gdrive");
                if (driveSongs.length === 0) void loadDriveSongs();
              }}
              className={tabClass(
                activeTab === "gdrive",
                "bg-emerald-600 text-white shadow-md shadow-emerald-600/20 ring-1 ring-emerald-400/40",
                "bg-stage-card text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10",
              )}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>
                Google Drive Lagoinha (
                {driveSongs.length > 0 ? driveSongs.length : 3})
              </span>
            </button>
          )}

          {canUpload && (
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={tabClass(
                activeTab === "upload",
                "bg-blue-600 text-white shadow-md shadow-blue-600/20",
                "bg-stage-card text-slate-400 hover:text-white",
              )}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Subir Novo VS (ZIP / WAV / MP3)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("repositories")}
            className={tabClass(
              activeTab === "repositories",
              "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20",
              "bg-stage-card text-amber-300 border border-amber-500/30 hover:bg-amber-500/10",
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Repositórios Externos de Multitracks</span>
          </button>
        </div>

        {libraryError && (
          <p
            role="alert"
            className="mb-3 text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2"
          >
            {libraryError}
          </p>
        )}

        {showDrive && activeTab === "gdrive" && (
          <GoogleDriveTab
            config={driveConfig}
            folderInput={driveFolderInput}
            onFolderInputChange={setDriveFolderInput}
            isSyncing={isSyncingDrive}
            syncMessage={driveSyncMessage}
            songs={driveSongs}
            addedSongIds={addedSongIds}
            onSync={() => void loadDriveSongs()}
            onAddSong={(song) => void handleSelectSong(song)}
          />
        )}

        {activeTab === "catalog" && (
          <CatalogTab
            songs={songs}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            selectedKey={selectedKey}
            onSelectedKeyChange={setSelectedKey}
            addedSongIds={addedSongIds}
            busySongId={busySongId}
            onAddSong={(song) => void handleSelectSong(song)}
          />
        )}

        {activeTab === "upload" && canUpload && (
          <UploadVsTab
            form={uploadForm}
            isSubmitting={isSubmitting}
            onSubmit={(draft) => void handleUploadSubmit(draft)}
          />
        )}

        {activeTab === "repositories" && <ExternalRepositoriesTab />}
      </div>
    </div>
  );
};
