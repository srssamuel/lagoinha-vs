import { describe, it, expect } from 'vitest';
import { SectionNavigationService } from '../../../src/application/services/SectionNavigationService';
import { DemoWorshipSongs } from '../../../src/infrastructure/mock/DemoWorshipSongs';

describe('SectionNavigationService — pedaleira e atalhos de seção', () => {
  const song = DemoWorshipSongs.getPresetSongs()[0]!;
  const [first, second] = song.sections;

  it('avança para a próxima seção e, sem seção ativa, para a primeira', () => {
    expect(song.sections.length).toBeGreaterThan(1);
    expect(SectionNavigationService.next(song, first!.id)?.id).toBe(second!.id);
    expect(SectionNavigationService.next(song, null)?.id).toBe(first!.id);
  });

  it('não passa da última seção', () => {
    const last = song.sections[song.sections.length - 1]!;
    expect(SectionNavigationService.next(song, last.id)).toBeNull();
  });

  it('volta uma seção e fica na primeira quando já está nela', () => {
    expect(SectionNavigationService.previous(song, second!.id)?.id).toBe(first!.id);
    expect(SectionNavigationService.previous(song, first!.id)?.id).toBe(first!.id);
  });

  it('mapeia atalhos numéricos 1..N e ignora números fora do intervalo', () => {
    expect(SectionNavigationService.byShortcutNumber(song, 1)?.id).toBe(first!.id);
    expect(SectionNavigationService.byShortcutNumber(song, 0)).toBeNull();
    expect(SectionNavigationService.byShortcutNumber(song, song.sections.length + 1)).toBeNull();
  });
});
