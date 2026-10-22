import type { PitchPolicy, StemType } from './TrackStem';

/**
 * Classificação de stems por NOME de arquivo (fonte única do Pitch Lock inicial).
 *
 * A política devolvida é só o PADRÃO. Ela é um dado do stem (`TrackStem.pitchPolicy`) e o músico pode
 * sobrescrevê-la por stem (`setPitchPolicy` / `togglePitchLock`; o estado persiste no IndexedDB).
 *
 * Decisões de palco (todas reversíveis pelo override):
 * - Travados (sem transposição): click, guia falada, bateria, percussão e loops percussivos.
 * - Transpostos: instrumentos harmônicos, pads, backing vocals e loops com instrumento tonal no nome.
 * - "Loop" sozinho/ambíguo: TRAVADO. Errar para travado deixa o loop no tom original (audível, corrigível pelo
 *   operador); errar para transposto estraga a afinação de um loop rítmico. Opção segura = travar.
 * - Stem misto (Band, Instrumental, Mix, Playback): TRANSPOSTO. A parte harmônica travada desafinaria a banda
 *   inteira; a bateria embutida sofre artefato do shifter granular (aceito). Sem tipo próprio: usa 'fx'.
 * - "Guia"/"Guide"/"Cues": travada. Não há como distinguir pelo nome uma guia falada de uma voz cantada de
 *   referência; a guia vai só para o IEM e falada é o caso comum.
 */

export type StemNameFamily =
  | 'click'
  | 'guide'
  | 'harmonic-loop'
  | 'percussive-loop'
  | 'ambiguous-loop'
  | 'drums'
  | 'bass'
  | 'acoustic-guitar'
  | 'electric-guitar'
  | 'pad'
  | 'keys'
  | 'vocals'
  | 'strings'
  | 'mixed'
  | 'unknown';

export interface StemNameClassification {
  family: StemNameFamily;
  type: StemType;
  policy: PitchPolicy;
  /** false quando nenhum termo conhecido foi encontrado (cai em fx travado). */
  matched: boolean;
}

const CLICK = new Set(['click', 'clicks', 'metronomo', 'metronome', 'clk']);
const GUIDE = new Set(['guia', 'guias', 'guide', 'guides', 'cue', 'cues', 'contagem', 'count', 'countin']);
const LOOP = new Set(['loop', 'loops']);
const DRUMS = new Set(['drum', 'drums', 'bateria', 'kit', 'snare', 'kick', 'hihat', 'hat', 'hats', 'clap', 'beat', 'beats', 'cajon', 'overhead', 'overheads', 'toms', // 'tom' sozinho fica de fora: em pt é tonalidade ("Pad Tom D")
 'cymbal', 'cymbals', 'ride', 'crash', 'prato', 'pratos']);
const PERC = new Set(['shaker', 'shakers', 'pandeiro', 'conga', 'congas', 'bongo', 'bongos']);
const BASS = new Set(['bass', 'baixo', 'contrabaixo', 'sub']);
const ACOUSTIC = new Set(['violao', 'acoustic', 'acustico', 'ag', 'nylon']);
const ELECTRIC = new Set(['eg', 'guitar', 'guitars', 'gtr', 'guitarra', 'electric']);
const PAD = new Set(['pad', 'pads', 'synth', 'synths', 'ambi', 'ambient', 'atmos', 'atmosphere']);
const KEYS = new Set(['key', 'keys', 'piano', 'ep', 'orgao', 'organ', 'rhodes', 'wurli', 'arp', 'arps']);
const VOCALS = new Set(['choir', 'coro', 'bgv', 'bgvs', 'bv', 'bvs', 'voz', 'vozes', 'vox']);
const STRINGS = new Set(['string', 'strings', 'corda', 'cordas', 'cello', 'violin', 'viola', 'orchestra', 'brass', 'sax', 'horns']);
const MIXED = new Set(['band', 'banda', 'instrumental', 'inst', 'instr', 'playback', 'mix', 'fullmix', 'bandmix']);
// Dica fraca: só vale se nada mais bateu (ex.: "Lead 1").
const WEAK_HARMONIC = new Set(['lead']);

function tokenize(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2') // KeysLoop -> Keys Loop (antes de baixar a caixa)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+|(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])/)
    .filter((t) => t.length > 0);
}

// Rede de segurança só para click/guia: nomes colados ("CLICKTRACK", "voiceguide") não viram token próprio.
// Falso positivo aqui é seguro (o stem trava e vai só para o IEM); falso negativo vaza click para o PA.
const CLICK_SUBSTR = /click|metronom|clk/;
const GUIDE_SUBSTR = /guia|guide|cues?(?![a-z])/;

const has = (tokens: string[], set: Set<string>) => tokens.some((t) => set.has(t));
const hasPrefix = (tokens: string[], prefixes: string[]) =>
  tokens.some((t) => prefixes.some((p) => t.startsWith(p)));

export function classifyStemName(name: string): StemNameClassification {
  const t = tokenize(name);
  const r = (family: StemNameFamily, type: StemType, policy: PitchPolicy): StemNameClassification => ({
    family,
    type,
    policy,
    matched: family !== 'unknown',
  });

  const joined = t.join('');
  if (has(t, CLICK) || CLICK_SUBSTR.test(joined)) return r('click', 'click', 'locked');
  if (has(t, GUIDE) || GUIDE_SUBSTR.test(joined)) return r('guide', 'guide', 'locked');

  const isVocal = hasPrefix(t, ['voc']) || has(t, VOCALS);
  const harmonic: StemNameClassification | null = has(t, BASS)
    ? r('bass', 'bass', 'harmonic')
    : has(t, ACOUSTIC)
      ? r('acoustic-guitar', 'violao', 'harmonic')
      : has(t, ELECTRIC)
        ? r('electric-guitar', 'guitars', 'harmonic')
        : has(t, PAD)
          ? r('pad', 'pad', 'harmonic')
          : has(t, KEYS)
            ? r('keys', 'keys', 'harmonic')
            : isVocal
              ? r('vocals', 'vocals', 'harmonic')
              : has(t, STRINGS)
                ? r('strings', 'strings', 'harmonic')
                : null;

  if (has(t, LOOP)) {
    // Bateria/percussão no nome vence o instrumento ("Bass Drum Loop", "Acoustic Drum Loop" travam);
    // loop com instrumento tonal transpõe; ambíguo trava.
    if (hasPrefix(t, ['perc', 'tamb']) || has(t, PERC) || has(t, DRUMS)) {
      return r('percussive-loop', 'loop', 'percussive');
    }
    if (harmonic) {
      const type: StemType = harmonic.type === 'pad' ? 'keys' : harmonic.type;
      return r('harmonic-loop', type, 'harmonic');
    }
    return r('ambiguous-loop', 'loop', 'percussive');
  }

  if (hasPrefix(t, ['perc', 'tamb']) || has(t, PERC)) return r('percussive-loop', 'loop', 'percussive');
  if (has(t, DRUMS)) return r('drums', 'drums', 'percussive');
  if (harmonic) return harmonic;
  if (has(t, MIXED)) return r('mixed', 'fx', 'harmonic');
  if (has(t, WEAK_HARMONIC)) return r('keys', 'keys', 'harmonic');
  return r('unknown', 'fx', 'percussive');
}
