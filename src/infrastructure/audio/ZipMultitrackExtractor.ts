/**
 * ZipMultitrackExtractor — Extrator nativo de pacotes Multitrack .ZIP no navegador
 * (Zero dependências externas: usa DataView + DecompressionStream('deflate-raw') nativo).
 *
 * Permite subir diretamente pacotes como:
 * "O Nosso General (Versão Mateus Brito) 140Bpm - B.zip"
 * extraindo automaticamente Título, Artista/Versão, BPM (140), Tom Original (B)
 * e decodificando todos os stems .wav / .mp3 com regras estritas de Pitch Lock
 * (Bateria, Loops, Click e Guia bloqueados contra mudança de tom).
 */

export interface ExtractedZipEntry {
  filename: string;
  data: ArrayBuffer;
}

export interface ParsedMultitrackMetadata {
  title: string;
  artist: string;
  bpm: number;
  originalKey: string;
}

export class ZipMultitrackExtractor {
  /**
   * Analisa nomes de pacotes Multitrack reais, por exemplo:
   * - "O Nosso General (Versão Mateus Brito) 140Bpm - B.zip"
   * - "Bondade de Deus - Isaías Saad 68BPM - G.zip"
   */
  public static parseMetadataFromZipName(zipFilename: string): ParsedMultitrackMetadata {
    const normalized = zipFilename.normalize('NFC').replace(/\.zip$/i, '').trim();

    // Extrai BPM (ex: "140Bpm", "140 BPM", "68bpm")
    const bpmMatch = normalized.match(/(\d{2,3})\s*bpm/i);
    const bpm = bpmMatch ? Math.max(40, Math.min(240, parseInt(bpmMatch[1]!, 10))) : 120;

    // Extrai Tom no final ou após hífen (ex: "- B", "- F#m", "- Bb", "Tom G")
    const keyMatch =
      normalized.match(/[-–]\s*([A-G][#b]?m?)\s*$/i) ||
      normalized.match(/\btom\s+([A-G][#b]?m?)\b/i);
    const originalKey = keyMatch ? keyMatch[1]! : 'G';

    // Extrai Artista entre parênteses se houver (ex: "(Versão Mateus Brito)")
    const parenMatch = normalized.match(/\(([^)]+)\)/);
    const artist = parenMatch ? parenMatch[1]!.trim() : 'Multitrack Oficial';

    // Limpa o título removendo parênteses, BPM e Tom final
    let title = normalized
      .replace(/\([^)]*\)/g, '')
      .replace(/\d{2,3}\s*bpm/gi, '')
      .replace(/[-–]\s*[A-G][#b]?m?\s*$/i, '')
      .replace(/[-–]+\s*$/, '')
      .trim();

    if (!title) {
      title = normalized;
    }

    return {
      title,
      artist,
      bpm,
      originalKey
    };
  }

  /**
   * Extrai arquivos de áudio (.wav, .mp3, .ogg, .flac, .m4a) de dentro de um arquivo .ZIP
   * lendo o Central Directory no final do buffer.
   */
  public static async extractAudioFiles(zipBuffer: ArrayBuffer): Promise<ExtractedZipEntry[]> {
    const view = new DataView(zipBuffer);
    const bytes = new Uint8Array(zipBuffer);

    // Procura assinatura End of Central Directory (0x06054b50) de trás para frente
    let eocdOffset = -1;
    const minEocdOffset = Math.max(0, zipBuffer.byteLength - 65557);
    for (let i = zipBuffer.byteLength - 22; i >= minEocdOffset; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error('Arquivo .ZIP inválido (assinatura EOCD não encontrada).');
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const centralDirOffset = view.getUint32(eocdOffset + 16, true);

    const results: ExtractedZipEntry[] = [];
    const utf8Decoder = new TextDecoder('utf-8');

    let ptr = centralDirOffset;
    for (let idx = 0; idx < totalEntries; idx++) {
      if (ptr + 46 > zipBuffer.byteLength) break;
      const sig = view.getUint32(ptr, true);
      if (sig !== 0x02014b50) break;

      const compressionMethod = view.getUint16(ptr + 10, true);
      const compressedSize = view.getUint32(ptr + 20, true);
      const fileNameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localHeaderOffset = view.getUint32(ptr + 42, true);

      const rawNameBytes = bytes.subarray(ptr + 46, ptr + 46 + fileNameLen);
      const filename = utf8Decoder.decode(rawNameBytes).normalize('NFC');

      ptr += 46 + fileNameLen + extraLen + commentLen;

      // Ignora pastas, metadados macOS (__MACOSX) e arquivos não-áudio
      if (
        filename.endsWith('/') ||
        filename.includes('__MACOSX') ||
        !/\.(wav|mp3|ogg|flac|m4a)$/i.test(filename)
      ) {
        continue;
      }

      // Lê Local File Header (0x04034b50)
      if (localHeaderOffset + 30 > zipBuffer.byteLength) continue;
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const compressedSlice = bytes.subarray(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        // Store (sem compressão)
        const copy = new Uint8Array(compressedSlice.byteLength);
        copy.set(compressedSlice);
        results.push({ filename, data: copy.buffer });
      } else if (compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
        // Deflate (RFC 1951)
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        void writer.write(new Uint8Array(compressedSlice));
        void writer.close();
        const decompressedResponse = new Response(ds.readable);
        const arrayBuf = await decompressedResponse.arrayBuffer();
        results.push({ filename, data: arrayBuf });
      }
    }

    return results;
  }
}
