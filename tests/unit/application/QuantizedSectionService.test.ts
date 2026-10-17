import { describe, it, expect } from 'vitest';
import { QuantizedSectionService } from '../../../src/application/services/QuantizedSectionService';
import { Song } from '../../../src/domain/entities/Song';

describe('QuantizedSectionService', () => {
  const song = new Song({
    id: 'song-test',
    title: 'Vitorioso És',
    artist: 'Gabriel Guedes',
    originalKey: 'D',
    currentKey: 'D',
    bpm: 120, // 2s per bar in 4/4
    timeSignature: { beats: 4, value: 4 },
    duration: 300,
    sections: [],
    stems: []
  });

  it('calculates the next downbeat accurately when user requests a jump in the middle of a bar', () => {
    // Current time is 3.2s (inside bar 2, which runs from 2.0s to 4.0s)
    const { nextDownbeatTime, nextBar } = QuantizedSectionService.calculateNextDownbeatTime(3.2, song);

    // Bar 3 starts exactly at 4.0s
    expect(nextBar).toBe(3);
    expect(nextDownbeatTime).toBe(4.0);
  });

  it('determines when the transition time has been reached with tolerance', () => {
    const scheduledTime = 16.0;
    expect(QuantizedSectionService.isTimeToExecuteJump(15.8, scheduledTime)).toBe(false);
    expect(QuantizedSectionService.isTimeToExecuteJump(15.98, scheduledTime)).toBe(true);
    expect(QuantizedSectionService.isTimeToExecuteJump(16.02, scheduledTime)).toBe(true);
    expect(QuantizedSectionService.isTimeToExecuteJump(16.2, scheduledTime)).toBe(true);
  });
});
