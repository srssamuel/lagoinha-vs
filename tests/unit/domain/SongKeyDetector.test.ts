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

describe('SongKeyDetector — gramática do tom no nome (nomes inventados no padrão do acervo)', () => {
  it.each([
    ['Titulo Um - F - 74 BPM.zip', 'F'],
    ['Titulo Dois-Banda Exemplo-D-60.00bpm.zip', 'D'],
    ['Titulo_Tres_130BPM_Tom_G.zip', 'G'],
    ['TITULO QUATRO BPM 100 F.zip', 'F'],
    ['Titulo_Cinco_F_72bpm.zip', 'F'],
    ['Titulo Seis (F).zip', 'F'],
    ['Titulo Sete - Banda Exemplo 68BPM - Bb.zip', 'Bb'],
    ['Titulo Oito - Key A - 132bpm', 'A'],
    ['Multitrack - Titulo Nove - Banda - C# - 126 bpm', 'C#'],
    ['Titulo Dez - F#m - 66bpm.zip', 'F#m'],
    ['Titulo Onze - Banda - Tom F - BPM 104,00', 'F'],
    ['TITULO DOZE A 120BPM', 'A'],
    ['TITULO E MINHA CASA G 80BPM', 'G'],
    ['Titulo treze_tom A_110 BPM', 'A'],
    ['Titulo_Catorze_Min IIR_135 bpm_G', 'G'],
    ['Titulo Quinze (Banda) ｜ Nome 150Bpm - Bb', 'Bb'],
    ['Titulo-Banda-Gb 62.00bpm', 'Gb'],
    ['Titulo Dezesseis - Em - 70 BPM', 'Em'],
    ['Titulo [G] 70bpm', 'G'],
    ['C - Multitrack - Titulo Um - Banda Exemplo Cover', 'C'],
    // acidentes e modo por extenso
    ['Titulo - F♯ - 70 BPM', 'F#'],
    ['Titulo - B♭ - 70bpm', 'Bb'],
    ['Titulo - F sustenido - 70bpm', 'F#'],
    ['Titulo - Tom Si bemol', 'Bb'],
    ['Titulo - Tom Sol maior - 70bpm', 'G'],
    ['Titulo - Tom Fá', 'F'],
    ['Titulo - E menor - 70bpm', 'Em'],
    ['Titulo - D min - 70bpm', 'Dm'],
    ['Titulo - F# minor - 70bpm', 'F#m'],
    ['Titulo - Tom F# menor', 'F#m'],
    ['Titulo - A maior - 70bpm', 'A'],
    ['Titulo Tom Fm', 'Fm']
  ])('"%s" -> %s', (name, key) => {
    expect(parseKeyFromName(name)).toBe(key);
  });

  it.each([
    'A Bela Canção.zip',
    'Dançar na Praia - 154 Bpm.zip',
    'Deus Fiel Exemplo - 70 BPM',
    'Graça Exemplo 80 BPM',
    'Bendito Exemplo 72bpm',
    'Abba Exemplo - 70 BPM',
    'Abba 70bpm',
    'Em Tua Presença Exemplo - 68 BPM',
    'Em Tua Presença Exemplo 68 BPM',
    'A Rua É Nossa 130BPM',
    'Eu E Meu Irmão - 80 BPM',
    'Luz Em Teu Caminho 135 bpm',
    'Bom Tom Deus',
    'Tom Exemplo - Garota',
    'Bb Exemplo Blues - 70 bpm',
    'Titulo - f - 70bpm',
    'Teu cuidado Em Mim',
    'Em - Tua Presença - Banda Exemplo',
    'Titulo - G - 68 BPM - A',
    'Titulo (F) - G - 70 BPM'
  ])('sem tom (ou conflito) -> null: "%s"', (name) => {
    expect(parseKeyFromName(name)).toBeNull();
  });

  it('ZipMultitrackExtractor usa o tom do nome e devolve tom nulo (não "G") quando o nome não traz', () => {
    const named = ZipMultitrackExtractor.parseMetadataFromZipName('Titulo Um - F - 74 BPM.zip');
    expect(named.originalKey).toBe('F');
    expect(named.keyFromName).toBe(true);
    expect(named.title).toBe('Titulo Um');
    expect(named.bpm).toBe(74);

    const unnamed = ZipMultitrackExtractor.parseMetadataFromZipName('A Bela Canção.zip');
    expect(unnamed.keyFromName).toBe(false);
    expect(unnamed.originalKey).toBeNull();
  });
});
describe('SongKeyDetector — tom pelo áudio (cromagrama + Krumhansl-Schmuckler)', () => {
  it('as 7 notas de Sol com o mesmo peso: maior e relativo menor são candidatos, sem escolher um', () => {
    const chroma = new Array<number>(12).fill(0);
    for (const pc of [7, 9, 11, 0, 2, 4, 6]) chroma[pc] = 1; // G A B C D E F#
    const estimate = estimateKeyFromChroma(chroma)!;
    expect(estimate.ambiguous).toBe(true);
    expect(estimate.candidates).toEqual(expect.arrayContaining(['G', 'Em']));
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


