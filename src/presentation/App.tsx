import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { WebAudioEngine } from '../infrastructure/audio/WebAudioEngine';
import { PolyphonicAmbientPad } from '../infrastructure/audio/PolyphonicAmbientPad';
import { Song } from '../domain/entities/Song';
import { User } from '../domain/entities/User';
import { useBackend } from './BackendContext';
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
import {
  AdminUsersModal,
  CifraProModal,
  CloudVSLibraryModal,
  HelpGuideModal,
  VstPluginRackModal,
  useHasOpened,
  usePrefetchLazyModals
} from './lazyModals';
import { PendingApprovalModal } from './components/PendingApprovalModal';
import { RouteHealthBanner } from './components/RouteHealthBanner';
import { PwaStatus } from './components/PwaStatus';
import { EnsaioMixService, EnsaioMixMode } from '../domain/services/EnsaioMixService';
import { VstPluginRackService } from '../domain/services/VstPluginRackService';
import { StemType, StemDspConfig } from '../domain/entities/TrackStem';
import { WebMidiHardwareService } from '../infrastructure/midi/WebMidiHardwareService';
import { useAudioEngineState } from './hooks/useAudioEngineState';
import { useSetlist } from './hooks/useSetlist';
import { useAmbientPad } from './hooks/useAmbientPad';
import { useStageControls } from './hooks/useStageControls';

