import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { WebAudioEngine } from '../infrastructure/audio/WebAudioEngine';
import { PolyphonicAmbientPad, MusicalKey } from '../infrastructure/audio/PolyphonicAmbientPad';
import { DemoWorshipSongs } from '../infrastructure/mock/DemoWorshipSongs';
import { Song } from '../domain/entities/Song';
import { User } from '../domain/entities/User';
import { FirebaseAuthService } from '../infrastructure/auth/FirebaseAuthService';
import { StageHeader } from './components/StageHeader';
import { TransportBar } from './components/TransportBar';
import { WaveformDisplay } from './components/WaveformDisplay';
import { SectionTimeline } from './components/SectionTimeline';
import { MultitrackMixer } from './components/MultitrackMixer';
import { SetlistSidebar } from './components/SetlistSidebar';
import { AmbientPadBar } from './components/AmbientPadBar';
import { RoutingModal } from './components/RoutingModal';
import { MidiModal } from './components/MidiModal';
import { AuthGate } from './components/AuthGate';
import { CloudVSLibraryModal } from './components/CloudVSLibraryModal';
import { CifraProModal } from './components/CifraProModal';
import { VstPluginRackModal } from './components/VstPluginRackModal';
import { EnsaioMixService, EnsaioMixMode } from '../domain/services/EnsaioMixService';
import { VstPluginRackService } from '../domain/services/VstPluginRackService';
import { StemType, StemDspConfig } from '../domain/entities/TrackStem';
import { WebMidiHardwareService } from '../infrastructure/midi/WebMidiHardwareService';
import { IndexedDbStorageService } from '../infrastructure/storage/IndexedDbStorageService';

