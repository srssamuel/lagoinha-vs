import { describe, it, expect } from 'vitest';
import { TrackStem } from '../../../src/domain/entities/TrackStem';

describe('TrackStem — String Instruments & Gain Boost (+6dB)', () => {
  it('identifies string instruments (violao, guitars, bass, strings) for group separation', () => {
    const violao = new TrackStem({
      id: 'st-violao',
      name: 'Violão Aço',
      type: 'violao',
      volume: 1.0,
      pan: -0.2,
      isMuted: false,
      isSolo: false
    });
    const guitarra = new TrackStem({
      id: 'st-gtr',
      name: 'Guitarra Drive',
      type: 'guitars',
      volume: 1.0,
      pan: 0.2,
      isMuted: false,
      isSolo: false
    });
    const baixo = new TrackStem({
      id: 'st-bass',
      name: 'Baixo',
      type: 'bass',
      volume: 1.0,
      pan: 0,
      isMuted: false,
      isSolo: false
    });
    const bateria = new TrackStem({
      id: 'st-drums',
      name: 'Bateria',
      type: 'drums',
      volume: 1.0,
      pan: 0,
      isMuted: false,
      isSolo: false
    });

    expect(violao.isStringInstrument()).toBe(true);
    expect(guitarra.isStringInstrument()).toBe(true);
    expect(baixo.isStringInstrument()).toBe(true);
    expect(bateria.isStringInstrument()).toBe(false);
  });

  it('allows boosting volume above 1.0 up to 2.0 (+6dB) and stepping/resetting volume', () => {
    const gtr = new TrackStem({
      id: 'st-gtr',
      name: 'Guitarra Lead',
      type: 'guitars',
      volume: 1.0,
      pan: 0,
      isMuted: false,
      isSolo: false
    });

    gtr.setVolume(1.5);
    expect(gtr.volume).toBe(1.5);

    gtr.stepVolume(0.25);
    expect(gtr.volume).toBe(1.75);

    // Clamps at 2.0 (+6dB max boost)
    gtr.setVolume(3.0);
    expect(gtr.volume).toBe(2.0);

    // Reset back to unity gain (1.0 = 0.0 dB)
    gtr.resetVolume();
    expect(gtr.volume).toBe(1.0);
  });
});
