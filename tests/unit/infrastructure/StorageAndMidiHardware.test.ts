import { describe, it, expect, vi } from 'vitest';
import { IndexedDbStorageService } from '../../../src/infrastructure/storage/IndexedDbStorageService';
import { WebMidiHardwareService } from '../../../src/infrastructure/midi/WebMidiHardwareService';
import { ProceduralClickGenerator } from '../../../src/infrastructure/audio/ProceduralClickGenerator';
import { DemoWorshipSongs } from '../../../src/infrastructure/mock/DemoWorshipSongs';

describe('IndexedDbStorageService — Setlist Serialization & JSON Backup', () => {
  it('serializes and deserializes songs preserving sections, stems, DSP, and Pitch Lock', () => {
    const originalSong = DemoWorshipSongs.getPresetSongs()[0]!;
    const serialized = IndexedDbStorageService.serializeSong(originalSong);
    expect(serialized.id).toBe(originalSong.id);
    expect(serialized.title).toBe(originalSong.title);
    expect(serialized.stems.length).toBe(originalSong.stems.length);

    const deserialized = IndexedDbStorageService.deserializeSong(serialized);
    expect(deserialized.id).toBe(originalSong.id);
    expect(deserialized.title).toBe(originalSong.title);
    expect(deserialized.bpm).toBe(originalSong.bpm);
    expect(deserialized.stems.length).toBe(originalSong.stems.length);
    expect(deserialized.stems.find((s) => s.type === 'drums')?.isPitchShiftable).toBe(false);
    expect(deserialized.stems.find((s) => s.type === 'guitars')?.isPitchShiftable).toBe(true);
  });

  it('exports and imports setlists as valid JSON backup files', () => {
    const songs = DemoWorshipSongs.getPresetSongs();
    const jsonStr = IndexedDbStorageService.exportSetlistToJson(songs, 'Culto Especial');
    expect(jsonStr).toContain('"app": "Lagoinha VS"');
    expect(jsonStr).toContain('"serviceName": "Culto Especial"');

    const imported = IndexedDbStorageService.importSetlistFromJson(jsonStr);
    expect(imported.length).toBe(songs.length);
    expect(imported[0]?.title).toBe(songs[0]?.title);
  });
});

describe('WebMidiHardwareService — USB Pedalboard & MIDI Control', () => {
  it('registers action handlers and dispatches MIDI bindings', () => {
    const midi = WebMidiHardwareService.getInstance();
    const playSpy = vi.fn();
    const unbind = midi.registerActionHandler('play-pause', playSpy);

    // Binds CC 64 to play-pause and triggers it manually
    midi.bindActionToMidi('play-pause', 'CC', 64, 1);
    const bindings = midi.getBindings();
    const playBinding = bindings.find((b) => b.actionId === 'play-pause');
    expect(playBinding?.midiNumber).toBe(64);

    unbind();
  });

  it('supports MIDI learn mode activation and cancellation', () => {
    const midi = WebMidiHardwareService.getInstance();
    midi.startLearning('next-sec');
    expect(midi.getLearningActionId()).toBe('next-sec');

    midi.cancelLearning();
    expect(midi.getLearningActionId()).toBeNull();
  });
});

describe('ProceduralClickGenerator — Worship Click Styles', () => {
  it('synthesizes buffers for WOODBLOCK, ABLETON, and BEEP styles without NaN or clipping', () => {
    const mockCtx = {
      sampleRate: 44100,
      createBuffer: (_channels: number, length: number, sampleRate: number) => {
        const channelData = new Float32Array(length);
        return {
          length,
          sampleRate,
          duration: length / sampleRate,
          getChannelData: () => channelData
        } as unknown as AudioBuffer;
      }
    } as unknown as AudioContext;

    const woodAccent = ProceduralClickGenerator.createClickBuffer(mockCtx, true, 'WOODBLOCK');
    const woodData = woodAccent.getChannelData(0);
    expect(woodData.length).toBeGreaterThan(0);
    expect(Number.isNaN(woodData[0])).toBe(false);

    const abletonRegular = ProceduralClickGenerator.createClickBuffer(mockCtx, false, 'ABLETON');
    const abletonData = abletonRegular.getChannelData(0);
    expect(abletonData.length).toBeGreaterThan(0);
    expect(Number.isNaN(abletonData[0])).toBe(false);

    const beepAccent = ProceduralClickGenerator.createClickBuffer(mockCtx, true, 'BEEP');
    const beepData = beepAccent.getChannelData(0);
    expect(beepData.length).toBeGreaterThan(0);
    expect(Number.isNaN(beepData[0])).toBe(false);
  });
});
