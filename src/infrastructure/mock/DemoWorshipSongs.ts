import { Song } from '../../domain/entities/Song';
import { SongSection } from '../../domain/value-objects/SongSection';
import { TrackStem } from '../../domain/entities/TrackStem';
import { VstPluginRackService } from '../../domain/services/VstPluginRackService';

export class DemoWorshipSongs {
  /**
   * Repertório com stems reais extraídos das Multitracks originais das músicas
   */
  public static getPresetSongs(): Song[] {
    return [
      DemoWorshipSongs.createACasaESua(),
      DemoWorshipSongs.createVitoriosoEs(),
      DemoWorshipSongs.createOusadoAmor(),
      DemoWorshipSongs.createRujaOLeao()
    ];
  }

  private static createRealStems(prefix: string, folder: string): TrackStem[] {
    const stems = [
      new TrackStem({
        id: `${prefix}-click`,
        name: 'Click (Metrônomo)',
        type: 'click',
        volume: 0.85,
        pan: 0,
        isMuted: false,
        isSolo: false,
        audioUrl: `./stems/${folder}/click.mp3`
      }),
      new TrackStem({
        id: `${prefix}-guide`,
        name: 'Guia Vocal',
        type: 'guide',
        volume: 0.95,
        pan: 0,
        isMuted: false,
        isSolo: false,
        audioUrl: `./stems/${folder}/guide.mp3`
      }),
      new TrackStem({
        id: `${prefix}-drums`,
        name: 'Bateria (Drums)',
        type: 'drums',
        volume: 1.0,
        pan: 0,
        isMuted: false,
        isSolo: false,
        audioUrl: `./stems/${folder}/drums.mp3`
      }),
      new TrackStem({
        id: `${prefix}-bass`,
        name: 'Baixo (Bass)',
        type: 'bass',
        volume: 1.0,
        pan: 0,
        isMuted: false,
        isSolo: false,
        audioUrl: `./stems/${folder}/bass.mp3`
      }),
      new TrackStem({
        id: `${prefix}-violao`,
        name: 'Violão Acústico',
        type: 'violao',
        volume: 1.0,
        pan: -0.2,
        isMuted: false,
        isSolo: false,
        audioUrl: `./stems/${folder}/violao.mp3`
      }),
      new TrackStem({
        id: `${prefix}-guitars`,
        name: 'Guitarra Elétrica',
        type: 'guitars',
        volume: 1.0,
        pan: 0.2,
        isMuted: false,
        isSolo: false,
        audioUrl: `./stems/${folder}/guitarra.mp3`
      }),
      new TrackStem({
        id: `${prefix}-keys`,
        name: 'Teclado / Piano',
        type: 'keys',
        volume: 1.0,
        pan: 0.1,
        isMuted: false,
        isSolo: false,
        audioUrl: `./stems/${folder}/keys.mp3`
      }),
      new TrackStem({
        id: `${prefix}-pad`,
        name: 'Synth / Warm Pad',
        type: 'pad',
        volume: 0.9,
        pan: 0,
        isMuted: false,
        isSolo: false,
        audioUrl: `./stems/${folder}/pad.mp3`
      }),
      new TrackStem({
        id: `${prefix}-vocals`,
        name: 'Backing Vocals',
        type: 'vocals',
        volume: 0.9,
        pan: 0,
        isMuted: false,
        isSolo: false,
        audioUrl: `./stems/${folder}/vocals.mp3`
      })
    ];
    VstPluginRackService.applySmartAutoFixAll(stems);
    return stems;
  }

  public static createACasaESua(): Song {
    const bpm = 130;
    const duration = 120;

    const sections = [
      new SongSection({ id: 'casa-intro', name: 'Intro', type: 'intro', startBar: 1, barCount: 8, startTime: 0, endTime: 15 }),
      new SongSection({ id: 'casa-verso1', name: 'Verso 1', type: 'verse', startBar: 9, barCount: 16, startTime: 15, endTime: 45 }),
      new SongSection({ id: 'casa-refrao', name: 'Refrão', type: 'chorus', startBar: 25, barCount: 16, startTime: 45, endTime: 75 }),
      new SongSection({ id: 'casa-ponte', name: 'Ponte (Essa Casa É Sua)', type: 'bridge', startBar: 41, barCount: 16, startTime: 75, endTime: 102 }),
      new SongSection({ id: 'casa-espontaneo', name: 'Espontâneo / Final', type: 'vamp', startBar: 57, barCount: 10, startTime: 102, endTime: 120 })
    ];

    return new Song({
      id: 'song-casa-sua',
      title: 'A Casa É Sua',
      artist: 'Casa Worship',
      originalKey: 'G',
      currentKey: 'G',
      bpm,
      timeSignature: { beats: 4, value: 4 },
      duration,
      sections,
      stems: DemoWorshipSongs.createRealStems('casa', 'song-casa-sua')
    });
  }

