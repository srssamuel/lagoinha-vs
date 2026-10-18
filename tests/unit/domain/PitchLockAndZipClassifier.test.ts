import { describe, it, expect } from 'vitest';
import { TrackStem } from '../../../src/domain/entities/TrackStem';
import { ZipMultitrackExtractor } from '../../../src/infrastructure/audio/ZipMultitrackExtractor';
import { PitchShifterDspNode } from '../../../src/infrastructure/audio/PitchShifterDspNode';
import { DemoWorshipSongs } from '../../../src/infrastructure/mock/DemoWorshipSongs';

describe('Pitch Lock Rules (Drums/Loops/Click/Guide) & Real ZIP Multitrack Classifier', () => {
  it('blocks pitch shifting on Drums, Loops, Click, and Guide while enabling it on harmonic stems', () => {
    const realZipFiles = [
      { file: 'CLICK_140__1.wav', expectedType: 'click', expectedPitchShiftable: false },
      { file: 'GUIA_1.wav', expectedType: 'guide', expectedPitchShiftable: false },
      { file: 'DRUM_1.wav', expectedType: 'drums', expectedPitchShiftable: false },
      { file: 'Keys Loop_1.wav', expectedType: 'loop', expectedPitchShiftable: false },
      { file: 'BASS_1.wav', expectedType: 'bass', expectedPitchShiftable: true },
      { file: 'EG 1_1.wav', expectedType: 'guitars', expectedPitchShiftable: true },
      { file: 'EG 2_1.wav', expectedType: 'guitars', expectedPitchShiftable: true },
      { file: 'EG 3_1.wav', expectedType: 'guitars', expectedPitchShiftable: true },
      { file: 'Keys EP_1.wav', expectedType: 'keys', expectedPitchShiftable: true },
      { file: 'Keys Orgao_1.wav', expectedType: 'keys', expectedPitchShiftable: true },
      { file: 'Keys PAD_1.wav', expectedType: 'pad', expectedPitchShiftable: true },
      { file: 'Keys Lead_1.wav', expectedType: 'keys', expectedPitchShiftable: true },
      { file: 'vocals_1.wav', expectedType: 'vocals', expectedPitchShiftable: true }
    ];

    for (const item of realZipFiles) {
      const classified = TrackStem.classifyStemFromFilename(item.file);
      expect(classified.type).toBe(item.expectedType);
      expect(classified.isPitchShiftable).toBe(item.expectedPitchShiftable);

      const stem = new TrackStem({
        id: item.file,
        name: classified.displayName,
        type: classified.type,
        volume: 1.0,
        pan: 0,
        isMuted: false,
        isSolo: false
      });
      expect(stem.isPitchShiftable).toBe(item.expectedPitchShiftable);
    }
  });

  it('parses metadata accurately from "O Nosso General (Versão Mateus Brito) 140Bpm - B.zip"', () => {
    const meta = ZipMultitrackExtractor.parseMetadataFromZipName(
      'O Nosso General (Versa\u0303o Mateus Brito) 140Bpm - B.zip'
    );
    expect(meta.title).toBe('O Nosso General');
    expect(meta.artist).toBe('Versão Mateus Brito');
    expect(meta.bpm).toBe(140);
    expect(meta.originalKey).toBe('B');
  });

  it('maintains constant power unity sum (sin² + cos² = 1.0) in Dual-Tap Hann Pitch Shifter', () => {
    const curveA = PitchShifterDspNode.createHannWindowCurve(false, 1024);
    const curveB = PitchShifterDspNode.createHannWindowCurve(true, 1024);

    for (let i = 0; i < 1024; i++) {
      const sum = (curveA[i] ?? 0) + (curveB[i] ?? 0);
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });

  it('loads "O Nosso General (Versão Mateus Brito)" as first song with 13 real stems and Pitch Lock on rhythm/cues', () => {
    const songs = DemoWorshipSongs.getPresetSongs();
    const general = songs[0];
    expect(general).toBeDefined();
    expect(general?.title).toBe('O Nosso General');
    expect(general?.bpm).toBe(140);
    expect(general?.originalKey).toBe('B');
    expect(general?.stems.length).toBe(13);

    const lockedStems = general?.stems.filter((s) => !s.isPitchShiftable) ?? [];
    expect(lockedStems.map((s) => s.type)).toEqual(['click', 'guide', 'drums', 'loop']);
  });
});
