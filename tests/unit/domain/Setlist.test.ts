import { describe, it, expect } from 'vitest';
import { Setlist } from '../../../src/domain/entities/Setlist';
import { DemoWorshipSongs } from '../../../src/infrastructure/mock/DemoWorshipSongs';

describe('Setlist — Song Removal and Reordering', () => {
  it('removes a song from the setlist and adjusts currentIndex safely', () => {
    const songs = DemoWorshipSongs.getPresetSongs();
    const initialCount = songs.length;
    const lastIdx = initialCount - 1;
    const setlist = new Setlist({
      id: 'set-1',
      name: 'Culto Domingo',
      serviceName: 'Culto de Celebração',
      date: '18/10/2026',
      songs,
      currentIndex: lastIdx
    });

    expect(setlist.songs.length).toBe(initialCount);
    setlist.removeSongAt(lastIdx);
    expect(setlist.songs.length).toBe(initialCount - 1);
    expect(setlist.currentIndex).toBe(lastIdx - 1);
  });

  it('reorders songs up and down in the setlist', () => {
    const songs = DemoWorshipSongs.getPresetSongs();
    const firstId = songs[0]?.id;
    const secondId = songs[1]?.id;

    const setlist = new Setlist({
      id: 'set-1',
      name: 'Culto Domingo',
      serviceName: 'Culto de Celebração',
      date: '18/10/2026',
      songs,
      currentIndex: 0
    });

    setlist.moveSong(0, 1);
    expect(setlist.songs[0]?.id).toBe(secondId);
    expect(setlist.songs[1]?.id).toBe(firstId);
    expect(setlist.currentIndex).toBe(1);
  });
});
