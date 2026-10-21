/** Cálculos puros dos medidores e rótulos do console (sem DOM, testáveis). */

export const formatDb = (volume: number): string => {
  if (volume <= 0.001) return '-∞ dB';
  const db = 20 * Math.log10(volume);
  const sign = db > 0.05 ? '+' : '';
  return `${sign}${db.toFixed(1)} dB`;
};

export const formatPan = (pan: number, centerLabel = 'C'): string => {
  if (pan === 0) return centerLabel;
  return pan > 0 ? `R${Math.round(pan * 100)}` : `L${Math.round(Math.abs(pan) * 100)}`;
};

export const formatSemitones = (semitones: number, spaced = false): string => {
  const unit = spaced ? ' st' : 'st';
  return semitones > 0 ? `+${semitones}${unit}` : `${semitones}${unit}`;
};

/**
 * VU estéreo de um canal: o lado oposto ao pan cai para 75%.
 * Sem nível medido (stem ainda decodificando), estima pelo volume do fader.
 */
export const stemMeterPercents = (
  measuredLevel: number | undefined,
  volume: number,
  pan: number,
  isActive: boolean
): { left: number; right: number } => {
  if (!isActive) return { left: 0, right: 0 };
  const level = measuredLevel ?? Math.min(1, volume * 0.65);
  return {
    left: Math.min(100, Math.round(level * (pan <= 0 ? 100 : 75))),
    right: Math.min(100, Math.round(level * (pan >= 0 ? 100 : 75)))
  };
};

/** Pico do Master: escala até 1.2 (headroom visual acima de 0 dBFS). */
export const masterPeakPercent = (peak: number): number => Math.min(100, Math.round((peak / 1.2) * 100));

export const masterPeakColor = (peak: number, side: 'L' | 'R'): string => {
  if (peak > 1.0) return '#f43f5e';
  if (peak > 0.85) return '#f59e0b';
  return side === 'L' ? '#38bdf8' : '#34d399';
};
