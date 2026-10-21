import type { StemType } from '../entities/TrackStem';

/**
 * Identificação do tom de uma multitrack.
 *
 * 1. Nome do pacote/pasta (mesmas regras do migrador do acervo, `tools/migrator/src/naming.mjs`):
 *    "Rei do meu Coração - G - 68 BPM", "A_Casa_E_Sua_130BPM_Tom_G", "Algo Novo-Algo Novo-D-60.00bpm",
 *    "MULTITRACKS ALIANCA DE AMOR BPM 100 F", "Hino_F_72bpm", "Bondade de Deus (F)".
 * 2. Sem tom no nome: análise do áudio (cromagrama + perfis de Krumhansl-Schmuckler) só dos stems
 *    tonais — Click, Guia, Bateria, Loop e FX ficam fora para não contaminar o cromagrama.
 */

const BPM_RES = [/(\d{2,3}(?:[.,]\d+)?)\s*bpm/i, /bpm\s*[:\-_ ]?\s*(\d{2,3}(?:[.,]\d+)?)/i];
/** Marca onde estava o BPM: o tom do nome costuma vir colado nele ("... F 72bpm", "BPM 100 F"). */
const BPM_MARK = '\u0001';
/** Separadores fortes: dividem o nome em segmentos. Espaço e sublinhado só dividem em palavras. */
const HARD_SEPARATORS = /[-–—()[\]{}|｜]+/;

const SOLFEGE: Record<string, string> = { do: 'C', dó: 'C', re: 'D', ré: 'D', mi: 'E', fa: 'F', fá: 'F', sol: 'G', la: 'A', lá: 'A', si: 'B' };

/**
 * Gramática de um tom escrito: letra MAIÚSCULA A-G (ou solfejo capitalizado, só depois de "Tom"),
 * acidente (# b ♯ ♭ "sustenido" "bemol") e modo (m, min, minor, menor; maior/major/maj = maior).
 * Letras dentro de palavras ("Deus", "Abba") nunca casam: o tom é sempre um token inteiro.
 */
const KEY_BODY =
  '(?:([A-G])|(Do|Dó|Re|Ré|Mi|Fa|Fá|Sol|La|Lá|Si))' + // 1 = letra, 2 = solfejo
  '(?:\\s?(#|b|♯|♭|sustenido|bemol))?' + // 3 = acidente
  '(?:\\s?(maior|major|maj|menor|minor|min|m)(?![\\p{L}]))?'; // 4 = modo
const KEY_ONLY = new RegExp(`^${KEY_BODY}$`, 'u');
const KEY_AFTER_TOM = new RegExp(`(?:^|[\\s_\\-(\\[:])(?:[Tt]om|TOM|[Kk]ey|KEY|[Tt]onalidade)[\\s_:\\-]*${KEY_BODY}(?![\\p{L}\\d#])`, 'gu');

function buildKey(m: RegExpExecArray | RegExpMatchArray, allowSolfege: boolean): string | null {
  const letter = m[1] ?? (allowSolfege && m[2] ? SOLFEGE[m[2].toLowerCase()] : undefined);
  if (!letter) return null;
  const acc = m[3];
  const accidental = acc === '#' || acc === '♯' || acc === 'sustenido' ? '#' : acc ? 'b' : '';
  const mode = m[4];
  const minor = mode === 'm' || mode === 'min' || mode === 'minor' || mode === 'menor';
  return `${letter}${accidental}${minor ? 'm' : ''}`;
}

/** Tom que ocupa o texto inteiro (uma palavra ou "F# menor"), ou null. */
function wholeKey(text: string, allowSolfege = false): string | null {
  const m = KEY_ONLY.exec(text.trim());
  return m ? buildKey(m, allowSolfege) : null;
}

