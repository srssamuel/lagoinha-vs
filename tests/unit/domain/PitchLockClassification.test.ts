import { describe, expect, it } from 'vitest';
import { TrackStem, type PitchPolicy, type StemType } from '../../../src/domain/entities/TrackStem';
import { classifyStemName } from '../../../src/domain/entities/StemNameClassifier';
import {
  PITCH_PATH_LATENCY_SEC,
  PitchShifterDspNode
} from '../../../src/infrastructure/audio/PitchShifterDspNode';
import { createTimelineContext, type TimelineParam } from '../infrastructure/helpers/timelineParam';

type Row = [file: string, type: StemType, policy: PitchPolicy];

// Nomes típicos de multitrack -> [tipo, política]. 'harmonic' transpõe; 'percussive'/'locked' ficam travados.
const TABLE: Row[] = [
  // Transpostos
  ['Keys Loop_1.wav', 'keys', 'harmonic'],
  ['Synth Loop - 01.wav', 'keys', 'harmonic'],
  ['Piano Loop.wav', 'keys', 'harmonic'],
  ['Arp 2_1.wav', 'keys', 'harmonic'],
  ['Keys Synth_1.wav', 'pad', 'harmonic'],
  ['PAD HI.wav', 'pad', 'harmonic'],
  ['BGVS.wav', 'vocals', 'harmonic'],
  ['vocals_1.wav', 'vocals', 'harmonic'],
  ['Choir.wav', 'vocals', 'harmonic'],
  ['BASS_1.wav', 'bass', 'harmonic'],
  ['Synth Bass.wav', 'bass', 'harmonic'],
  ['EG 2_1.wav', 'guitars', 'harmonic'],
  ['Strings.wav', 'strings', 'harmonic'],
  // Stems mistos: transpõe (a parte harmônica não pode ficar para trás); bateria embutida terá artefato
  ['Band.wav', 'fx', 'harmonic'],
  ['Instrumental.wav', 'fx', 'harmonic'],
  ['Mix.wav', 'fx', 'harmonic'],
  ['Playback.wav', 'fx', 'harmonic'],
  // Travados
  ['LOOP.wav', 'loop', 'percussive'],
  ['Loop.wav', 'loop', 'percussive'],
  ['Drum Loop.wav', 'loop', 'percussive'],
  ['Perc Loop.wav', 'loop', 'percussive'],
  ['Loop Bateria.wav', 'loop', 'percussive'],
  ['PERC.wav', 'loop', 'percussive'],
  ['DRUM_1.wav', 'drums', 'percussive'],
  ['CLICK_140__1.wav', 'click', 'locked'],
  ['GUIA_1.wav', 'guide', 'locked'],
  ['Guia.wav', 'guide', 'locked'],
  ['Cues.wav', 'guide', 'locked']
];

