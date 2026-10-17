import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { WebAudioEngine } from '../infrastructure/audio/WebAudioEngine';
import { PolyphonicAmbientPad, MusicalKey } from '../infrastructure/audio/PolyphonicAmbientPad';
import { DemoWorshipSongs } from '../infrastructure/mock/DemoWorshipSongs';
import { Song } from '../domain/entities/Song';
import { StageHeader } from './components/StageHeader';
import { TransportBar } from './components/TransportBar';
import { SectionTimeline } from './components/SectionTimeline';
import { MultitrackMixer } from './components/MultitrackMixer';
import { SetlistSidebar } from './components/SetlistSidebar';
import { AmbientPadBar } from './components/AmbientPadBar';
import { RoutingModal } from './components/RoutingModal';

export const App: React.FC = () => {
  // Audio Engines
  const audioEngine = useMemo(() => new WebAudioEngine(), []);
  const padEngine = useMemo(() => new PolyphonicAmbientPad(), []);

  // Repertório
  const [songs, setSongs] = useState<Song[]>(() => DemoWorshipSongs.getPresetSongs());
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(0);

  // Estado Reativo do Motor
  const [engineState, setEngineState] = useState(() => audioEngine.getState());

  // Estado do Pad
  const [isPadActive, setIsPadActive] = useState<boolean>(false);
  const [currentPadKey, setCurrentPadKey] = useState<MusicalKey | null>(null);
  const [padVolume, setPadVolume] = useState<number>(0.35);

  // Modal de Roteamento
  const [isRoutingModalOpen, setIsRoutingModalOpen] = useState<boolean>(false);

  const currentSong = songs[currentSongIndex] ?? null;

  // Inicializa o som da música atual no motor
  useEffect(() => {
    if (currentSong) {
      void audioEngine.loadSong(currentSong);
    }
  }, [currentSong, audioEngine]);

  // Inscrição nas notificações de estado do motor de áudio
  useEffect(() => {
    const unsubscribe = audioEngine.subscribe((state) => {
      setEngineState(state);
    });
    return () => unsubscribe();
  }, [audioEngine]);

  // Carrega áudio context do pad
  useEffect(() => {
    const handleGesture = () => {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      padEngine.init(ctx);
      window.removeEventListener('click', handleGesture);
    };
    window.addEventListener('click', handleGesture, { once: true });
  }, [padEngine]);

  // Teclas de Atalho de Palco
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora se estiver digitando em input
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
  }, [engineState.isPlaying, audioEngine, currentSong]);

  // Navegação do Setlist
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

  // Mixer Callbacks
  const handleVolumeChange = (stemId: string, vol: number) => {
    audioEngine.setStemVolume(stemId, vol);
    // Força re-render
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
      const keyToPlay = currentPadKey || (currentSong?.currentKey as MusicalKey) || 'G';
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

  // Custom song import
  const handleImportCustomSong = (newSong: Song) => {
    setSongs((prev) => [...prev, newSong]);
    setCurrentSongIndex(songs.length);
  };

  return (
    <div className="flex flex-col h-screen bg-stage-bg text-slate-100 overflow-hidden font-sans">
      {/* Topo / Header da Estação */}
      <StageHeader
        currentSong={currentSong}
        currentBeat={engineState.currentBeat}
        currentBar={engineState.currentBar}
        isPlaying={engineState.isPlaying}
        routingMode={engineState.routingMode}
        masterVolume={engineState.masterVolume}
        onMasterVolumeChange={(vol) => audioEngine.setMasterVolume(vol)}
        onOpenRoutingModal={() => setIsRoutingModalOpen(true)}
      />

      {/* Barra de Transporte (Play, Pause, Stop, Pânico) */}
      <TransportBar
        isPlaying={engineState.isPlaying}
        isLoopingSection={engineState.isLoopingSection}
        onPlay={() => audioEngine.play()}
        onPause={() => audioEngine.pause()}
        onStop={() => audioEngine.stop()}
        onPrevSong={handlePrevSong}
        onNextSong={handleNextSong}
        onToggleLoop={() => audioEngine.toggleSectionLoop()}
        onPanic={() => audioEngine.panic()}
        onTapTempo={(newBpm) => {
          if (currentSong) {
            currentSong.bpm = newBpm;
            setSongs([...songs]);
          }
        }}
      />

      {/* Área Central: Setlist à Esquerda + Timeline e Mixer no Centro */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar com o Repertório do Culto */}
        <SetlistSidebar
          songs={songs}
          currentSongIndex={currentSongIndex}
          isPlaying={engineState.isPlaying}
          onSelectSong={handleSelectSong}
          onImportCustomSong={handleImportCustomSong}
        />

        {/* Console Principal */}
        <main className="flex-1 flex flex-col overflow-hidden">
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

          {/* Mixer de Multitracks com Faders de Palco */}
          {currentSong && (
            <MultitrackMixer
              stems={currentSong.stems}
              routingMode={engineState.routingMode}
              isPlaying={engineState.isPlaying}
              onVolumeChange={handleVolumeChange}
              onPanChange={handlePanChange}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
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

      {/* Modal de Configuração de Roteamento de Saída */}
      <RoutingModal
        isOpen={isRoutingModalOpen}
        routingMode={engineState.routingMode}
        onSelectMode={(mode) => {
          audioEngine.setRoutingMode(mode);
          setIsRoutingModalOpen(false);
        }}
        onClose={() => setIsRoutingModalOpen(false)}
      />
    </div>
  );
};