/** Tom escrito no nome (ou null se o nome não traz tom, ou traz tons que se contradizem). */
export function parseKeyFromName(rawName: string): string | null {
  let s = rawName.replace(/\.(zip|rar|7z)$/i, '').normalize('NFC');
  s = s.replace(/^\s*\d{1,3}\s*[.\-)]\s*/, '');
  s = s.replace(/^\s*multi-?tracks?\s*[-:_ ]+\s*/i, '');

  for (const re of BPM_RES) {
    const m = re.exec(s);
    if (m) {
      const v = Number(m[1]!.replace(',', '.'));
      if (v >= 40 && v <= 240) {
        s = s.replace(m[0], ` ${BPM_MARK} `);
        break;
      }
    }
  }

  const found = new Set<string>();

  // 1. "Tom X" / "Key X" / "Tonalidade X" (aceita solfejo: "Tom Sol maior")
  for (const m of s.matchAll(KEY_AFTER_TOM)) {
    const key = buildKey(m, true);
    if (key) found.add(key);
  }

  // 2. Segmentos entre separadores fortes: o segmento inteiro é um tom ("- F -", "(F)", "- F# menor")
  //    No fim do nome, ou no meio com 3+ segmentos (o primeiro segmento é o título).
  const segments = s.split(HARD_SEPARATORS).map((seg) => seg.replace(/_+/g, ' ').trim()).filter(Boolean);
  segments.forEach((seg, i) => {
    const content = seg.replace(BPM_MARK, '').trim();
    const key = content === seg ? wholeKey(seg) : null;
    const isEnd = i === segments.length - 1;
    const leadingKey = i === 0 && /^multi-?tracks?\b/i.test(segments[1] ?? ''); // "C - Multitrack - Titulo"
    if (key && (isEnd || (i > 0 && segments.length > 2) || leadingKey)) found.add(key);
    // 3. Tom colado ao BPM dentro do segmento ("F 72bpm", "Gb 62.00bpm", "BPM 100 F", "..._135 bpm_G")
    const tokens = seg.split(/\s+/);
    const at = tokens.indexOf(BPM_MARK);
    if (at >= 0) {
      const before = at > 0 ? wholeKey(tokens[at - 1]!) : null;
      if (before) found.add(before);
      const after = tokens.length === at + 2 && isEnd ? wholeKey(tokens[at + 1]!) : null;
      if (after) found.add(after);
    }
  });

  return found.size === 1 ? [...found][0]! : null;
}
/** Stems que entram na análise de tom (os demais não têm altura definida ou não seguem a harmonia). */
export function isTonalStemForKeyDetection(type: StemType): boolean {
  return !['click', 'guide', 'drums', 'loop', 'fx'].includes(type);
}

const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
// Krumhansl & Kessler (1982), índice 0 = tônica
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Abaixo disso o cromagrama não se parece com nenhum tom: não afirmar nada. */
export const MIN_CORRELATION = 0.5;
/**
 * Candidatos a menos de AMBIGUITY_MARGIN (diferença de correlação de Pearson) do melhor são "próximos":
 * a análise não escolhe entre eles. Inclui maior x relativo menor (G x Em) — o erro clássico do método.
 */
export const AMBIGUITY_MARGIN = 0.05;
const MAX_CANDIDATES = 3;
export interface KeyEstimate {
  key: string;
  /** Correlação de Pearson do cromagrama com o perfil vencedor (-1..1). */
  correlation: number;
  /** Diferença para o segundo colocado. Pontuação interna: não é porcentagem de certeza e não vai para a UI. */
  margin: number;
  /** Tons a menos de AMBIGUITY_MARGIN do melhor (inclui o melhor), do mais ao menos correlacionado. */
  candidates: string[];
  /** Mais de um candidato próximo: a análise não escolhe. */
  ambiguous: boolean;
  /** Os 5 melhores tons com a correlação (diagnóstico e medição; não vai para a UI). */
  ranking?: { key: string; r: number }[];
  chroma: number[];
}

const ANALYSIS_RATE = 11025;
const FRAME = 4096;
const MIN_HZ = 60;
const MAX_HZ = 2100;

