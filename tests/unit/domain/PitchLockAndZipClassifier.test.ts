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

  it('extracts stored WAV entries from a .ZIP Blob using streaming extractFromZipBlob and detects WAV duration', async () => {
    // Cria um pequeno arquivo WAV válido (44 bytes header + 1764000 bytes = 10s a 44.1kHz 16-bit stereo)
    const wavHeader = new ArrayBuffer(44);
    const hv = new DataView(wavHeader);
    const dataBytes = 176400 * 15; // 15 segundos
    hv.setUint32(0, 0x46464952, true); // "RIFF"
    hv.setUint32(4, 36 + dataBytes, true);
    hv.setUint32(8, 0x45564157, true); // "WAVE"
    hv.setUint32(12, 0x20746d66, true); // "fmt "
    hv.setUint32(16, 16, true);
    hv.setUint16(20, 1, true); // PCM
    hv.setUint16(22, 2, true); // Stereo
    hv.setUint32(24, 44100, true);
    hv.setUint32(28, 176400, true); // byteRate
    hv.setUint16(32, 4, true);
    hv.setUint16(34, 16, true);
    hv.setUint32(36, 0x61746164, true); // "data"
    hv.setUint32(40, dataBytes, true);

    expect(ZipMultitrackExtractor.parseWavDurationFromHeader(wavHeader, 44 + dataBytes)).toBe(15);

    // Monta um pacote .ZIP válido (método Store = 0) contendo "Subfolder/DRUM_1.wav"
    const nameBytes = new TextEncoder().encode('Subfolder/DRUM_1.wav');
    const filePayload = new Uint8Array(44);
    filePayload.set(new Uint8Array(wavHeader));

    const localHeaderSize = 30 + nameBytes.length;
    const cdSize = 46 + nameBytes.length;
    const eocdSize = 22;
    const totalZipSize = localHeaderSize + filePayload.length + cdSize + eocdSize;

    const zipBuf = new ArrayBuffer(totalZipSize);
    const zv = new DataView(zipBuf);
    const zb = new Uint8Array(zipBuf);

    // Local File Header
    zv.setUint32(0, 0x04034b50, true);
    zv.setUint16(8, 0, true); // Store
    zv.setUint32(18, filePayload.length, true);
    zv.setUint32(22, filePayload.length, true);
    zv.setUint16(26, nameBytes.length, true);
    zb.set(nameBytes, 30);
    zb.set(filePayload, localHeaderSize);

    // Central Directory
    const cdOffset = localHeaderSize + filePayload.length;
    zv.setUint32(cdOffset, 0x02014b50, true);
    zv.setUint16(cdOffset + 10, 0, true); // Store
    zv.setUint32(cdOffset + 20, filePayload.length, true);
    zv.setUint32(cdOffset + 24, filePayload.length, true);
    zv.setUint16(cdOffset + 28, nameBytes.length, true);
    zv.setUint32(cdOffset + 42, 0, true); // localHeaderOffset
    zb.set(nameBytes, cdOffset + 46);

    // EOCD
    const eocdOffset = cdOffset + cdSize;
    zv.setUint32(eocdOffset, 0x06054b50, true);
    zv.setUint16(eocdOffset + 8, 1, true);
    zv.setUint16(eocdOffset + 10, 1, true);
    zv.setUint32(eocdOffset + 12, cdSize, true);
    zv.setUint32(eocdOffset + 16, cdOffset, true);

    const zipBlob = new Blob([zipBuf], { type: 'application/zip' });
    const entries = await ZipMultitrackExtractor.extractFromZipBlob(zipBlob);
    expect(entries.length).toBe(1);
    expect(entries[0]?.filename).toBe('DRUM_1.wav');
    expect(entries[0]?.durationSeconds).toBe(15);
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