export const App: React.FC = () => {
  // Serviços de Autenticação e Áudio
  const backend = useBackend();
  const authService = backend.accounts;
  const audioEngine = useMemo(() => new WebAudioEngine(), []);
  const padEngine = useMemo(() => new PolyphonicAmbientPad(), []);
  const midiService = useMemo(() => WebMidiHardwareService.getInstance(), []);

  // Estado de Usuário Autenticado
  const [currentUser, setCurrentUser] = useState<User | null>(() => authService.getCurrentUser());

  // Estado de transporte do motor (medidores vão direto ao DOM via meterSource)
  const engineState = useAudioEngineState(audioEngine);

  // Repertório do Culto e Pad Contínuo
  const setlist = useSetlist(currentUser?.churchId, backend.deviceCache);
  const { songs, currentIndex: currentSongIndex } = setlist.state;
  const currentSong = setlist.currentSong;
  const pad = useAmbientPad(padEngine);

  // Modais de Palco
  const [isRoutingModalOpen, setIsRoutingModalOpen] = useState<boolean>(false);
  const [isMidiModalOpen, setIsMidiModalOpen] = useState<boolean>(false);
  const [isCloudLibraryOpen, setIsCloudLibraryOpen] = useState<boolean>(false);
  const [isCifraModalOpen, setIsCifraModalOpen] = useState<boolean>(false);
  const [isVstRackOpen, setIsVstRackOpen] = useState<boolean>(false);
  const [isHelpGuideOpen, setIsHelpGuideOpen] = useState<boolean>(false);
  const [isAdminUsersModalOpen, setIsAdminUsersModalOpen] = useState<boolean>(false);
  const [pendingUsersCount, setPendingUsersCount] = useState<number>(0);
  const [selectedVstStemId, setSelectedVstStemId] = useState<string | null>(null);

  // Modais pesados: carregados sob demanda e pré-baixados em ocioso (abrem offline no culto)
  usePrefetchLazyModals();
  const cloudLibraryOpened = useHasOpened(isCloudLibraryOpen);
  const cifraOpened = useHasOpened(isCifraModalOpen);
  const vstRackOpened = useHasOpened(isVstRackOpen);
  const helpOpened = useHasOpened(isHelpGuideOpen);
  const adminUsersOpened = useHasOpened(isAdminUsersModalOpen);

  const refreshPendingCount = useCallback(async () => {
    if (currentUser?.isAdmin || currentUser?.canApproveUsers) {
      const pending = await authService.listPendingUsers();
      setPendingUsersCount(pending.length);
    } else {
      setPendingUsersCount(0);
    }
  }, [authService, currentUser]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  // Inscrição no estado de autenticação
  useEffect(() => authService.onAuthStateChanged(setCurrentUser), [authService]);

  // Carrega a música selecionada no motor
  useEffect(() => {
    if (currentSong) {
      void audioEngine.loadSong(currentSong);
    }
  }, [currentSong, audioEngine]);

  // Navegação de Músicas com Pad Crossfade Automático
  const { select: selectSongIndex } = setlist;
  const { followSong } = pad;
  const handleSelectSong = useCallback(
    (index: number) => {
      const target = songs[index];
      if (!target) return;
      audioEngine.stop();
      selectSongIndex(index);
      followSong(target);
    },
    [songs, audioEngine, selectSongIndex, followSong]
  );

  const handleNextSong = useCallback(() => handleSelectSong(currentSongIndex + 1), [handleSelectSong, currentSongIndex]);
  const handlePrevSong = useCallback(() => handleSelectSong(currentSongIndex - 1), [handleSelectSong, currentSongIndex]);

  // Pedaleiras USB MIDI e Teclas de Atalho de Palco
  useStageControls({
    engine: audioEngine,
    midiService,
    currentSong,
    keyboardEnabled: currentUser !== null,
    onNextSong: handleNextSong,
    onPrevSong: handlePrevSong,
    onToggleHelp: () => setIsHelpGuideOpen((prev) => !prev)
  });

  // Edições no lugar do Song/TrackStem: aplica no motor e sinaliza re-render
  const { touch } = setlist;
  const withCurrentSong = (fn: (song: Song) => void) => () => {
    if (!currentSong) return;
    fn(currentSong);
    touch();
  };

  const handleBpmChange = (newBpm: number) =>
    withCurrentSong((song) => {
      song.bpm = newBpm;
    })();

  // Transposição de Tom em Tempo Real (Pitchproof Constant-Tempo — protege Bateria/Loops/Click/Guia)
  const handlePitchShiftChange = (semitones: number) => {
    audioEngine.setPitchShift(semitones);
    touch();
  };

  const handleTogglePitchLock = (stemId: string) =>
    withCurrentSong((song) => {
      const target = song.stems.find((s) => s.id === stemId);
      if (!target) return;
      target.isPitchShiftable = !target.isPitchShiftable;
      audioEngine.setPitchShift(song.pitchShiftSemitones);
    })();

  // EnsaioMix® (Mix Aumentada / Mix Diminuta)
  const handleApplyEnsaioMix = (instrument: StemType, mode: EnsaioMixMode) =>
    withCurrentSong((song) => {
      EnsaioMixService.applyEnsaioMix(song.stems, instrument, mode);
      for (const stem of song.stems) {
        audioEngine.setStemVolume(stem.id, stem.volume);
      }
    })();

  // VST Channel Strip & Smart Auto-Fix DSP
  const handleOpenVstRack = (stemId?: string) => {
    setSelectedVstStemId(stemId || null);
    setIsVstRackOpen(true);
  };

  const handleUpdateStemDsp = (stemId: string, partial: Partial<StemDspConfig>) =>
    withCurrentSong((song) => {
      song.stems.find((s) => s.id === stemId)?.setDsp(partial);
      audioEngine.refreshDspChain();
    })();

  const handleAutoFixAllStems = withCurrentSong((song) => {
    VstPluginRackService.applySmartAutoFixAll(song.stems);
    audioEngine.refreshDspChain();
  });

  const handleResetAllDsp = withCurrentSong((song) => {
    VstPluginRackService.resetAllDsp(song.stems);
    audioEngine.refreshDspChain();
  });

  // Mixer: o motor muta o TrackStem; touch() redesenha faders e botões
  const mixerCommand =
    <A extends unknown[]>(command: (...args: A) => void) =>
    (...args: A) => {
      command(...args);
      touch();
    };

  const handleVolumeChange = mixerCommand((stemId: string, vol: number) => audioEngine.setStemVolume(stemId, vol));
  const handlePanChange = mixerCommand((stemId: string, pan: number) => audioEngine.setStemPan(stemId, pan));
  const handleToggleMute = mixerCommand((stemId: string) => audioEngine.toggleStemMute(stemId));
  const handleToggleSolo = mixerCommand((stemId: string) => audioEngine.toggleStemSolo(stemId));
  const handleResetMixer = mixerCommand(() => audioEngine.resetMixer());
  const handleClearAllSolos = mixerCommand(() => audioEngine.clearAllSolos());

  // Gerenciamento do Repertório (Excluir, Reordenar, Restaurar, Importar)
  const handleRemoveSong = (index: number) => {
    audioEngine.stop();
    setlist.remove(index);
  };

  const handleRestoreDefaultSetlist = () => {
    audioEngine.stop();
    setlist.restoreDefaults();
  };

  const handleImportFullSetlist = (importedSongs: Song[]) => {
    audioEngine.stop();
    setlist.replaceAll(importedSongs);
  };

  // Se o usuário não estiver autenticado, exibe a tela de login
  if (!currentUser) {
    return <AuthGate authService={authService} onAuthenticated={setCurrentUser} />;
  }

  // Se o cadastro estiver pendente de aprovação pela liderança
  if (currentUser.isPending) {
    return (
      <PendingApprovalModal
        user={currentUser}
        authService={authService}
        onRefreshApproval={() => setCurrentUser(authService.getCurrentUser())}
        onSignOut={() => {
          void authService.signOut();
          setCurrentUser(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen lg:h-screen w-full max-w-full bg-[#0c0c0e] text-slate-100 overflow-x-hidden lg:overflow-hidden font-sans">
      {/* Alerta de Segurança de Rota de Áudio de Palco (ENG-02) */}
      <RouteHealthBanner
        routeHealth={engineState.routeHealth}
        routeLossReason={engineState.routeLossReason}
        onOpenRouting={() => setIsRoutingModalOpen(true)}
        onConfirmRecovery={() => void audioEngine.confirmRouteRecovery()}
      />

      <PwaStatus live={engineState.isPlaying || pad.isActive} songs={songs} />

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
        onOpenHelpGuide={() => setIsHelpGuideOpen(true)}
        onOpenAdminModal={() => setIsAdminUsersModalOpen(true)}
        pendingUsersCount={pendingUsersCount}
        onSignOut={() => void authService.signOut()}
      />

      {/* Barra de Transporte com Métricas de Andamento, Pré-Roll e Pedaleira */}
      <TransportBar
        isPlaying={engineState.isPlaying}
        isLoopingSection={engineState.isLoopingSection}
        isSoloClickActive={engineState.isSoloClickActive}
        isLoopClickActive={engineState.isLoopClickActive}
        countInBars={engineState.countInBars}
        isCountingIn={engineState.isCountingIn}
        countInBeat={engineState.countInBeat}
        onChangeCountInBars={(bars) => audioEngine.setCountInBars(bars)}
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
          currentUser={currentUser}
          onSelectSong={handleSelectSong}
          onRemoveSong={handleRemoveSong}
          onMoveSong={setlist.move}
          onRestoreDefaultSetlist={handleRestoreDefaultSetlist}
          onImportCustomSong={setlist.add}
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

          {/* Mixer de Multitracks com Faders de Palco, Master Bus RTA, Pitch Lock, EnsaioMix, Rack VST e VU Meters */}
          {currentSong && (
            <MultitrackMixer
              stems={currentSong.stems}
              routingMode={engineState.routingMode}
              isPlaying={engineState.isPlaying}
              isSoloClickActive={engineState.isSoloClickActive}
              meterSource={audioEngine}
              originalKey={currentSong.originalKey}
              currentKey={currentSong.currentKey}
              pitchShiftSemitones={currentSong.pitchShiftSemitones}
              masterVolume={engineState.masterVolume}
              onVolumeChange={handleVolumeChange}
              onPanChange={handlePanChange}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
              onClearAllSolos={handleClearAllSolos}
              onMasterVolumeChange={(vol) => audioEngine.setMasterVolume(vol)}
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

      {/* Barra Inferior: Pad Contínuo para Oração / Transição de Músicas com Auto-Follow */}
      <AmbientPadBar
        currentPadKey={pad.currentKey}
        isPadActive={pad.isActive}
        padVolume={pad.volume}
        isAutoFollowEnabled={pad.isAutoFollow}
        onSelectKey={pad.selectKey}
        onTogglePad={() => pad.toggle(currentSong)}
        onToggleAutoFollow={pad.toggleAutoFollow}
        onPadVolumeChange={pad.setVolume}
      />

      {/* Modal de Configuração de Roteamento (4CH Discreto / IEM / PA Split) */}
      <RoutingModal
        isOpen={isRoutingModalOpen}
        routingMode={engineState.routingMode}
        audioHardwareChannels={engineState.audioHardwareChannels}
        availableDevices={engineState.availableAudioDevices}
        selectedDeviceId={engineState.selectedAudioDeviceId}
        routeHealth={engineState.routeHealth}
        routeLossReason={engineState.routeLossReason}
        onConfirmRouteRecovery={() => {
          void audioEngine.confirmRouteRecovery();
        }}
        onSelectMode={(mode) => {
          audioEngine.setRoutingMode(mode);
          setIsRoutingModalOpen(false);
        }}
        onSelectDevice={(deviceId) => {
          void audioEngine.setAudioOutputDevice(deviceId);
        }}
        onRequestDevicePermissions={() => {
          void audioEngine.requestDevicePermissions();
        }}
        onTestChannelTone={(channelIndex) => {
          audioEngine.testChannelTone(channelIndex);
        }}
        onClose={() => setIsRoutingModalOpen(false)}
      />

      {/* Modal de Mapeamento MIDI e Pedaleiras USB */}
      <MidiModal isOpen={isMidiModalOpen} onClose={() => setIsMidiModalOpen(false)} />

      <Suspense fallback={null}>
        {/* Modal do Banco de VS na Nuvem */}
        {cloudLibraryOpened && (
          <CloudVSLibraryModal
            isOpen={isCloudLibraryOpen}
            canUpload={currentUser.canUploadVS}
            churchId={currentUser.churchId}
            onClose={() => setIsCloudLibraryOpen(false)}
            onAddSongToSetlist={setlist.add}
            uid={currentUser.uid}
            canEditSetlist={currentUser.canEditSetlist}
            currentSongs={songs}
            onReplaceSetlist={handleImportFullSetlist}
          />
        )}

        {/* Modal Cifra Pro® & Mapa Dinâmico Sincronizado */}
        {cifraOpened && (
          <CifraProModal
            isOpen={isCifraModalOpen}
            song={currentSong}
            activeSectionId={engineState.activeSectionId}
            onClose={() => setIsCifraModalOpen(false)}
            onSelectSection={(secId) => audioEngine.queueSectionJump(secId)}
            onPitchShiftChange={handlePitchShiftChange}
          />
        )}

        {/* Modal Rack de Plugins VST & Channel Strip DSP */}
        {currentSong && vstRackOpened && (
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

        {/* Modal Didático de Operação no Culto (Manual de Palco) */}
        {helpOpened && <HelpGuideModal isOpen={isHelpGuideOpen} onClose={() => setIsHelpGuideOpen(false)} />}

        {/* Modal de Gestão de Usuários, Aprovações e Convites (Admin / Líder) */}
        {adminUsersOpened && (
          <AdminUsersModal
            isOpen={isAdminUsersModalOpen}
            currentUser={currentUser}
            authService={authService}
            onClose={() => setIsAdminUsersModalOpen(false)}
            onUsersUpdated={() => void refreshPendingCount()}
          />
        )}
      </Suspense>
    </div>
  );
};