  public static createVitoriosoEs(): Song {
    const bpm = 126;
    const duration = 120;

    const sections = [
      new SongSection({ id: 'vit-intro', name: 'Intro', type: 'intro', startBar: 1, barCount: 8, startTime: 0, endTime: 16 }),
      new SongSection({ id: 'vit-v1', name: 'Verso 1', type: 'verse', startBar: 9, barCount: 16, startTime: 16, endTime: 48 }),
      new SongSection({ id: 'vit-ref', name: 'Refrão', type: 'chorus', startBar: 25, barCount: 16, startTime: 48, endTime: 84 }),
      new SongSection({ id: 'vit-ponte', name: 'Ponte (Vitorioso És)', type: 'bridge', startBar: 41, barCount: 18, startTime: 84, endTime: 120 })
    ];

    return new Song({
      id: 'song-vitorioso-es',
      title: 'Vitorioso És',
      artist: 'Gabriel Guedes',
      originalKey: 'D',
      currentKey: 'D',
      bpm,
      timeSignature: { beats: 4, value: 4 },
      duration,
      sections,
      stems: DemoWorshipSongs.createRealStems('vit', 'song-vitorioso-es')
    });
  }

  public static createOusadoAmor(): Song {
    const bpm = 68;
    const duration = 120;

    const sections = [
      new SongSection({ id: 'ous-intro', name: 'Intro', type: 'intro', startBar: 1, barCount: 4, startTime: 0, endTime: 18 }),
      new SongSection({ id: 'ous-v1', name: 'Verso 1', type: 'verse', startBar: 5, barCount: 8, startTime: 18, endTime: 52 }),
      new SongSection({ id: 'ous-ref', name: 'Refrão (Ousado Amor)', type: 'chorus', startBar: 13, barCount: 8, startTime: 52, endTime: 88 }),
      new SongSection({ id: 'ous-ponte', name: 'Ponte', type: 'bridge', startBar: 21, barCount: 8, startTime: 88, endTime: 120 })
    ];

    return new Song({
      id: 'song-ousado-amor',
      title: 'Ousado Amor',
      artist: 'Isaías Saad',
      originalKey: 'Gb',
      currentKey: 'Gb',
      bpm,
      timeSignature: { beats: 6, value: 8 },
      duration,
      sections,
      stems: DemoWorshipSongs.createRealStems('ous', 'song-ousado-amor')
    });
  }

  public static createRujaOLeao(): Song {
    const bpm = 74;
    const duration = 120;

    const sections = [
      new SongSection({ id: 'ruja-intro', name: 'Intro', type: 'intro', startBar: 1, barCount: 6, startTime: 0, endTime: 19 }),
      new SongSection({ id: 'ruja-v1', name: 'Verso', type: 'verse', startBar: 7, barCount: 12, startTime: 19, endTime: 55 }),
      new SongSection({ id: 'ruja-ref', name: 'Refrão (Ruja o Leão)', type: 'chorus', startBar: 19, barCount: 12, startTime: 55, endTime: 90 }),
      new SongSection({ id: 'ruja-ponte', name: 'Ponte (Que Se Abram os Céus)', type: 'bridge', startBar: 31, barCount: 10, startTime: 90, endTime: 120 })
    ];

    return new Song({
      id: 'song-ruja-o-leao',
      title: 'Ruja o Leão',
      artist: 'Talita Catanzaro / FHOP',
      originalKey: 'Em',
      currentKey: 'Em',
      bpm,
      timeSignature: { beats: 4, value: 4 },
      duration,
      sections,
      stems: DemoWorshipSongs.createRealStems('ruja', 'song-ruja-o-leao')
    });
  }
}
