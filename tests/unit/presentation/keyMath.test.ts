import { describe, it, expect } from 'vitest';
import { isMinorKey, pitchClass } from '../../../src/presentation/components/mixer/keyMath';

describe('keyMath (seletor Mudar Tom)', () => {
  it('casa enarmonias e ignora o sufixo de menor', () => {
    expect(pitchClass('Gb')).toBe(pitchClass('F#'));
    expect(pitchClass('Em')).toBe(pitchClass('E'));
    expect(pitchClass('Bbm')).toBe(10);
    expect(pitchClass('C')).toBe(0);
    expect(pitchClass('Cb')).toBe(11);
    expect(pitchClass('')).toBeNull();
  });

  it('reconhece tom menor', () => {
    expect(isMinorKey('Em')).toBe(true);
    expect(isMinorKey('F#m')).toBe(true);
    expect(isMinorKey('Bb')).toBe(false);
    expect(isMinorKey('B')).toBe(false);
    expect(isMinorKey('Cmaj7')).toBe(false);
  });
});
