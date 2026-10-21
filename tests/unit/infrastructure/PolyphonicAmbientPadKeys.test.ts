import { describe, it, expect, vi } from 'vitest';
import { PolyphonicAmbientPad, toPadKey } from '../../../src/infrastructure/audio/PolyphonicAmbientPad';

describe('Pad contínuo — tons bemol e menores', () => {
  it('converte enarmonias e tons menores na fundamental da tabela', () => {
    expect(toPadKey('Gb')).toBe('F#');
    expect(toPadKey('Db')).toBe('C#');
    expect(toPadKey('Eb')).toBe('D#');
    expect(toPadKey('Ab')).toBe('G#');
    expect(toPadKey('A#')).toBe('Bb');
    expect(toPadKey('Bbm')).toBe('Bb');
    expect(toPadKey('F#m')).toBe('F#');
    expect(toPadKey('Em')).toBe('E');
    expect(toPadKey('g')).toBe('G');
    expect(toPadKey('')).toBe('C');
  });

  it('tocar "Gb" agenda frequências finitas (antes: NaN e TypeError no setValueAtTime)', () => {
    const freqs: number[] = [];
    const param = () => ({
      setValueAtTime: vi.fn((v: number) => {
        if (!Number.isFinite(v)) throw new TypeError('non-finite');
      }),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
      value: 0
    });
    const ctx = {
      currentTime: 0,
      state: 'running',
      destination: {},
      createGain: () => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() }),
      createBiquadFilter: () => ({ type: '', frequency: param(), Q: param(), connect: vi.fn() }),
      createOscillator: () => {
        const frequency = param();
        frequency.setValueAtTime = vi.fn((v: number) => {
          freqs.push(v);
          if (!Number.isFinite(v)) throw new TypeError('non-finite');
        });
        return { type: '', frequency, detune: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() };
      }
    } as unknown as AudioContext;

    const pad = new PolyphonicAmbientPad(ctx);
    expect(() => pad.crossfadeTo('Gb' as never, 0.3)).not.toThrow();
    expect(pad.currentKey).toBe('F#');
    expect(freqs.length).toBeGreaterThan(0);
    expect(freqs.every(Number.isFinite)).toBe(true);
  });
});
