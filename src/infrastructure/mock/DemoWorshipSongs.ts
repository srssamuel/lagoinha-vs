import { Song } from '../../domain/entities/Song';
import { SongSection } from '../../domain/value-objects/SongSection';
import { TrackStem } from '../../domain/entities/TrackStem';

export class DemoWorshipSongs {
  /**
   * Cria o repertório oficial demonstrativo para cultos da Lagoinha
   */
  public static getPresetSongs(): Song[] {
    return [
      DemoWorshipSongs.createACasaESua(),
      DemoWorshipSongs.createVitoriosoEs(),
      DemoWorshipSongs.createOusadoAmor(),
      DemoWorshipSongs.createRujaOLeao()
    ];
  }

  public static createACasaESua(): Song {
    const bpm = 130;
    const beatsPerBar = 4;
    const barSeconds = (60 / bpm) * beatsPerBar; // ~1.846s

    const sections = [
      new SongSection({
        id: 'casa-intro',
        name: 'Intro',
        type: 'intro',
        startBar: 1,
        barCount: 4,
        startTime: 0,
        endTime: 4 * barSeconds
      }),
      new SongSection({
        id: 'casa-verso1',
        name: 'Verso 1',
        type: 'verse',
        startBar: 5,
        barCount: 8,
        startTime: 4 * barSeconds,
        endTime: 12 * barSeconds
      }),
      new SongSection({
        id: 'casa-refrão',
        name: 'Refrão',
        type: 'chorus',
        startBar: 13,
        barCount: 8,
        startTime: 12 * barSeconds,
        endTime: 20 * barSeconds
      }),
      new SongSection({
        id: 'casa-ponte',
        name: 'Ponte (Essa Casa É Sua)',
        type: 'bridge',
        startBar: 21,
        barCount: 8,
        startTime: 20 * barSeconds,
        endTime: 28 * barSeconds
      }),
      new SongSection({
        id: 'casa-espontaneo',
        name: 'Espontâneo / Vamp',
        type: 'vamp',
        startBar: 29,
        barCount: 8,
        startTime: 28 * barSeconds,
        endTime: 36 * barSeconds
      }),
      new SongSection({
        id: 'casa-outro',
        name: 'Final',
        type: 'outro',
        startBar: 37,
        barCount: 4,
        startTime: 36 * barSeconds,
        endTime: 40 * barSeconds
      })
    ];

    const stems = [
      new TrackStem({ id: 'stem-click', name: 'Click (Metrônomo)', type: 'click', volume: 0.85, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'stem-guide', name: 'Guia Vocal', type: 'guide', volume: 0.90, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'stem-drums', name: 'Bateria / Loops', type: 'drums', volume: 0.80, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'stem-bass', name: 'Baixo (Bass)', type: 'bass', volume: 0.75, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'stem-guitars', name: 'Guitarras', type: 'guitars', volume: 0.70, pan: -0.2, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'stem-keys', name: 'Teclado / Piano', type: 'keys', volume: 0.75, pan: 0.2, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'stem-pad', name: 'Synth / Pad', type: 'pad', volume: 0.65, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'stem-fx', name: 'Backing / FX', type: 'fx', volume: 0.60, pan: 0, isMuted: false, isSolo: false })
    ];

    return new Song({
      id: 'song-casa-e-sua',
      title: 'A Casa É Sua',
      artist: 'Casa Worship',
      originalKey: 'G',
      currentKey: 'G',
      bpm,
      timeSignature: { beats: 4, value: 4 },
      duration: 40 * barSeconds,
      sections,
      stems
    });
  }