export const App: React.FC = () => {
  // Serviços de Autenticação e Áudio
  const authService = useMemo(() => new FirebaseAuthService(), []);
  const audioEngine = useMemo(() => new WebAudioEngine(), []);
  const padEngine = useMemo(() => new PolyphonicAmbientPad(), []);
  const midiService = useMemo(() => WebMidiHardwareService.getInstance(), []);

  // Estado de Usuário Autenticado
  const [currentUser, setCurrentUser] = useState<User | null>(() => authService.getCurrentUser());

  // Repertório do Culto
  const [songs, setSongs] = useState<Song[]>(() => DemoWorshipSongs.getPresetSongs());
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(0);

  // Estado Reativo do Motor de Áudio
  const [engineState, setEngineState] = useState(() => audioEngine.getState());

  // Estado do Pad Contínuo
  const [isPadActive, setIsPadActive] = useState<boolean>(false);
  const [currentPadKey, setCurrentPadKey] = useState<MusicalKey | null>(null);
  const [padVolume, setPadVolume] = useState<number>(0.35);

  // Modais de Palco
  const [isRoutingModalOpen, setIsRoutingModalOpen] = useState<boolean>(false);
  const [isMidiModalOpen, setIsMidiModalOpen] = useState<boolean>(false);
  const [isCloudLibraryOpen, setIsCloudLibraryOpen] = useState<boolean>(false);
  const [isCifraModalOpen, setIsCifraModalOpen] = useState<boolean>(false);
  const [isVstRackOpen, setIsVstRackOpen] = useState<boolean>(false);
  const [selectedVstStemId, setSelectedVstStemId] = useState<string | null>(null);

  const currentSong = songs[currentSongIndex] ?? null;

  // Carrega músicas customizadas salvas previamente no IndexedDB
  useEffect(() => {
    void IndexedDbStorageService.loadCustomSongs().then((saved) => {
      if (saved.length > 0) {
        setSongs((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          const toAdd = saved.filter((s) => !existingIds.has(s.id));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }
    });
  }, []);

  // Inscrição no estado de autenticação
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, [authService]);

  // Carrega a música selecionada no motor
  useEffect(() => {
    if (currentSong) {
      void audioEngine.loadSong(currentSong);
    }
  }, [currentSong, audioEngine]);

  // Observer de Telemetria do Motor
  useEffect(() => {
    const unsubscribe = audioEngine.subscribe((state) => {
      setEngineState(state);
    });
    return () => unsubscribe();
  }, [audioEngine]);

  // Inicializa o contexto do Pad no primeiro gesto do usuário
  useEffect(() => {
    const handleGesture = () => {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      padEngine.init(ctx);
      window.removeEventListener('click', handleGesture);
    };
    window.addEventListener('click', handleGesture, { once: true });
  }, [padEngine]);

  // Navegação de Músicas
  const handleSelectSong = (index: number) => {
    if (index >= 0 && index < songs.length) {
      audioEngine.stop();
      setCurrentSongIndex(index);
    }
  };

  const handleNextSong = useCallback(() => {
    if (currentSongIndex < songs.length - 1) {
      handleSelectSong(currentSongIndex + 1);
    }
  }, [currentSongIndex, songs.length]);

  const handlePrevSong = useCallback(() => {
    if (currentSongIndex > 0) {
      handleSelectSong(currentSongIndex - 1);
    }
  }, [currentSongIndex]);

  // Integração com Pedaleiras e Controladores USB MIDI Reais
  useEffect(() => {
    void midiService.init();

    const unbindPlay = midiService.registerActionHandler('play-pause', () => {
      if (audioEngine.getState().isPlaying) {
        audioEngine.pause();
      } else {
        audioEngine.play();
      }
    });

    const unbindNextSong = midiService.registerActionHandler('next-song', handleNextSong);
    const unbindPrevSong = midiService.registerActionHandler('prev-song', handlePrevSong);

    const unbindNextSec = midiService.registerActionHandler('next-sec', () => {
      if (!currentSong) return;
      const activeId = engineState.activeSectionId;
      const currentIdx = currentSong.sections.findIndex((s) => s.id === activeId);
      const nextSec = currentSong.sections[currentIdx + 1];
      if (nextSec) {
        audioEngine.queueSectionJump(nextSec.id);
      }
    });

    const unbindPrevSec = midiService.registerActionHandler('prev-sec', () => {
      if (!currentSong) return;
      const activeId = engineState.activeSectionId;
      const currentIdx = currentSong.sections.findIndex((s) => s.id === activeId);
      const prevSec = currentSong.sections[Math.max(0, currentIdx - 1)];
      if (prevSec) {
        audioEngine.queueSectionJump(prevSec.id);
      }
    });

    const unbindLoop = midiService.registerActionHandler('loop-sec', () => {
      audioEngine.toggleSectionLoop();
    });

    const unbindSoloClick = midiService.registerActionHandler('solo-click', () => {
      audioEngine.toggleSoloClick();
    });

    const unbindPanic = midiService.registerActionHandler('panic', () => {
      audioEngine.panic();
    });

    return () => {
      unbindPlay();
      unbindNextSong();
      unbindPrevSong();
      unbindNextSec();
      unbindPrevSec();
      unbindLoop();
      unbindSoloClick();
      unbindPanic();
    };
  }, [midiService, audioEngine, currentSong, engineState.activeSectionId, handleNextSong, handlePrevSong]);

  // Teclas de Atalho de Palco
  useEffect(() => {
    if (!currentUser) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (engineState.isPlaying) {
          audioEngine.pause();
        } else {
          audioEngine.play();
        }
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        audioEngine.toggleSectionLoop();
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        audioEngine.toggleSoloClick();
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        handleNextSong();
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        handlePrevSong();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        audioEngine.panic();
      } else if (e.code.startsWith('Digit') && currentSong) {
        const num = parseInt(e.code.replace('Digit', ''), 10);
        if (num >= 1 && num <= currentSong.sections.length) {
          const target = currentSong.sections[num - 1];
          if (target) {
            audioEngine.queueSectionJump(target.id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentUser, engineState.isPlaying, audioEngine, currentSong, handleNextSong, handlePrevSong]);

  // BPM direct change
  const handleBpmChange = (newBpm: number) => {
    if (currentSong) {
      currentSong.bpm = newBpm;
      setSongs([...songs]);
    }
  };

  // Transposição de Tom em Tempo Real (Pitchproof Constant-Tempo Pitch Shift — Protege Bateria/Loops/Click/Guia)
  const handlePitchShiftChange = (semitones: number) => {
    audioEngine.setPitchShift(semitones);
    setSongs([...songs]);
  };

  // Alternar Pitch Lock de um canal específico
  const handleTogglePitchLock = (stemId: string) => {
    if (!currentSong) return;
    const target = currentSong.stems.find((s) => s.id === stemId);
    if (target) {
      target.isPitchShiftable = !target.isPitchShiftable;
      audioEngine.setPitchShift(currentSong.pitchShiftSemitones);
      setSongs([...songs]);
    }
  };

  // EnsaioMix® (RehearsalMix MultiTracks.com.br: Mix Aumentada / Mix Diminuta)
  const handleApplyEnsaioMix = (instrument: StemType, mode: EnsaioMixMode) => {
    if (!currentSong) return;
    EnsaioMixService.applyEnsaioMix(currentSong.stems, instrument, mode);
    for (const stem of currentSong.stems) {
      audioEngine.setStemVolume(stem.id, stem.volume);
    }
    setSongs([...songs]);
  };

  // VST Channel Strip & Smart Auto-Fix DSP (Plugin Boutique Engine)
  const handleOpenVstRack = (stemId?: string) => {
    setSelectedVstStemId(stemId || null);
    setIsVstRackOpen(true);
  };

  const handleUpdateStemDsp = (stemId: string, partial: Partial<StemDspConfig>) => {
    if (!currentSong) return;
    const target = currentSong.stems.find((s) => s.id === stemId);
    if (target) {
      target.setDsp(partial);
      audioEngine.refreshDspChain();
      setSongs([...songs]);
    }
  };

  const handleAutoFixAllStems = () => {
    if (!currentSong) return;
    VstPluginRackService.applySmartAutoFixAll(currentSong.stems);
    audioEngine.refreshDspChain();
    setSongs([...songs]);
  };

  const handleResetAllDsp = () => {
    if (!currentSong) return;
    VstPluginRackService.resetAllDsp(currentSong.stems);
    audioEngine.refreshDspChain();
    setSongs([...songs]);
  };

  // Mixer Callbacks
  const handleVolumeChange = (stemId: string, vol: number) => {
    audioEngine.setStemVolume(stemId, vol);
    setSongs([...songs]);
  };

  const handlePanChange = (stemId: string, pan: number) => {
    audioEngine.setStemPan(stemId, pan);
    setSongs([...songs]);
  };

  const handleToggleMute = (stemId: string) => {
    audioEngine.toggleStemMute(stemId);
    setSongs([...songs]);
  };

  const handleToggleSolo = (stemId: string) => {
    audioEngine.toggleStemSolo(stemId);
    setSongs([...songs]);
  };

  const handleResetMixer = () => {
    audioEngine.resetMixer();
    setSongs([...songs]);
  };

  // Gerenciamento do Repertório do Culto (Excluir, Reordenar e Restaurar)
  const handleRemoveSong = (index: number) => {
    if (index < 0 || index >= songs.length) return;
    audioEngine.stop();
    const targetSong = songs[index];
    if (targetSong) {
      void IndexedDbStorageService.deleteCustomSong(targetSong.id);
    }
    const nextSongs = songs.filter((_, i) => i !== index);
    setSongs(nextSongs);
    if (nextSongs.length === 0) {
      setCurrentSongIndex(0);
    } else if (currentSongIndex >= nextSongs.length) {
      setCurrentSongIndex(nextSongs.length - 1);
    } else if (index < currentSongIndex) {
      setCurrentSongIndex(Math.max(0, currentSongIndex - 1));
    }
  };

  const handleMoveSong = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex < 0 ||
      fromIndex >= songs.length ||
      toIndex < 0 ||
      toIndex >= songs.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const activeId = currentSong?.id;
    const nextSongs = [...songs];
    const [moved] = nextSongs.splice(fromIndex, 1);
    if (moved) {
      nextSongs.splice(toIndex, 0, moved);
    }
    setSongs(nextSongs);
    if (activeId) {
      const updatedIdx = nextSongs.findIndex((s) => s.id === activeId);
      if (updatedIdx !== -1) {
        setCurrentSongIndex(updatedIdx);
      }
    }
  };

  const handleRestoreDefaultSetlist = () => {
    audioEngine.stop();
    setSongs(DemoWorshipSongs.getPresetSongs());
    setCurrentSongIndex(0);
  };

  // Pad Handlers
  const handleSelectPadKey = (key: MusicalKey) => {
    setCurrentPadKey(key);
    padEngine.play(key, padVolume);
    setIsPadActive(true);
  };

  const handleTogglePad = () => {
    if (isPadActive) {
      padEngine.stop(1.5);
      setIsPadActive(false);
    } else {
      const keyToPlay = currentPadKey || (currentSong?.currentKey as MusicalKey) || 'B';
      setCurrentPadKey(keyToPlay);
      padEngine.play(keyToPlay, padVolume);
      setIsPadActive(true);
    }
  };

  const handlePadVolumeChange = (vol: number) => {
    setPadVolume(vol);
    if (isPadActive && currentPadKey) {
      padEngine.play(currentPadKey, vol);
    }
  };

  // Importar música local (.ZIP ou WAV/MP3)
  const handleImportCustomSong = (newSong: Song) => {
    setSongs((prev) => [...prev, newSong]);
    setCurrentSongIndex(songs.length);
  };

  // Importar setlist completo via JSON
  const handleImportFullSetlist = (importedSongs: Song[]) => {
    audioEngine.stop();
    setSongs(importedSongs);
    setCurrentSongIndex(0);
  };

  // Adicionar música do Banco de VS na Nuvem
  const handleAddCloudSong = (cloudSong: Song) => {
    setSongs((prev) => [...prev, cloudSong]);
    setCurrentSongIndex(songs.length);
  };

  // Se o usuário não estiver autenticado, exibe a tela de login
  if (!currentUser) {
    return <AuthGate authService={authService} onAuthenticated={setCurrentUser} />;
  }

  return (
    <div className="flex flex-col min-h-screen lg:h-screen w-full max-w-full bg-[#0c0c0e] text-slate-100 overflow-x-hidden lg:overflow-hidden font-sans">
      {/* Topo / Header da Estação com Álbuns, BPM, Tom / Pitch Shift, Cifra Pro, Plugins VST e Banco de VS */}
      <StageHeader
        songs={songs}
        currentSongIndex={currentSongIndex}
        currentSong={currentSong}
        currentBeat={engineState.currentBeat}
        currentBar={engineState.currentBar}
        isPlaying={engineState.isPlaying}
        routingMode={engineState.routingMode}
        masterVolume={engineState.masterVolume}
        currentUser={currentUser}
        onSelectSongIndex={handleSelectSong}
        onBpmChange={handleBpmChange}
        onPitchShiftChange={handlePitchShiftChange}
        onMasterVolumeChange={(vol) => audioEngine.setMasterVolume(vol)}
        onOpenRoutingModal={() => setIsRoutingModalOpen(true)}
        onOpenCloudLibrary={() => setIsCloudLibraryOpen(true)}
        onOpenCifraModal={() => setIsCifraModalOpen(true)}
        onOpenVstRack={() => handleOpenVstRack()}
        onSignOut={() => void authService.signOut()}
      />

      {/* Barra de Transporte (Play, Pause, Solo Click, Loop, MIDI) */}
      <TransportBar
        isPlaying={engineState.isPlaying}
        isLoopingSection={engineState.isLoopingSection}
        isSoloClickActive={engineState.isSoloClickActive}
        isLoopClickActive={engineState.isLoopClickActive}
        onPlay={() => audioEngine.play()}
        onPause={() => audioEngine.pause()}
        onStop={() => audioEngine.stop()}
        onPrevSong={handlePrevSong}
        onNextSong={handleNextSong}
        onToggleLoop={() => audioEngine.toggleSectionLoop()}
        onToggleSoloClick={() => audioEngine.toggleSoloClick()}
        onToggleLoopClick={() => audioEngine.toggleLoopClick()}
        onOpenMidiModal={() => setIsMidiModalOpen(true)}
        onPanic={() => audioEngine.panic()}
        onTapTempo={handleBpmChange}
      />

      {/* Área Central: Setlist à Esquerda + Timeline & Mixer no Centro */}
      <div className="flex flex-col-reverse lg:flex-row flex-1 min-w-0 lg:overflow-hidden">
        {/* Sidebar com o Repertório do Culto e Backup JSON */}
        <SetlistSidebar
          songs={songs}
          currentSongIndex={currentSongIndex}
          isPlaying={engineState.isPlaying}
          onSelectSong={handleSelectSong}
          onRemoveSong={handleRemoveSong}
          onMoveSong={handleMoveSong}
          onRestoreDefaultSetlist={handleRestoreDefaultSetlist}
          onImportCustomSong={handleImportCustomSong}
          onImportFullSetlist={handleImportFullSetlist}
        />

        {/* Console Principal */}
        <main className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
          {/* Waveform com Picos Reais de Áudio e Tooltip Interativo */}
          <WaveformDisplay
            currentSong={currentSong}
            currentTime={engineState.currentTime}
            duration={engineState.duration}
            activeSectionId={engineState.activeSectionId}
            queuedSectionId={engineState.queuedSectionId}
            onSeek={(secs) => audioEngine.seek(secs)}
            onSelectSection={(secId) => audioEngine.queueSectionJump(secId)}
          />

          {/* Timeline de Seções da Música com Pulos Quantizados */}
          <SectionTimeline
            currentSong={currentSong}
            currentTime={engineState.currentTime}
            duration={engineState.duration}
            activeSectionId={engineState.activeSectionId}
            queuedSectionId={engineState.queuedSectionId}
            onSelectSection={(secId) => audioEngine.queueSectionJump(secId)}
            onSeek={(secs) => audioEngine.seek(secs)}
          />

          {/* Mixer de Multitracks com Faders de Palco, Mudança de Tom c/ Pitch Lock, EnsaioMix, Rack VST e VU Meters Estéreo */}
          {currentSong && (
            <MultitrackMixer
              stems={currentSong.stems}
              routingMode={engineState.routingMode}
              isPlaying={engineState.isPlaying}
              isSoloClickActive={engineState.isSoloClickActive}
              stemLevels={engineState.stemLevels}
              originalKey={currentSong.originalKey}
              currentKey={currentSong.currentKey}
              pitchShiftSemitones={currentSong.pitchShiftSemitones}
              onVolumeChange={handleVolumeChange}
              onPanChange={handlePanChange}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
              onResetMixer={handleResetMixer}
              onPitchShiftChange={handlePitchShiftChange}
              onTogglePitchLock={handleTogglePitchLock}
              onApplyEnsaioMix={handleApplyEnsaioMix}
              onOpenVstRack={handleOpenVstRack}
              onAutoFixAllStems={handleAutoFixAllStems}
            />
          )}
        </main>
      </div>

      {/* Barra Inferior: Pad Contínuo para Oração / Transição de Músicas */}
      <AmbientPadBar
        currentPadKey={currentPadKey}
        isPadActive={isPadActive}
        padVolume={padVolume}
        onSelectKey={handleSelectPadKey}
        onTogglePad={handleTogglePad}
        onPadVolumeChange={handlePadVolumeChange}
      />

      {/* Modal de Configuração de Roteamento (IEM/PA Split) */}
      <RoutingModal
        isOpen={isRoutingModalOpen}
        routingMode={engineState.routingMode}
        onSelectMode={(mode) => {
          audioEngine.setRoutingMode(mode);
          setIsRoutingModalOpen(false);
        }}
        onClose={() => setIsRoutingModalOpen(false)}
      />

      {/* Modal de Mapeamento MIDI e Pedaleiras USB */}
      <MidiModal
        isOpen={isMidiModalOpen}
        onClose={() => setIsMidiModalOpen(false)}
      />

      {/* Modal do Banco de VS na Nuvem (Google Cloud) */}
      <CloudVSLibraryModal
        isOpen={isCloudLibraryOpen}
        canUpload={currentUser.canUploadVS}
        onClose={() => setIsCloudLibraryOpen(false)}
        onAddSongToSetlist={handleAddCloudSong}
      />

      {/* Modal Cifra Pro® & Mapa Dinâmico Sincronizado (ChartBuilder MultiTracks.com.br) */}
      <CifraProModal
        isOpen={isCifraModalOpen}
        song={currentSong}
        activeSectionId={engineState.activeSectionId}
        onClose={() => setIsCifraModalOpen(false)}
        onSelectSection={(secId) => audioEngine.queueSectionJump(secId)}
        onPitchShiftChange={handlePitchShiftChange}
      />

      {/* Modal Rack de Plugins VST & Channel Strip DSP (Plugin Boutique Free FX Engine) */}
      {currentSong && (
        <VstPluginRackModal
          isOpen={isVstRackOpen}
          stems={currentSong.stems}
          initialSelectedStemId={selectedVstStemId}
          onClose={() => setIsVstRackOpen(false)}
          onUpdateStemDsp={handleUpdateStemDsp}
          onAutoFixAllStems={handleAutoFixAllStems}
          onResetAllDsp={handleResetAllDsp}
        />
      )}
    </div>
  );
};
