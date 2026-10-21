import { describe, expect, it } from 'vitest';
import {
  detectKeyFromPcm,
  estimateKeyFromChroma,
  isTonalStemForKeyDetection,
  parseKeyFromName
} from '../../../src/domain/services/SongKeyDetector';
import { ZipMultitrackExtractor } from '../../../src/infrastructure/audio/ZipMultitrackExtractor';

/**
 * Regressão do relato de palco "VS em F identificou G".
 * Causa: o tom vinha só do nome do .zip com uma regex estreita e, sem casar, caía no padrão fixo 'G'.
 */

const SR = 44100;
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Acordes como listas de notas MIDI; cada um dura `secs`, com harmônicos e envelope de decaimento. */
function renderProgression(chords: number[][], secs = 1.5, sr = SR): Float32Array {
  const per = Math.floor(sr * secs);
  const out = new Float32Array(per * chords.length);
  chords.forEach((notes, c) => {
    for (const note of notes) {
      const f = midiHz(note);
      for (let i = 0; i < per; i++) {
        const t = i / sr;
        const env = Math.exp(-1.2 * t);
        const v =
          Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t);
        out[c * per + i]! += (0.1 * env * v) / notes.length;
      }
    }
  });
  return out;
}

// Tríades com baixo uma oitava e meia abaixo (MIDI: C4 = 60)
const triad = (root: number, minor = false) => [root - 12, root, root + (minor ? 3 : 4), root + 7];
const F4 = 65;
const G4 = 67;
const A3 = 57;

describe('SongKeyDetector — tom pelo nome do pacote', () => {
  it.each([
    ['Ninguem Explica Deus - F - 74 BPM.zip', 'F'],
    ['Algo Novo-Algo Novo-F-60.00bpm.zip', 'F'],
    ['A_Casa_E_Sua_130BPM_Tom_F.zip', 'F'],
    ['MULTITRACKS ALIANCA DE AMOR BPM 100 F.zip', 'F'],
    ['Hino_F_72bpm.zip', 'F'],
    ['Bondade de Deus (F).zip', 'F'],
    ['Bondade de Deus - Isaias Saad 68BPM - F.zip', 'F'],
    ['Festa - Key A - 132bpm', 'A'],
    ['Multitrack - Tudo é Perda - Felipe Rodrigues - C# - 126 bpm', 'C#'],
    ['Oceans - F#m - 66bpm.zip', 'F#m']
  ])('"%s" -> %s', (name, key) => {
    expect(parseKeyFromName(name)).toBe(key);
  });

  it('não inventa tom quando o nome não traz (antes devolvia G)', () => {
    expect(parseKeyFromName('A Benção.zip')).toBeNull();
    expect(parseKeyFromName('Dançar na chuva - 154 Bpm.zip')).toBeNull();
  });

  it('ZipMultitrackExtractor usa o tom do nome e sinaliza quando não há tom no nome', () => {
    const named = ZipMultitrackExtractor.parseMetadataFromZipName('Ninguem Explica Deus - F - 74 BPM.zip');
    expect(named.originalKey).toBe('F');
    expect(named.keyFromName).toBe(true);
    expect(named.title).toBe('Ninguem Explica Deus');
    expect(named.bpm).toBe(74);

    const unnamed = ZipMultitrackExtractor.parseMetadataFromZipName('A Benção.zip');
    expect(unnamed.keyFromName).toBe(false);
  });
});

describe('SongKeyDetector — tom pelo áudio (cromagrama + Krumhansl-Schmuckler)', () => {
  it('empate entre relativos (as 7 notas de Sol com o mesmo peso) fica com o maior: G, não Em', () => {
    const chroma = new Array<number>(12).fill(0);
    for (const pc of [7, 9, 11, 0, 2, 4, 6]) chroma[pc] = 1; // G A B C D E F#
    const estimate = estimateKeyFromChroma(chroma)!;
    expect(estimate.key).toBe('G');
    expect(estimate.margin).toBeGreaterThanOrEqual(0);
  });

  it('I-IV-V-I em Fá maior -> F (não G)', () => {
    const pcm = renderProgression([triad(F4), triad(F4 + 5), triad(F4 + 7), triad(F4)]);
    expect(detectKeyFromPcm(pcm, SR)?.key).toBe('F');
  });

  it('escala de Fá maior (melodia) -> F', () => {
    const scale = [0, 2, 4, 5, 7, 9, 11, 12, 7, 4, 0].map((d) => [F4 + d]);
    expect(detectKeyFromPcm(renderProgression(scale, 0.5), SR)?.key).toBe('F');
  });

  it('I-IV-V-I em Sol maior -> G', () => {
    const pcm = renderProgression([triad(G4), triad(G4 + 5), triad(G4 + 7), triad(G4)]);
    expect(detectKeyFromPcm(pcm, SR)?.key).toBe('G');
  });

  it('i-iv-V-i em Lá menor (V maior com G#) -> Am', () => {
    const pcm = renderProgression([triad(A3, true), triad(A3 + 5, true), triad(A3 + 7), triad(A3, true)]);
    expect(detectKeyFromPcm(pcm, SR)?.key).toBe('Am');
  });

  it('funciona em 48 kHz (interface de áudio USB)', () => {
    const pcm48 = renderProgression([triad(F4), triad(F4 + 5), triad(F4 + 7), triad(F4)], 1.5, 48000);
    expect(detectKeyFromPcm(pcm48, 48000)?.key).toBe('F');
  });

  it('silêncio não vira tom', () => {
    expect(detectKeyFromPcm(new Float32Array(SR * 2), SR)).toBeNull();
  });

  it('Click, Guia, Bateria, Loop e FX ficam fora da análise; instrumentos tonais entram', () => {
    for (const t of ['click', 'guide', 'drums', 'loop', 'fx'] as const) expect(isTonalStemForKeyDetection(t)).toBe(false);
    for (const t of ['bass', 'keys', 'violao', 'guitars', 'pad', 'strings', 'vocals'] as const)
      expect(isTonalStemForKeyDetection(t)).toBe(true);
  });
});
