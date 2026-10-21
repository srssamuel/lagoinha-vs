import { describe, expect, it } from 'vitest';
import {
  canChooseAbsoluteTarget,
  keyFromAudio,
  keyFromName,
  keyFromStored,
  keyMetaOf,
  keyStatus,
  legacyKey,
  manualKey,
  reconcileKey,
  UNKNOWN_KEY
} from '../../../src/domain/value-objects/SongKey';
import { Song } from '../../../src/domain/entities/Song';
import type { KeyEstimate } from '../../../src/domain/services/SongKeyDetector';

const estimate = (over: Partial<KeyEstimate>): KeyEstimate => ({
  key: 'F',
  correlation: 0.8,
  margin: 0.2,
  candidates: ['F'],
  ambiguous: false,
  chroma: [],
  ...over
});

describe('SongKey — tom com procedência, sem "G" de fallback', () => {
  it('registro antigo (só a string) vira legacy, não confirmado; vazio ou inválido vira sem tom', () => {
    expect(legacyKey('G')).toMatchObject({ value: 'G', origin: 'legacy', confirmed: false });
    expect(legacyKey('')).toEqual(UNKNOWN_KEY);
    expect(legacyKey('lixo')).toEqual(UNKNOWN_KEY);
    expect(keyFromStored('G')).toMatchObject({ value: 'G', origin: 'legacy', confirmed: false });
    expect(keyFromStored('')).toEqual(UNKNOWN_KEY);
  });

  it('análise conclusiva = estimado e não confirmado; ambígua = sem valor + candidatos; fraca = sem tom', () => {
    expect(keyFromAudio(estimate({}))).toMatchObject({ value: 'F', origin: 'audio', estimated: true, confirmed: false });
    const amb = keyFromAudio(estimate({ key: 'G', candidates: ['G', 'Em'], ambiguous: true }));
    expect(amb).toMatchObject({ value: null, origin: 'audio', estimated: true, candidates: ['G', 'Em'] });
    expect(keyFromAudio(estimate({ correlation: 0.3 }))).toEqual(UNKNOWN_KEY);
    expect(keyFromAudio(null)).toEqual(UNKNOWN_KEY);
  });

  it('confirmação manual prevalece sobre nome e sobre qualquer análise nova', () => {
    const manual = manualKey('F');
    expect(reconcileKey(manual, keyFromAudio(estimate({ key: 'G' })))).toBe(manual);
    expect(reconcileKey(manual, keyFromName('A'))).toBe(manual);
  });

  it('nome vale mais que áudio e que legado; análise vazia não apaga o que existia', () => {
    const named = keyFromName('D');
    expect(reconcileKey(named, keyFromAudio(estimate({ key: 'F' })))).toBe(named);
    const audio = keyFromAudio(estimate({ key: 'F' }));
    expect(reconcileKey(legacyKey('G'), audio)).toBe(audio);
    const legacy = legacyKey('G');
    expect(reconcileKey(legacy, UNKNOWN_KEY)).toBe(legacy);
  });

  it('tom de destino absoluto só com tom do nome ou confirmado', () => {
    expect(canChooseAbsoluteTarget(keyFromName('F'))).toBe(true);
    expect(canChooseAbsoluteTarget(manualKey('F'))).toBe(true);
    expect(canChooseAbsoluteTarget(keyFromAudio(estimate({})))).toBe(false);
    expect(canChooseAbsoluteTarget(legacyKey('G'))).toBe(false);
    expect(canChooseAbsoluteTarget(UNKNOWN_KEY)).toBe(false);
  });

  it('persistência: ida e volta preserva origem, confirmação e candidatos', () => {
    const amb = keyFromAudio(estimate({ candidates: ['G', 'Em'], ambiguous: true }));
    expect(keyFromStored('', keyMetaOf(amb))).toEqual(amb);
    const manual = manualKey('Bb');
    expect(keyFromStored('Bb', keyMetaOf(manual))).toEqual(manual);
    expect(keyStatus(manual)).toBe('confirmed');
    expect(keyStatus(amb)).toBe('ambiguous');
    expect(keyStatus(UNKNOWN_KEY)).toBe('unknown');
    expect(keyStatus(keyFromAudio(estimate({})))).toBe('estimated');
  });
});

describe('Song sem tom conhecido', () => {
  const base = {
    id: 's',
    title: 'Titulo',
    artist: 'A',
    bpm: 100,
    timeSignature: { beats: 4, value: 4 },
    duration: 200,
    sections: [],
    stems: []
  };

  it('transposição em semitons continua funcionando e currentKey fica nulo (nunca "G")', () => {
    const song = new Song({ ...base, originalKey: null, currentKey: null });
    song.setPitchShift(2);
    expect(song.pitchShiftSemitones).toBe(2);
    expect(song.currentKey).toBeNull();
    expect(song.keyInfo.value).toBeNull();
  });

  it('com tom, transpõe; registro legado entra como não confirmado; confirmar atualiza o tom atual', () => {
    const song = new Song({ ...base, originalKey: 'G', currentKey: 'G' });
    expect(song.keyInfo).toMatchObject({ origin: 'legacy', confirmed: false });
    song.setPitchShift(2);
    expect(song.currentKey).toBe('A');
    song.confirmKey('F');
    expect(song.originalKey).toBe('F');
    expect(song.keyInfo).toMatchObject({ origin: 'manual', confirmed: true });
    expect(song.currentKey).toBe('G');
  });
});
