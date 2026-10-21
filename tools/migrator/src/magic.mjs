// Deteccao do formato real pelos bytes iniciais (nunca pela extensao nem pelo mime de origem).

const ascii = (b, from, to) => b.toString('latin1', from, to);

/**
 * @param {Buffer} b primeiros bytes do arquivo (64 bastam)
 * @returns {{format:string, mime:string, kind:'audio'|'archive'|'image'|'document'|'text'|'binary'|'empty'}}
 */
export function detectFormat(b, { ext = '' } = {}) {
  if (!b || b.length === 0) return { format: 'empty', mime: 'application/x-empty', kind: 'empty' };
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE') return { format: 'wav', mime: 'audio/wav', kind: 'audio' };
  if (b.length >= 12 && ascii(b, 0, 4) === 'FORM' && ['AIFF', 'AIFC'].includes(ascii(b, 8, 12))) return { format: 'aiff', mime: 'audio/aiff', kind: 'audio' };
  if (b.length >= 4 && ascii(b, 0, 4) === 'fLaC') return { format: 'flac', mime: 'audio/flac', kind: 'audio' };
  if (b.length >= 4 && ascii(b, 0, 4) === 'OggS') return { format: 'ogg', mime: 'audio/ogg', kind: 'audio' };
  if (b.length >= 3 && ascii(b, 0, 3) === 'ID3') return { format: 'mp3', mime: 'audio/mpeg', kind: 'audio' };
  if (b.length >= 8 && ascii(b, 4, 8) === 'ftyp') {
    const brand = ascii(b, 8, 12);
    if (['M4A ', 'M4B ', 'M4P '].includes(brand)) return { format: 'm4a', mime: 'audio/mp4', kind: 'audio' };
    // .m4a gravado como MP4 generico (mp42/isom): o brand nao diz se ha video; a extensao desempata
    if (['m4a', 'm4b', 'aac'].includes(String(ext).toLowerCase())) return { format: 'm4a', mime: 'audio/mp4', kind: 'audio' };
    return { format: 'mp4', mime: 'video/mp4', kind: 'binary' };
  }
  if (b.length >= 16 && b.readUInt32BE(0) === 0x3026b275 && b.readUInt32BE(4) === 0x8e66cf11) return { format: 'wma', mime: 'audio/x-ms-wma', kind: 'audio' };
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7) && (b[3] === 4 || b[3] === 6 || b[3] === 8)) return { format: 'zip', mime: 'application/zip', kind: 'archive' };
  if (b.length >= 6 && ascii(b, 0, 6) === 'Rar!\x1a\x07') return { format: 'rar', mime: 'application/vnd.rar', kind: 'archive' };
  if (b.length >= 6 && b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf) return { format: '7z', mime: 'application/x-7z-compressed', kind: 'archive' };
  if (b.length >= 8 && b[0] === 0 && b[1] === 5 && b[2] === 0x16 && (b[3] === 7 || b[3] === 0)) return { format: 'appledouble', mime: 'application/applefile', kind: 'binary' };
  if (b.length >= 3 && b[0] === 0x1f && b[1] === 0x8b) return { format: 'gzip', mime: 'application/gzip', kind: 'archive' };
  if (b.length >= 4 && ascii(b, 0, 4) === '%PDF') return { format: 'pdf', mime: 'application/pdf', kind: 'document' };
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return { format: 'png', mime: 'image/png', kind: 'image' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { format: 'jpeg', mime: 'image/jpeg', kind: 'image' };
  if (b.length >= 4 && ascii(b, 0, 3) === 'GIF') return { format: 'gif', mime: 'image/gif', kind: 'image' };
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return { format: 'ico', mime: 'image/x-icon', kind: 'image' };
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return { format: 'ole2', mime: 'application/x-ole-storage', kind: 'binary' };
  // MPEG audio sem tag: sincronismo de quadro (11 bits 1) e versao/camada validas
  if (b.length >= 4 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 3) & 3) !== 1 && ((b[1] >> 1) & 3) !== 0) {
    return { format: 'mp3', mime: 'audio/mpeg', kind: 'audio' };
  }
  // Texto: sem NUL e quase todo imprimivel (BOM UTF-8/16 aceitos)
  const t = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b;
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return { format: 'text', mime: 'text/plain', kind: 'text' };
  if (t.length > 0 && !t.includes(0)) {
    let ok = 0;
    for (const c of t) if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 128) ok++;
    if (ok / t.length > 0.95) return { format: 'text', mime: 'text/plain', kind: 'text' };
  }
  return { format: 'binary', mime: 'application/octet-stream', kind: 'binary' };
}

const EXT_FORMAT = {
  wav: 'wav', wave: 'wav', aif: 'aiff', aiff: 'aiff', flac: 'flac', ogg: 'ogg', mp3: 'mp3', m4a: 'm4a',
  wma: 'wma', zip: 'zip', rar: 'rar', '7z': '7z', gz: 'gzip', pdf: 'pdf', png: 'png', jpg: 'jpeg', jpeg: 'jpeg',
  gif: 'gif', ico: 'ico', txt: 'text', url: 'text', json: 'text', als: 'gzip',
};

/** Formato que a extensao promete (vazio quando a extensao nao diz nada util sobre os bytes). */
export function formatFromExtension(ext) {
  return EXT_FORMAT[String(ext ?? '').toLowerCase()] ?? null;
}

/** Divergencias entre extensao, mime de origem e formato real. */
export function describeMismatch({ ext, mimeSource, real }) {
  const out = [];
  const promised = formatFromExtension(ext);
  if (promised && promised !== real.format && !(promised === 'text' && real.format === 'text')) out.push(`ext:${ext}!=real:${real.format}`);
  if (!ext && real.kind === 'archive') out.push('sem-extensao:' + real.format);
  if (mimeSource && real.mime && mimeSource.toLowerCase() !== real.mime) {
    const normalized = (m) => m.toLowerCase().replace('x-wav', 'wav').replace('audio/x-', 'audio/').replace('application/x-', 'application/');
    if (normalized(mimeSource) !== normalized(real.mime) && !(real.format === 'mp3' && /mpeg|mp3/.test(mimeSource))) {
      out.push(`mime:${mimeSource}!=real:${real.mime}`);
    }
  }
  return out;
}
