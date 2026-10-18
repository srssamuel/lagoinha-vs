import { describe, it, expect } from 'vitest';
import { ChordTransposer } from '../../../src/domain/services/ChordTransposer';
import { EnsaioMixService } from '../../../src/domain/services/EnsaioMixService';
import { DemoWorshipSongs } from '../../../src/infrastructure/mock/DemoWorshipSongs';

describe('MultiTracks.com.br Reverse-Engineered Features (Cifra Pro, Pitch Transpose, EnsaioMix)', () => {
  it('transposes musical keys and chord progressions accurately by semitones', () => {
    expect(ChordTransposer.transposeKey('G', 2)).toBe('A');
    expect(ChordTransposer.transposeKey('G', -1)).toBe('Gb');
    expect(ChordTransposer.transposeKey('Em', 2)).toBe('F#m');

    const line = 'G  D/F#  Em7  C9';
    expect(ChordTransposer.transposeChordLine(line, 2)).toBe('A  E/G#  F#m7  D9');
  });

  it('converts standard chords into Nashville Number System degrees (1, 4, 5, 6m)', () => {
    const nashville = ChordTransposer.toNashvilleLine('G  D  Em7  C9', 'G');
    expect(nashville).toBe('1  5  6m7  49');
  });

  it('applies EnsaioMix Aumentada (+Boost on target instrument, attenuated band) and Diminuta (Minus One mute)', () => {
    const song = DemoWorshipSongs.createACasaESua();

    // 1. Mix Aumentada para Violão (violao em 1.65 = +4.3dB, restante da banda reduzida para 0.55)
    EnsaioMixService.applyEnsaioMix(song.stems, 'violao', 'AUMENTADA');
    const violao = song.stems.find((s) => s.type === 'violao')!;
    const guitarra = song.stems.find((s) => s.type === 'guitars')!;
    expect(violao.isMuted).toBe(false);
    expect(violao.volume).toBeGreaterThan(1.4);
    expect(guitarra.volume).toBeLessThan(0.7);

    // 2. Mix Diminuta (Minus One) para Violão (violao mutado para o músico tocar por cima)
    EnsaioMixService.applyEnsaioMix(song.stems, 'violao', 'DIMINUTA');
    expect(violao.isMuted).toBe(true);
    expect(guitarra.isMuted).toBe(false);
    expect(guitarra.volume).toBe(1.0);
  });
});
