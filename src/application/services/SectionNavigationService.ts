import { Song } from '../../domain/entities/Song';
import { SongSection } from '../../domain/value-objects/SongSection';

/**
 * Navegação entre seções acionada por pedaleira MIDI e teclado.
 * O pulo em si é sempre quantizado pelo motor (queueSectionJump).
 */
export class SectionNavigationService {
  /** Próxima seção; sem seção ativa (antes da 1ª), vai para a primeira. */
  public static next(song: Song, activeSectionId: string | null): SongSection | null {
    const idx = song.sections.findIndex((s) => s.id === activeSectionId);
    return song.sections[idx + 1] ?? null;
  }

  /** Seção anterior; na primeira (ou sem seção ativa), permanece na primeira. */
  public static previous(song: Song, activeSectionId: string | null): SongSection | null {
    const idx = song.sections.findIndex((s) => s.id === activeSectionId);
    return song.sections[Math.max(0, idx - 1)] ?? null;
  }

  /** Atalho numérico 1..N do teclado de palco. */
  public static byShortcutNumber(song: Song, num: number): SongSection | null {
    if (num < 1 || num > song.sections.length) return null;
    return song.sections[num - 1] ?? null;
  }
}
