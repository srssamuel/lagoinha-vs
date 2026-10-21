import { useCallback, useEffect, useState } from 'react';
import { MusicalKey, PolyphonicAmbientPad } from '../../infrastructure/audio/PolyphonicAmbientPad';
import { Song } from '../../domain/entities/Song';

/** Tom do pad para uma música: fundamental sem o sufixo de menor ("Em" -> "E"). */
export const padKeyForSong = (song: Song): MusicalKey => (song.currentKey.replace('m', '') as MusicalKey) || 'C';

export interface AmbientPadController {
  isActive: boolean;
  currentKey: MusicalKey | null;
  volume: number;
  isAutoFollow: boolean;
  selectKey: (key: MusicalKey) => void;
  toggle: (fallbackSong: Song | null) => void;
  setVolume: (vol: number) => void;
  toggleAutoFollow: () => void;
  /** Crossfade para o tom da próxima música (só com pad ativo e auto-follow ligado). */
  followSong: (song: Song) => void;
}

/** Pad contínuo para orações e transições, com crossfade sem cortes entre tons. */
export function useAmbientPad(padEngine: PolyphonicAmbientPad): AmbientPadController {
  const [isActive, setIsActive] = useState(false);
  const [currentKey, setCurrentKey] = useState<MusicalKey | null>(null);
  const [volume, setVolumeState] = useState(0.35);
  const [isAutoFollow, setIsAutoFollow] = useState(true);

  // O AudioContext do pad só pode nascer depois de um gesto do usuário (política de autoplay).
  useEffect(() => {
    const handleGesture = () => {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      padEngine.init(new AudioCtx());
    };
    window.addEventListener('click', handleGesture, { once: true });
    return () => window.removeEventListener('click', handleGesture);
  }, [padEngine]);

  const selectKey = useCallback(
    (key: MusicalKey) => {
      setCurrentKey(key);
      padEngine.play(key, volume);
      setIsActive(true);
    },
    [padEngine, volume]
  );

  const toggle = useCallback(
    (fallbackSong: Song | null) => {
      if (isActive) {
        padEngine.stop(1.5);
        setIsActive(false);
        return;
      }
      const keyToPlay = currentKey || (fallbackSong?.currentKey as MusicalKey) || 'B';
      setCurrentKey(keyToPlay);
      padEngine.play(keyToPlay, volume);
      setIsActive(true);
    },
    [padEngine, isActive, currentKey, volume]
  );

  const setVolume = useCallback(
    (vol: number) => {
      setVolumeState(vol);
      if (isActive && currentKey) padEngine.play(currentKey, vol);
    },
    [padEngine, isActive, currentKey]
  );

  const followSong = useCallback(
    (song: Song) => {
      if (!isAutoFollow || !isActive) return;
      const key = padKeyForSong(song);
      padEngine.crossfadeTo(key, volume);
      setCurrentKey(key);
    },
    [padEngine, isAutoFollow, isActive, volume]
  );

  return {
    isActive,
    currentKey,
    volume,
    isAutoFollow,
    selectKey,
    toggle,
    setVolume,
    toggleAutoFollow: useCallback(() => setIsAutoFollow((prev) => !prev), []),
    followSong
  };
}
