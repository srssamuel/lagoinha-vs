import { useEffect } from 'react';
import { AudioEnginePort } from '../../application/ports/AudioEnginePort';
import { SectionNavigationService } from '../../application/services/SectionNavigationService';
import { Song } from '../../domain/entities/Song';
import { WebMidiHardwareService } from '../../infrastructure/midi/WebMidiHardwareService';
import { useLatest } from './useLatest';

interface StageControlsOptions {
  engine: AudioEnginePort;
  midiService: WebMidiHardwareService;
  currentSong: Song | null;
  /** Atalhos de teclado só valem com operador autenticado. */
  keyboardEnabled: boolean;
  onNextSong: () => void;
  onPrevSong: () => void;
  onToggleHelp: () => void;
}

const togglePlayback = (engine: AudioEnginePort) => {
  if (engine.getState().isPlaying) engine.pause();
  else engine.play();
};

const queueSection = (engine: AudioEnginePort, sectionId: string | undefined) => {
  if (sectionId) engine.queueSectionJump(sectionId);
};

/**
 * Pedaleira USB MIDI e teclado de palco. Os listeners são registrados uma vez;
 * cada evento lê o estado atual do motor e a música atual via ref, em vez de
 * re-registrar a cada mudança de seção ou de play/pause.
 */
export function useStageControls(options: StageControlsOptions): void {
  const latest = useLatest(options);
  const { engine, midiService, keyboardEnabled } = options;

  useEffect(() => {
    void midiService.init();

    const activeSectionId = () => engine.getState().activeSectionId;
    const unbinds = [
      midiService.registerActionHandler('play-pause', () => togglePlayback(engine)),
      midiService.registerActionHandler('next-song', () => latest.current.onNextSong()),
      midiService.registerActionHandler('prev-song', () => latest.current.onPrevSong()),
      midiService.registerActionHandler('next-sec', () => {
        const song = latest.current.currentSong;
        if (song) queueSection(engine, SectionNavigationService.next(song, activeSectionId())?.id);
      }),
      midiService.registerActionHandler('prev-sec', () => {
        const song = latest.current.currentSong;
        if (song) queueSection(engine, SectionNavigationService.previous(song, activeSectionId())?.id);
      }),
      midiService.registerActionHandler('loop-sec', () => engine.toggleSectionLoop()),
      midiService.registerActionHandler('solo-click', () => engine.toggleSoloClick()),
      midiService.registerActionHandler('panic', () => engine.panic())
    ];

    return () => unbinds.forEach((unbind) => unbind());
  }, [midiService, engine, latest]);

  useEffect(() => {
    if (!keyboardEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const { currentSong, onNextSong, onPrevSong, onToggleHelp } = latest.current;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayback(engine);
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        engine.toggleSectionLoop();
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        engine.toggleSoloClick();
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        onNextSong();
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        onPrevSong();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        engine.panic();
      } else if (e.key === '?' || e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        onToggleHelp();
      } else if (e.code.startsWith('Digit') && currentSong) {
        const num = parseInt(e.code.replace('Digit', ''), 10);
        queueSection(engine, SectionNavigationService.byShortcutNumber(currentSong, num)?.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardEnabled, engine, latest]);
}
