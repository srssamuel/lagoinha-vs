import { StemType } from '../entities/TrackStem';
import { SectionType } from '../value-objects/SongSection';

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.[a-z0-9]{2,5}$/, '')
    .replace(/[_\-.]+/g, ' ');
}

/** Ordem importa: "click" antes de "guia", "violao" antes de "guitarra", "pad" antes de "teclado". */
const STEM_RULES: [StemType, RegExp][] = [
  ['click', /\b(click|clique|metronomo|metronome|clk)\b/],
  ['guide', /\b(guia|guide|cue|cues|voz guia|contagem)\b/],
  ['drums', /\b(bateria|drums?|kit|kick|bumbo|caixa|snare|tom|overhead|percussao|perc)\b/],
  ['loop', /\b(loops?|sequencia|seq|track|tracks|samples?)\b/],
  ['bass', /\b(baixo|bass|sub)\b/],
  ['violao', /\b(violao|acoustic|acustico|nylon|ag)\b/],
  ['guitars', /\b(guitarras?|guitars?|gtr|eg)\b/],
  ['strings', /\b(cordas|strings?|violino|violinos|cello|orquestra)\b/],
  ['pad', /\b(pads?|ambiente|atmosfera|synth pad)\b/],
  ['keys', /\b(teclados?|keys|piano|rhodes|synth|sintetizador|organ|orgao)\b/],
  ['vocals', /\b(vozes|voz|vocals?|vox|bvs?|backing|coral|coro)\b/],
  ['fx', /\b(fx|efeitos?|sfx|riser|impacto)\b/]
];

export function inferStemType(fileName: string): StemType | null {
  const text = normalize(fileName);
  for (const [type, re] of STEM_RULES) if (re.test(text)) return type;
  return null;
}

const SECTION_RULES: [SectionType, RegExp][] = [
  ['pre-chorus', /\b(pre ?refrao|pre ?chorus|pre)\b/],
  ['chorus', /\b(refrao|chorus|coro)\b/],
  ['verse', /\b(verso|verse|estrofe)\b/],
  ['bridge', /\b(ponte|bridge)\b/],
  ['intro', /\b(intro|introducao)\b/],
  ['outro', /\b(final|outro|fim|ending)\b/],
  ['vamp', /\b(vamp|espontaneo|ministracao)\b/],
  ['interlude', /\b(interludio|interlude|instrumental|solo)\b/]
];

export function inferSectionType(name: string): SectionType {
  const text = normalize(name);
  for (const [type, re] of SECTION_RULES) if (re.test(text)) return type;
  return 'verse';
}