describe('Pitch Lock: classificação por nome de arquivo', () => {
  it.each(TABLE)('%s -> %s / %s', (file, type, policy) => {
    const c = TrackStem.classifyStemFromFilename(file);
    expect(c.type).toBe(type);
    expect(c.pitchPolicy).toBe(policy);
    expect(c.isPitchShiftable).toBe(policy === 'harmonic');
    // O caminho sem tipo explícito (inferPitchPolicy) concorda com o classificador de arquivo
    expect(TrackStem.inferPitchPolicy(c.type, file.replace(/\.wav$/i, ''))).toBe(policy);
  });

  it('não confunde substrings de nomes comuns (token, não includes)', () => {
    // "ag"/"ep"/"eg"/"sub" dentro de palavras não podem virar violão/teclas/guitarra/baixo
    expect(classifyStemName('Stage Hit').matched).toBe(false);
    expect(classifyStemName('Step FX').matched).toBe(false);
    expect(classifyStemName('Legato FX').matched).toBe(false);
  });

  it('nomes colados de click/guia continuam click/guia (nunca vão para o PA)', () => {
    for (const n of ['CLICKTRACK', 'clicktrack', 'Metronome140', 'ClickTrack 140']) {
      expect(TrackStem.classifyStemFromFilename(`${n}.wav`).type).toBe('click');
    }
    for (const n of ['voiceguide', 'GuiaVoz', 'VoiceCues']) {
      expect(TrackStem.classifyStemFromFilename(`${n}.wav`).type).toBe('guide');
    }
    // "Acoustic" não é cue; "Pad Tom D" (tom = tonalidade) não é bateria
    expect(classifyStemName('Acoustic Gtr').family).toBe('acoustic-guitar');
    expect(classifyStemName('Pad Tom D').family).toBe('pad');
  });

  it('bateria no nome vence o instrumento dentro de loop', () => {
    expect(classifyStemName('Bass Drum Loop').policy).toBe('percussive');
    expect(classifyStemName('Acoustic Drum Loop').policy).toBe('percussive');
    expect(classifyStemName('Toms').family).toBe('drums');
  });

  it('stem com nome de click/guia gravado com outro tipo ou política (Firestore/IndexedDB) é corrigido', () => {
    const clickAsFx = new TrackStem({
      id: 'c', name: 'Click', type: 'fx', volume: 1, pan: 0, isMuted: false, isSolo: false, pitchPolicy: 'harmonic'
    });
    expect(clickAsFx.type).toBe('click');
    expect(clickAsFx.pitchPolicy).toBe('locked');
    const restored = new TrackStem({
      id: 'g', name: 'Guia', type: 'guide', volume: 1, pan: 0, isMuted: false, isSolo: false, pitchPolicy: 'harmonic'
    });
    expect(restored.pitchPolicy).toBe('locked');
    restored.togglePitchLock();
    restored.isPitchShiftable = true;
    expect(restored.pitchPolicy).toBe('locked');
  });

  it('loop ambíguo é explicitamente travado e identificado como ambíguo', () => {
    expect(classifyStemName('Loop').family).toBe('ambiguous-loop');
    expect(classifyStemName('Drum Loop').family).toBe('percussive-loop');
    expect(classifyStemName('Keys Loop').family).toBe('harmonic-loop');
  });

  it('o músico sobrescreve por stem: loop ambíguo vira harmônico e volta; click/guia nunca destravam', () => {
    const c = TrackStem.classifyStemFromFilename('Loop.wav');
    const loop = new TrackStem({
      id: 'l', name: c.displayName, type: c.type, volume: 1, pan: 0, isMuted: false, isSolo: false,
      pitchPolicy: c.pitchPolicy
    });
    expect(loop.isPitchShiftable).toBe(false);
    loop.setPitchPolicy('harmonic');
    expect(loop.isPitchShiftable).toBe(true);
    loop.togglePitchLock();
    expect(loop.isPitchShiftable).toBe(false);

    const band = new TrackStem({
      id: 'b', name: 'Band', type: 'fx', volume: 1, pan: 0, isMuted: false, isSolo: false,
      pitchPolicy: TrackStem.classifyStemFromFilename('Band.wav').pitchPolicy
    });
    band.setPitchPolicy('percussive'); // operador trava o Band
    expect(band.isPitchShiftable).toBe(false);

    for (const [file, type] of [['CLICK.wav', 'click'], ['Guia.wav', 'guide']] as const) {
      const s = new TrackStem({
        id: file, name: file, type, volume: 1, pan: 0, isMuted: false, isSolo: false,
        pitchPolicy: TrackStem.classifyStemFromFilename(file).pitchPolicy
      });
      s.setPitchPolicy('harmonic');
      s.togglePitchLock();
      s.isPitchShiftable = true;
      expect(s.pitchPolicy).toBe('locked');
    }
  });

  it('roteamento: click e guia continuam só no IEM, nunca no FOH, qualquer que seja a política', () => {
    for (const [file] of TABLE) {
      const c = TrackStem.classifyStemFromFilename(file);
      const stem = new TrackStem({
        id: file, name: file, type: c.type, volume: 1, pan: 0, isMuted: false, isSolo: false,
        pitchPolicy: c.pitchPolicy
      });
      if (c.type === 'click' || c.type === 'guide') {
        expect(stem.getDefaultRouting()).toBe('SPLIT_IEM');
      } else {
        expect(stem.getDefaultRouting()).toBe('SPLIT_PA');
      }
    }
  });

  it('todo stem da tabela (transposto ou travado) tem a mesma latência dry de PITCH_PATH_LATENCY_SEC', () => {
    for (const [file] of TABLE) {
      const c = TrackStem.classifyStemFromFilename(file);
      const { ctx } = createTimelineContext();
      const node = new PitchShifterDspNode(ctx, c.isPitchShiftable);
      const dryDelay = (node as unknown as { dryDelay: { delayTime: TimelineParam } }).dryDelay;
      expect(dryDelay.delayTime.valueAt(0), file).toBe(PITCH_PATH_LATENCY_SEC);
    }
  });
});
