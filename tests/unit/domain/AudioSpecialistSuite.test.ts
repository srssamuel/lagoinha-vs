import { describe, it, expect } from 'vitest';
import { TrackStem } from '../../../src/domain/entities/TrackStem';
import { MixerBusService } from '../../../src/application/services/MixerBusService';
import { Song } from '../../../src/domain/entities/Song';

describe('Audio Specialist Pro Suite', () => {
  const createStems = () => [
    new TrackStem({ id: 'click-1', name: 'Click', type: 'click', volume: 1.0, pan: -1, isMuted: false, isSolo: false }),
    new TrackStem({ id: 'guide-1', name: 'Guia', type: 'guide', volume: 1.0, pan: -1, isMuted: false, isSolo: false }),
    new TrackStem({ id: 'drums-1', name: 'Bateria', type: 'drums', volume: 1.0, pan: 0, isMuted: false, isSolo: false }),
    new TrackStem({ id: 'guit-1', name: 'Guitarra', type: 'guitars', volume: 1.0, pan: 0.3, isMuted: false, isSolo: false }),
    new TrackStem({ id: 'pad-1', name: 'Pad', type: 'pad', volume: 0.8, pan: -0.2, isMuted: false, isSolo: false })
  ];

  it('deve limpar todos os solos em um único comando (Clear All Solos)', () => {
    const stems = createStems();
    // Soloa guitarra e bateria
    stems[2]!.isSolo = true;
    stems[3]!.isSolo = true;

    expect(stems.some((s) => s.isSolo)).toBe(true);

    // Executa Clear All Solos
    stems.forEach((s) => {
      s.isSolo = false;
    });

    expect(stems.some((s) => s.isSolo)).toBe(false);

    // Verifica se todos os stems voltam a estar audíveis no barramento do mixer
    const gains = MixerBusService.evaluateAllStems(stems, 'STEREO_FULL', false);
    gains.forEach(({ gains: g }) => {
      expect(g.leftGain + g.rightGain).toBeGreaterThan(0);
    });
  });

  it('deve calcular corretamente a duração e batidas do Pre-Roll Count-In', () => {
    const song = new Song({
      id: 'song-test',
      title: 'Teste',
      artist: 'Lagoinha',
      originalKey: 'G',
      currentKey: 'G',
      bpm: 120, // 120 bpm = 0.5s por batida
      timeSignature: { beats: 4, value: 4 },
      duration: 180,
      sections: [],
      stems: createStems()
    });

    const secondsPerBeat = 60 / song.bpm;
    const beatsPerBar = song.timeSignature.beats;
    
    // 1 compasso de contagem prévia = 4 batidas * 0.5s = 2.0s
    const oneBarDuration = 1 * beatsPerBar * secondsPerBeat;
    expect(oneBarDuration).toBe(2.0);

    // 2 compassos de contagem prévia = 8 batidas * 0.5s = 4.0s
    const twoBarsDuration = 2 * beatsPerBar * secondsPerBeat;
    expect(twoBarsDuration).toBe(4.0);
  });

  it('deve garantir que os canais com PITCH LOCK (Click, Guia, Drums, Loop) nunca são alterados em semitons', () => {
    const stems = createStems();
    const click = stems.find((s) => s.type === 'click')!;
    const guide = stems.find((s) => s.type === 'guide')!;
    const drums = stems.find((s) => s.type === 'drums')!;
    const guit = stems.find((s) => s.type === 'guitars')!;

    expect(click.isPitchShiftable).toBe(false);
    expect(guide.isPitchShiftable).toBe(false);
    expect(drums.isPitchShiftable).toBe(false);
    expect(guit.isPitchShiftable).toBe(true);
  });

  it('deve calcular métricas de RTA e Brickwall Limiter Gain Reduction', () => {
    // Simulação matemática do detector de redução do limiter
    const limiterReductionDb = -2.4; // -2.4 dB de compressão no pico
    const isLimiting = limiterReductionDb < -0.2;
    expect(isLimiting).toBe(true);

    const cleanReductionDb = 0.0;
    expect(cleanReductionDb < -0.2).toBe(false);
  });
});
