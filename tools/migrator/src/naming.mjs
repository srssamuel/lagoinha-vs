// Deducoes a partir de nomes: tipo de stem (StemType do app) e titulo/bpm/tom de pastas de musica.
// Espelha a ordem de decisao de TrackStem.classifyStemFromFilename, mas por tokens (sem casar "ag"/"ep" dentro de palavras).

/** @typedef {'click'|'guide'|'drums'|'loop'|'bass'|'violao'|'guitars'|'strings'|'keys'|'pad'|'vocals'|'fx'} StemType */

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function tokensOf(name) {
  const base = name.replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const toks = strip(base)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  // "eg1", "click110", "gt2": o sufixo numerico nao muda o instrumento
  return [...new Set(toks.flatMap((t) => (/^[a-z]+\d+$/.test(t) ? [t, t.replace(/\d+$/, '')] : [t])))];
}

const has = (toks, ...words) => toks.some((t) => words.includes(t));
const startsWithAny = (toks, ...prefixes) => toks.some((t) => prefixes.some((p) => t.startsWith(p)));

/**
 * @returns {{type: StemType, source: 'name'|'fallback'}}
 */
export function classifyStemName(name) {
  const t = tokensOf(name);
  const name_ = (type) => ({ type, source: 'name' });
  if (has(t, 'click', 'metronomo', 'metronome') || t.some((x) => x.startsWith('click') && x.length > 5)) return name_('click');
  if (has(t, 'guide', 'guia', 'guilde', 'cue', 'cues', 'contagem', 'count')) return name_('guide');
  if (has(t, 'fx', 'efx', 'sfx', 'sweep', 'impact', 'riser', 'reverse', 'noise', 'glowstick', 'boom', 'transicao', 'transition', 'efect', 'effect')) return name_('fx');
  const loop = has(t, 'loop', 'loops');
  if (loop && has(t, 'key', 'keys', 'piano', 'synth', 'pad', 'rhodes', 'arp')) return name_('keys');
  if (loop && (has(t, 'guitar', 'gtr', 'gt', 'violao') || startsWithAny(t, 'guitarra'))) return name_('guitars');
  if (
    loop ||
    has(t, 'perc', 'percu', 'prcu', 'percussion', 'percussao', 'shaker', 'shake', 'tamb', 'tambourine', 'tambores', 'conga', 'bongo', 'cajon', 'chocalho', 'pandeirola', 'pandeiro')
  ) return name_('loop');
  if (
    has(t, 'drum', 'drums', 'bateria', 'batera', 'kit', 'kick', 'kik', 'snare', 'caixa', 'hihat', 'clap', 'toms') ||
    startsWithAny(t, 'drum', 'auxdrum', 'claplong', 'kikrev') ||
    (has(t, '808') && has(t, 'hat', 'hihat', 'kick', 'snare', 'clap'))
  ) return name_('drums');
  if (has(t, 'bass', 'baixo', 'contrabaixo', 'sub') || t.some((x) => /^(synt|synth)?bas[es]?$/.test(x))) return name_('bass');
  if (has(t, 'violao', 'ag', 'ac', 'acg', 'acoustic', 'acustico') || startsWithAny(t, 'violao')) return name_('violao');
  if (has(t, 'eg', 'gt', 'gtr', 'gtrs', 'guita', 'guitar', 'guitars', 'guitarra', 'guitarras', 'electric') || startsWithAny(t, 'guitarra') || t.some((x) => /^eg(base|lead|solo|group)$/.test(x))) return name_('guitars');
  if (has(t, 'pad', 'pads', 'synth', 'synt', 'synths', 'ambient', 'ambients', 'ambi', 'atmos', 'atmosphere', 'moog', 'pluck', 'arp', 'arpg', 'sy', 'textura', 'texture', 'tesynth')) return name_('pad');
  if (has(t, 'key', 'keys', 'piano', 'ep', 'organ', 'orgao', 'rhodes', 'wurli', 'hammond', 'celesta', 'teclas', 'teclado')) return name_('keys');
  if (
    has(t, 'vocal', 'vocals', 'voc', 'vox', 'voz', 'vl', 'bgv', 'bgvs', 'bv', 'bvs', 'choir', 'coro', 'backing', 'soprano', 'alto', 'tenor', 'leadvocal', 'mutevoz') ||
    t.some((x) => x.length <= 12 && (x.includes('vocal') || x.endsWith('voz')))
  ) return name_('vocals');
  if (startsWithAny(t, 'string', 'strring') || has(t, 'strings', 'cordas', 'corda', 'cello', 'violin', 'viola')) return name_('strings');
  return { type: 'fx', source: 'fallback' };
}

