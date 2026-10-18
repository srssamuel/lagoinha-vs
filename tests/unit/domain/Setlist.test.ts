import { describe, it, expect } from 'vitest';
import { Setlist } from '../../../src/domain/entities/Setlist';
import { DemoWorshipSongs } from '../../../src/infrastructure/mock/DemoWorshipSongs';

describe('Setlist — Song Removal and Reordering', () => {
  it('removes a song from the setlist and adjusts currentIndex safely', () => {
    const songs = DemoWorshipSongs.getPresetSongs();
    const setlist = new Setlist({
      id: 'set-1',
      name: 'Culto Domingo',
      serviceName: 'Culto de Celebração',
      date: '17/10/2026',
      songs,
      currentIndex: 3
    });

    expect(setlist.songs.length).toBe(4);
    setlist.removeSongAt(3);
    expect(setlist.songs.length).toBe(3);
    expect(setlist.currentIndex).toBe(2);
  });

  it('reorders songs up and down in the setlist', () => {
    const songs = DemoWorshipSongs.getPresetSongs();
    const firstId = songs[0]?.id;
    const secondId = songs[1]?.id;

    const setlist = new Setlist({
      id: 'set-1',
      name: 'Culto Domingo',
      serviceName: 'Culto de Celebração',
      date: '17/10/2026',
      songs,
      currentIndex: 0
    });

    setlist.moveSong(0, 1);
    expect(setlist.songs[0]?.id).toBe(secondId);
    expect(setlist.songs[1]?.id).toBe(firstId);
    expect(setlist.currentIndex).toBe(1);
  });
});
