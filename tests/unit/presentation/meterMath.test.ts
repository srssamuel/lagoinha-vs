import { describe, it, expect } from 'vitest';
import {
  formatDb,
  formatPan,
  formatSemitones,
  stemMeterPercents,
  masterPeakPercent,
  masterPeakColor
} from '../../../src/presentation/components/mixer/meterMath';

describe('meterMath — medidores e rótulos do console', () => {
  it('formata dB a partir do ganho linear', () => {
    expect(formatDb(0)).toBe('-∞ dB');
    expect(formatDb(1)).toBe('0.0 dB');
    expect(formatDb(2)).toBe('+6.0 dB');
  });

  it('formata pan e semitons', () => {
    expect(formatPan(0)).toBe('C');
    expect(formatPan(0.45)).toBe('R45');
    expect(formatPan(-0.45, 'Centro')).toBe('L45');
    expect(formatSemitones(2)).toBe('+2st');
    expect(formatSemitones(-1, true)).toBe('-1 st');
  });

  it('VU do canal zera quando inativo e atenua o lado oposto ao pan', () => {
    expect(stemMeterPercents(0.8, 1, 0, false)).toEqual({ left: 0, right: 0 });
    expect(stemMeterPercents(0.8, 1, 0, true)).toEqual({ left: 80, right: 80 });
    expect(stemMeterPercents(0.8, 1, 0.5, true)).toEqual({ left: 60, right: 80 });
    expect(stemMeterPercents(0.8, 1, -0.5, true)).toEqual({ left: 80, right: 60 });
  });

  it('VU do canal estima pelo fader enquanto o stem não tem nível medido', () => {
    expect(stemMeterPercents(undefined, 1, 0, true)).toEqual({ left: 65, right: 65 });
  });

  it('pico do Master satura em 100% e muda de cor perto do clip', () => {
    expect(masterPeakPercent(0.6)).toBe(50);
    expect(masterPeakPercent(1.5)).toBe(100);
    expect(masterPeakColor(0.5, 'L')).toBe('#38bdf8');
    expect(masterPeakColor(0.5, 'R')).toBe('#34d399');
    expect(masterPeakColor(0.9, 'R')).toBe('#f59e0b');
    expect(masterPeakColor(1.1, 'L')).toBe('#f43f5e');
  });
});
