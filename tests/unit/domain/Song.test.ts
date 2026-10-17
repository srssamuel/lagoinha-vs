import { describe, it, expect } from 'vitest';
import { Song } from '../../../src/domain/entities/Song';
import { SongSection } from '../../../src/domain/value-objects/SongSection';
import { TrackStem } from '../../../src/domain/entities/TrackStem';

describe('Song Entity & Sections', () => {
  const sections = [
    new SongSection({
      id: 'sec-intro',
      name: 'Intro',
      type: 'intro',
      startBar: 1,
      barCount: 4,
      startTime: 0,
      endTime: 8
    }),
    new SongSection({
      id: 'sec-verse',
      name: 'Verso 1',
      type: 'verse',
      startBar: 5,
      barCount: 8,
      startTime: 8,
      endTime: 24
    }),
    new SongSection({
      id: 'sec-chorus',
      name: 'Refrão',
      type: 'chorus',
      startBar: 13,
      barCount: 8,
      startTime: 24,
      endTime: 40
    })
  ];

  const stems = [
    new TrackStem({ id: 'stem-1', name: 'Click', type: 'click', volume: 0.9, pan: 0, isMuted: false, isSolo: false }),
    new TrackStem({ id: 'stem-2', name: 'Drums', type: 'drums', volume: 0.8, pan: 0, isMuted: false, isSolo: false })
  ];

  it('correctly calculates secondsPerBar for 120 BPM in 4/4', () => {
    const song = new Song({
      id: 'song-1',
      title: 'A Casa É Sua',
      artist: 'Casa Worship',
      originalKey: 'G',
      currentKey: 'G',
      bpm: 120,
      timeSignature: { beats: 4, value: 4 },
      duration: 180,
      sections,
      stems
    });

    // 120 bpm = 2 batidas por segundo = 0.5s por batida. 4 batidas = 2.0s por compasso.
    expect(song.secondsPerBar).toBe(2.0);
  });

  it('correctly identifies active section based on current time', () => {
    const song = new Song({
      id: 'song-1',
      title: 'A Casa É Sua',
      artist: 'Casa Worship',
      originalKey: 'G',
      currentKey: 'G',
      bpm: 120,
      timeSignature: { beats: 4, value: 4 },
      duration: 180,
      sections,
      stems
    });

    expect(song.getActiveSection(4)?.name).toBe('Intro');
    expect(song.getActiveSection(15)?.name).toBe('Verso 1');
    expect(song.getActiveSection(30)?.name).toBe('Refrão');
    expect(song.getActiveSection(100)).toBeNull();
  });

  it('rejects invalid BPMs outside church performance bounds', () => {
    expect(() => {
      new Song({
        id: 'bad-song',
        title: 'Invalid',
        artist: 'Unknown',
        originalKey: 'C',
        currentKey: 'C',
        bpm: 20, // Too slow
        timeSignature: { beats: 4, value: 4 },
        duration: 60,
        sections: [],
        stems: []
      });
    }).toThrow(/BPM must be between 30 and 300/);
  });
});