  public static createVitoriosoEs(): Song {
    const bpm = 126;
    const barSeconds = (60 / bpm) * 4;

    const sections = [
      new SongSection({ id: 'vit-intro', name: 'Intro', type: 'intro', startBar: 1, barCount: 4, startTime: 0, endTime: 4 * barSeconds }),
      new SongSection({ id: 'vit-v1', name: 'Verso 1', type: 'verse', startBar: 5, barCount: 8, startTime: 4 * barSeconds, endTime: 12 * barSeconds }),
      new SongSection({ id: 'vit-ref', name: 'Refrão', type: 'chorus', startBar: 13, barCount: 8, startTime: 12 * barSeconds, endTime: 20 * barSeconds }),
      new SongSection({ id: 'vit-ponte', name: 'Ponte', type: 'bridge', startBar: 21, barCount: 8, startTime: 20 * barSeconds, endTime: 28 * barSeconds })
    ];

    const stems = [
      new TrackStem({ id: 'vit-click', name: 'Click (Metrônomo)', type: 'click', volume: 0.85, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'vit-guide', name: 'Guia Vocal', type: 'guide', volume: 0.90, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'vit-drums', name: 'Bateria', type: 'drums', volume: 0.80, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'vit-bass', name: 'Baixo', type: 'bass', volume: 0.75, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'vit-guitars', name: 'Guitarras', type: 'guitars', volume: 0.70, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'vit-keys', name: 'Teclado', type: 'keys', volume: 0.75, pan: 0, isMuted: false, isSolo: false })
    ];

    return new Song({
      id: 'song-vitorioso-es',
      title: 'Vitorioso És',
      artist: 'Gabriel Guedes',
      originalKey: 'D',
      currentKey: 'D',
      bpm,
      timeSignature: { beats: 4, value: 4 },
      duration: 28 * barSeconds,
      sections,
      stems
    });
  }

  public static createOusadoAmor(): Song {
    const bpm = 68;
    const barSeconds = (60 / bpm) * 6; // 6/8 time

    const sections = [
      new SongSection({ id: 'ous-intro', name: 'Intro', type: 'intro', startBar: 1, barCount: 4, startTime: 0, endTime: 4 * barSeconds }),
      new SongSection({ id: 'ous-v1', name: 'Verso 1', type: 'verse', startBar: 5, barCount: 8, startTime: 4 * barSeconds, endTime: 12 * barSeconds }),
      new SongSection({ id: 'ous-ref', name: 'Refrão', type: 'chorus', startBar: 13, barCount: 8, startTime: 12 * barSeconds, endTime: 20 * barSeconds })
    ];

    const stems = [
      new TrackStem({ id: 'ous-click', name: 'Click (Metrônomo)', type: 'click', volume: 0.85, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'ous-guide', name: 'Guia Vocal', type: 'guide', volume: 0.90, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'ous-drums', name: 'Bateria', type: 'drums', volume: 0.80, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'ous-bass', name: 'Baixo', type: 'bass', volume: 0.75, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'ous-pad', name: 'Pad Contínuo', type: 'pad', volume: 0.75, pan: 0, isMuted: false, isSolo: false })
    ];

    return new Song({
      id: 'song-ousado-amor',
      title: 'Ousado Amor',
      artist: 'Isaías Saad',
      originalKey: 'Gb',
      currentKey: 'Gb',
      bpm,
      timeSignature: { beats: 6, value: 8 },
      duration: 20 * barSeconds,
      sections,
      stems
    });
  }

  public static createRujaOLeao(): Song {
    const bpm = 74;
    const barSeconds = (60 / bpm) * 4;

    const sections = [
      new SongSection({ id: 'ruja-intro', name: 'Intro', type: 'intro', startBar: 1, barCount: 4, startTime: 0, endTime: 4 * barSeconds }),
      new SongSection({ id: 'ruja-v1', name: 'Verso', type: 'verse', startBar: 5, barCount: 8, startTime: 4 * barSeconds, endTime: 12 * barSeconds }),
      new SongSection({ id: 'ruja-ref', name: 'Refrão', type: 'chorus', startBar: 13, barCount: 8, startTime: 12 * barSeconds, endTime: 20 * barSeconds })
    ];

    const stems = [
      new TrackStem({ id: 'ruja-click', name: 'Click', type: 'click', volume: 0.85, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'ruja-guide', name: 'Guia', type: 'guide', volume: 0.90, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'ruja-drums', name: 'Drums', type: 'drums', volume: 0.80, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 'ruja-keys', name: 'Keys', type: 'keys', volume: 0.75, pan: 0, isMuted: false, isSolo: false })
    ];

    return new Song({
      id: 'song-ruja-o-leao',
      title: 'Ruja o Leão',
      artist: 'Talitha Pereira / FHOP',
      originalKey: 'Em',
      currentKey: 'Em',
      bpm,
      timeSignature: { beats: 4, value: 4 },
      duration: 20 * barSeconds,
      sections,
      stems
    });
  }
}