function fftMagnitudes(re: Float64Array): Float64Array {
  const n = re.length;
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const t = re[i]!;
      re[i] = re[j]!;
      re[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b]! * cr - im[b]! * ci;
        const xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k]!, im[k]!);
  return mag;
}

/** Cromagrama (12 classes, C = 0, referência A4 = 440 Hz) de um sinal mono. */
export function computeChroma(
  samples: Float32Array,
  sampleRate: number,
  onProgress?: (fraction: number) => void
): number[] {
  const factor = Math.max(1, Math.round(sampleRate / ANALYSIS_RATE));
  const rate = sampleRate / factor;
  const length = Math.floor(samples.length / factor);
  const mono = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    let acc = 0;
    for (let k = 0; k < factor; k++) acc += samples[i * factor + k]!;
    mono[i] = acc / factor;
  }

  const window = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));

  // Mapa bin -> classe de altura (só bins perto do centro de um semitom)
  const binPc = new Int8Array(FRAME / 2).fill(-1);
  for (let k = 1; k < FRAME / 2; k++) {
    const hz = (k * rate) / FRAME;
    if (hz < MIN_HZ || hz > MAX_HZ) continue;
    const midi = 69 + 12 * Math.log2(hz / 440);
    const nearest = Math.round(midi);
    if (Math.abs(midi - nearest) > 0.4) continue;
    binPc[k] = ((nearest % 12) + 12) % 12;
  }

  const chroma = new Array<number>(12).fill(0);
  const frame = new Float64Array(FRAME);
  for (let start = 0; start + FRAME <= length; start += FRAME / 2) {
    let energy = 0;
    for (let i = 0; i < FRAME; i++) {
      const v = mono[start + i]!;
      energy += v * v;
      frame[i] = v * window[i]!;
    }
    if (start % (FRAME * 64) === 0) onProgress?.(length > 0 ? start / length : 1);
    if (energy / FRAME < 1e-7) continue; // silêncio
    const mag = fftMagnitudes(frame);
    const local = new Array<number>(12).fill(0);
    for (let k = 1; k < mag.length; k++) {
      const pc = binPc[k]!;
      if (pc >= 0) local[pc]! += mag[k]!;
    }
    const total = local.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    for (let pc = 0; pc < 12; pc++) chroma[pc]! += local[pc]! / total; // cada janela pesa igual
  }
  return chroma;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** Tom por Krumhansl-Schmuckler a partir de um cromagrama (C = 0). */
export function estimateKeyFromChroma(chroma: number[]): KeyEstimate | null {
  if (chroma.every((v) => v === 0)) return null;
  const scores: { key: string; r: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotate = (profile: number[]) => chroma.map((_, pc) => profile[(pc - tonic + 12) % 12]!);
    scores.push({ key: MAJOR_NAMES[tonic]!, r: pearson(chroma, rotate(KK_MAJOR)) });
    scores.push({ key: MINOR_NAMES[tonic]!, r: pearson(chroma, rotate(KK_MINOR)) });
  }
  scores.sort((x, y) => y.r - x.r);
  const best = scores[0]!;
  const candidates = scores
    .filter((s) => best.r - s.r < AMBIGUITY_MARGIN)
    .slice(0, MAX_CANDIDATES)
    .map((s) => s.key);
  return {
    key: best.key,
    correlation: best.r,
    margin: best.r - scores[1]!.r,
    candidates,
    ambiguous: candidates.length > 1,
    ranking: scores.slice(0, 5).map((s) => ({ key: s.key, r: Number(s.r.toFixed(4)) })),
    chroma
  };
}
/** Tom de um sinal mono (mixdown dos stems tonais). */
export function detectKeyFromPcm(
  samples: Float32Array,
  sampleRate: number,
  onProgress?: (fraction: number) => void
): KeyEstimate | null {
  return estimateKeyFromChroma(computeChroma(samples, sampleRate, onProgress));
}




