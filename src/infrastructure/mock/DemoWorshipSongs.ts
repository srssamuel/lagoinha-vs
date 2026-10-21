import { manualKey } from '../../domain/value-objects/SongKey';
import { Song } from '../../domain/entities/Song';
import { SongSection } from '../../domain/value-objects/SongSection';
import { TrackStem } from '../../domain/entities/TrackStem';
import { VstPluginRackService } from '../../domain/services/VstPluginRackService';

export class DemoWorshipSongs {
  /**
   * Repertório com stems reais extraídos das Multitracks originais das músicas
   * (Incluindo a Multitrack completa de 13 canais "O Nosso General - Versão Mateus Brito - 140 BPM - Tom B")
   */
  public static getPresetSongs(): Song[] {
    return [
      DemoWorshipSongs.createONossoGeneral(),
      DemoWorshipSongs.createACasaESua(),
      DemoWorshipSongs.createVitoriosoEs(),
      DemoWorshipSongs.createOusadoAmor(),
      DemoWorshipSongs.createRujaOLeao()
    ];
  }

  public static createONossoGeneral(): Song {
    const bpm = 140;
    const duration = 247;
    const folder = 'o-nosso-general';
    const prefix = 'gen';

    const stems: TrackStem[] = [
      new TrackStem({
        id: `${prefix}-click`,
        name: 'Click 140 BPM',
        type: 'click',
        volume: 0.85,
        pan: 0,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: false,
        audioUrl: `./stems/${folder}/click.mp3`
      }),
      new TrackStem({
        id: `${prefix}-guide`,
        name: 'Guia (Cues)',
        type: 'guide',
        volume: 0.95,
        pan: 0,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: false,
        audioUrl: `./stems/${folder}/guide.mp3`
      }),
      new TrackStem({
        id: `${prefix}-drums`,
        name: 'Bateria (DRUM)',
        type: 'drums',
        volume: 1.0,
        pan: 0,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: false,
        audioUrl: `./stems/${folder}/drums.mp3`
      }),
      new TrackStem({
        id: `${prefix}-loop`,
        name: 'Loop Percussivo',
        type: 'loop',
        volume: 0.9,
        pan: 0,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: false,
        audioUrl: `./stems/${folder}/loop.mp3`
      }),
      new TrackStem({
        id: `${prefix}-bass`,
        name: 'Baixo (BASS)',
        type: 'bass',
        volume: 1.0,
        pan: 0,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: true,
        audioUrl: `./stems/${folder}/bass.mp3`
      }),
      new TrackStem({
        id: `${prefix}-eg1`,
        name: 'Guitarra 1 (EG 1)',
        type: 'guitars',
        volume: 1.0,
        pan: -0.25,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: true,
        audioUrl: `./stems/${folder}/eg1.mp3`
      }),
      new TrackStem({
        id: `${prefix}-eg2`,
        name: 'Guitarra 2 (EG 2)',
        type: 'guitars',
        volume: 1.0,
        pan: 0.25,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: true,
        audioUrl: `./stems/${folder}/eg2.mp3`
      }),
      new TrackStem({
        id: `${prefix}-eg3`,
        name: 'Guitarra Solo (EG 3)',
        type: 'guitars',
        volume: 1.0,
        pan: 0.1,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: true,
        audioUrl: `./stems/${folder}/eg3.mp3`
      }),
      new TrackStem({
        id: `${prefix}-keys-ep`,
        name: 'Piano Elétrico (EP)',
        type: 'keys',
        volume: 1.0,
        pan: -0.15,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: true,
        audioUrl: `./stems/${folder}/keys_ep.mp3`
      }),
      new TrackStem({
        id: `${prefix}-keys-orgao`,
        name: 'Órgão Hammond',
        type: 'keys',
        volume: 0.95,
        pan: 0.15,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: true,
        audioUrl: `./stems/${folder}/keys_orgao.mp3`
      }),
      new TrackStem({
        id: `${prefix}-pad`,
        name: 'Keys Synth Pad',
        type: 'pad',
        volume: 0.9,
        pan: 0,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: true,
        audioUrl: `./stems/${folder}/pad.mp3`
      }),
      new TrackStem({
        id: `${prefix}-keys-lead`,
        name: 'Synth Lead',
        type: 'keys',
        volume: 0.95,
        pan: 0.1,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: true,
        audioUrl: `./stems/${folder}/keys_lead.mp3`
      }),
      new TrackStem({
        id: `${prefix}-vocals`,
        name: 'Backing Vocals',
        type: 'vocals',
        volume: 0.95,
        pan: 0,
        isMuted: false,
        isSolo: false,
        isPitchShiftable: true,
        audioUrl: `./stems/${folder}/vocals.mp3`
      })
    ];

    VstPluginRackService.applySmartAutoFixAll(stems);

    // Seções extraídas diretamente das marcações reais da GUIA_1.wav (140 BPM = 1.714s por compasso 4/4)
    const sections = [
      new SongSection({ id: 'gen-intro', name: 'Contagem & Intro', type: 'intro', startBar: 1, barCount: 12, startTime: 0, endTime: 20 }),
      new SongSection({ id: 'gen-v1', name: 'Verso 1 (Pelo Senhor)', type: 'verse', startBar: 13, barCount: 16, startTime: 20, endTime: 48 }),
      new SongSection({ id: 'gen-ref1', name: 'Refrão 1 (O Nosso General)', type: 'chorus', startBar: 29, barCount: 16, startTime: 48, endTime: 75 }),
      new SongSection({ id: 'gen-turn', name: 'Interlúdio Brass/Synth', type: 'interlude', startBar: 45, barCount: 8, startTime: 75, endTime: 89 }),
      new SongSection({ id: 'gen-v2', name: 'Verso 2', type: 'verse', startBar: 53, barCount: 16, startTime: 89, endTime: 116 }),
      new SongSection({ id: 'gen-ref2', name: 'Refrão 2', type: 'chorus', startBar: 69, barCount: 8, startTime: 116, endTime: 130 }),
      new SongSection({ id: 'gen-inst', name: 'Solo Guitarra / Instrumental', type: 'vamp', startBar: 77, barCount: 16, startTime: 130, endTime: 158 }),
      new SongSection({ id: 'gen-ponte', name: 'Ponte / Subida', type: 'bridge', startBar: 93, barCount: 16, startTime: 158, endTime: 185 }),
      new SongSection({ id: 'gen-ref-final', name: 'Refrão Duplo Final', type: 'chorus', startBar: 109, barCount: 24, startTime: 185, endTime: 226 }),
      new SongSection({ id: 'gen-outro', name: 'Final (Tag)', type: 'outro', startBar: 133, barCount: 12, startTime: 226, endTime: 247 })
    ];

    return new Song({
      id: 'o-nosso-general',
      title: 'O Nosso General',
      artist: 'Mateus Brito (Multitrack Oficial 13 Canais)',
      originalKey: 'B',
      keyInfo: manualKey('B'),
      currentKey: 'B',
      bpm,
      timeSignature: { beats: 4, value: 4 },
      duration,
      sections,
      stems
    });
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
      keyInfo: manualKey('G'),
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
      keyInfo: manualKey('D'),
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
      keyInfo: manualKey('Gb'),
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
      keyInfo: manualKey('Em'),
      currentKey: 'Em',
      bpm,
      timeSignature: { beats: 4, value: 4 },
      duration,
      sections,
      stems: DemoWorshipSongs.createRealStems('ruja', 'song-ruja-o-leao')
    });
  }
}