const GENERIC_RE = /^(multi-?tracks?( em wav)?|wavs?|mp3s?|mp3 wav|wav mp3|stems?|audios?|tracks|nova pasta|samples|imported|processed|project|projeto|bounces?|media|files|ableton project info)$/;
export const isGenericDir = (name) => GENERIC_RE.test(strip(name).trim().replace(/\s+/g, ' '));

const KEY_RE = /^[A-G](?:#|b)?m?$/;
const BPM_RES = [/(\d{2,3}(?:[.,]\d+)?)\s*bpm/i, /bpm\s*[:\-_ ]?\s*(\d{2,3}(?:[.,]\d+)?)/i];
const upperFirst = (k) => k[0].toUpperCase() + k.slice(1);

/**
 * Deduz titulo/bpm/tom do nome de uma pasta de musica (ou de um zip). Campos nao encontrados ficam vazios.
 * Com bpm E tom no nome (padrao "Titulo-Album-Tom-BPM"), o titulo e o primeiro segmento; senao, o nome limpo inteiro
 * (nao ha como saber se o primeiro segmento e titulo ou artista).
 * @returns {{title:string, bpm:number|null, key:string|null, artist:string, notes:string[]}}
 */
export function parseSongName(rawName) {
  const notes = [];
  let s = rawName.replace(/\.(zip|rar|7z)$/i, '').normalize('NFC');
  s = s.replace(/^\s*\d{1,3}\s*[.\-)]\s*/, '');
  s = s.replace(/^\s*multi-?tracks?\s*[-:_ ]+\s*/i, '');
  // bpm
  let bpm = null;
  for (const re of BPM_RES) {
    const m = re.exec(s);
    if (m) {
      const v = Number(m[1].replace(',', '.'));
      if (v >= 40 && v <= 240) {
        bpm = v;
        s = s.replace(m[0], ' ');
        break;
      }
    }
  }
  // tom: "Tom X" / "Key X"
  let key = null;
  const tom = /(?:^|[\s_\-(])(?:tom|key)[\s_:\-]*([A-G](?:#|b)?m?)(?![A-Za-z])/i.exec(s);
  if (tom) {
    key = upperFirst(tom[1]);
    s = s.replace(tom[0], ' ');
  }
  if (!key) {
    // segmentos entre hifens/parenteses: o ultimo que e so um tom (o primeiro so conta se houver 3+ segmentos)
    const parts = s.split(/\s*[-–]\s*|[()]/);
    for (let i = parts.length - 1; i >= (parts.length > 2 ? 0 : 1); i--) {
      const seg = parts[i].trim().replace(/^_+|_+$/g, '');
      if (KEY_RE.test(seg)) {
        key = seg;
        parts.splice(i, 1);
        s = parts.join(' - ');
        break;
      }
    }
  }
  if (!key && bpm !== null) {
    // tom solto no fim (depois de remover o bpm): "... 100 F", "..._135 bpm_G", "..._D_72bpm"
    const tail = /(?:^|[\s_\-])([A-G](?:#|b)?m?)[\s_\-]*$/.exec(s);
    if (tail && tail.index > 0) {
      key = tail[1];
      s = s.slice(0, tail.index);
    }
  }
  if (key) key = upperFirst(key);
  const cleaned = s.replace(/_/g, ' ').replace(/\s+/g, ' ');
  const segs = cleaned
    .split(/\s+[-–]\s+|[-–](?=\S)|(?<=\S)[-–]\s/)
    .map((x) => x.replace(/^[\s_\-–]+|[\s_\-–]+$/g, ''))
    .filter((x) => x && !/^multi-?tracks?$/i.test(x));
  let title;
  if (bpm !== null && key && segs.length > 0) title = segs[0];
  else title = segs.join(' - ');
  if (bpm !== null && key && segs.length > 1) notes.push(`segmentos extras no nome: ${segs.length - 1}`);
  return { title: title.trim(), bpm, key, artist: '', notes };
}

/** Compasso nao aparece em nomes; fica vazio e a musica fica pendente (decisao nao e tomada por chute). */
export const timeSignatureFromName = () => null;
