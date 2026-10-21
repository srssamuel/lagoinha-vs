/**
 * ZipMultitrackExtractor — Extrator nativo de pacotes Multitrack .ZIP no navegador
 * (Zero dependências externas: usa DataView + File.slice() + DecompressionStream('deflate-raw') nativo).
 *
 * Suporta tanto leitura via Streaming de `Blob`/`File` (para pacotes .ZIP gigantes de 500MB+ sem estourar RAM)
 * quanto leitura direta de `ArrayBuffer`.
 * Extrai automaticamente Título, Artista/Versão, BPM, Tom Original, Duração real do WAV
 * e aplica regras estritas de Pitch Lock (Bateria, Loops, Click e Guia bloqueados contra mudança de tom).
 */

import { parseKeyFromName } from '../../domain/services/SongKeyDetector';

export interface ExtractedZipEntry {
  filename: string;
  data: ArrayBuffer;
  blob: Blob;
  durationSeconds?: number;
}

export interface ParsedMultitrackMetadata {
  title: string;
  artist: string;
  bpm: number;
  /** null = o nome não traz tom (nunca um valor padrão: analisar o áudio ou deixar sem tom). */
  originalKey: string | null;
  /** true = tom escrito no nome; false = nome sem tom (analisar o áudio). */
  keyFromName: boolean;
}

/** Tetos contra ZIP malicioso (zip bomb): contam os bytes reais descomprimidos, não o que o cabeçalho declara. */
export interface ZipExtractionLimits {
  maxAudioEntries: number;
  maxStemBytes: number;
  maxTotalBytes: number;
}

const MB = 1024 * 1024;

export class ZipMultitrackExtractor {
  /** Uma multitrack real tem 8–20 stems de 50–150 MB; os tetos deixam folga sem permitir estourar a RAM. */
  public static readonly LIMITS: ZipExtractionLimits = {
    maxAudioEntries: 64,
    maxStemBytes: 300 * MB,
    maxTotalBytes: 2048 * MB
  };

  private static assertEntryCount(count: number, limits: ZipExtractionLimits): void {
    if (count > limits.maxAudioEntries) {
      throw new Error(`Pacote .ZIP com ${count} faixas de áudio excede o limite de ${limits.maxAudioEntries}.`);
    }
  }

  private static assertWithinBytes(filename: string, bytes: number, budget: number, limits: ZipExtractionLimits): void {
    if (bytes > limits.maxStemBytes) {
      throw new Error(`A faixa "${filename}" excede ${Math.round(limits.maxStemBytes / MB)} MB descomprimida.`);
    }
    if (bytes > budget) {
      throw new Error(`O pacote .ZIP excede ${Math.round(limits.maxTotalBytes / MB)} MB descomprimidos no total.`);
    }
  }

  /** Corta a descompressão assim que os bytes reais passam do teto (o cabeçalho pode mentir o tamanho). */
  private static byteLimitStream(
    filename: string,
    budget: number,
    limits: ZipExtractionLimits
  ): TransformStream<Uint8Array, Uint8Array> {
    let seen = 0;
    return new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        ZipMultitrackExtractor.assertWithinBytes(filename, seen, budget, limits);
        controller.enqueue(chunk);
      }
    });
  }

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

    // Tom pelo nome. Sem tom no nome, o chamador analisa o áudio (keyFromName = false); nunca se assume um tom.
    const keyInName = parseKeyFromName(zipFilename);
    const originalKey = keyInName;

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
    if (keyInName) {
      // Remove o tom isolado entre hífens/sublinhados ("Titulo - F - 74 BPM") sem tocar em palavras do título
      const escaped = keyInName.replace('#', '\\#');
      title = title
        .replace(new RegExp(`\\s*[-–_]\\s*(?:tom\\s+)?${escaped}\\s*(?=[-–_]|$)`, 'i'), '')
        .replace(/[-–_]+\s*$/, '')
        .trim();
    }

    if (!title) {
      title = normalized;
    }

    return {
      title,
      artist,
      bpm,
      originalKey,
      keyFromName: keyInName !== null
    };
  }

  /**
   * Calcula a duração exata (em segundos) de um arquivo WAV lendo apenas os primeiros 256 bytes do cabeçalho RIFF.
   */
  public static parseWavDurationFromHeader(headerBuffer: ArrayBuffer, totalFileByteLength: number): number | undefined {
    if (headerBuffer.byteLength < 44) return undefined;
    const view = new DataView(headerBuffer);
    // Verifica "RIFF" (0x46464952 little-endian) e "WAVE" (0x45564157 little-endian)
    if (view.getUint32(0, true) !== 0x46464952 || view.getUint32(8, true) !== 0x45564157) {
      return undefined;
    }

    let offset = 12;
    let byteRate = 0;
    let dataSize = 0;

    while (offset + 8 <= headerBuffer.byteLength) {
      const chunkId = view.getUint32(offset, true);
      const chunkSize = view.getUint32(offset + 4, true);

      // "fmt " = 0x20746d66
      if (chunkId === 0x20746d66 && offset + 20 <= headerBuffer.byteLength) {
        byteRate = view.getUint32(offset + 16, true);
      }
      // "data" = 0x61746164
      if (chunkId === 0x61746164) {
        dataSize = chunkSize;
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (byteRate > 0) {
      const effectiveDataBytes = dataSize > 0 ? dataSize : Math.max(0, totalFileByteLength - 44);
      const secs = effectiveDataBytes / byteRate;
      if (secs > 1 && secs < 3600) {
        return Math.round(secs);
      }
    }
    return undefined;
  }

  /**
   * Extrai os stems de áudio de um arquivo `File` ou `Blob` .ZIP via Streaming (`Blob.slice()`),
   * suportando arquivos .ZIP grandes (400MB–1GB+) sem carregar o ZIP inteiro na memória de uma só vez.
   */
  public static async extractFromZipBlob(
    zipBlob: Blob,
    onProgress?: (current: number, total: number, currentFilename: string) => void,
    limits: ZipExtractionLimits = ZipMultitrackExtractor.LIMITS
  ): Promise<ExtractedZipEntry[]> {
    const fileSize = zipBlob.size;
    if (fileSize < 22) {
      throw new Error('Arquivo .ZIP vazio ou corrompido.');
    }

    // 1. Lê apenas os últimos 65 KB do arquivo para localizar o End of Central Directory (EOCD)
    const tailSize = Math.min(fileSize, 65557);
    const tailStart = fileSize - tailSize;
    const tailBuffer = await zipBlob.slice(tailStart, fileSize).arrayBuffer();
    const tailView = new DataView(tailBuffer);

    let eocdRelOffset = -1;
    for (let i = tailSize - 22; i >= 0; i--) {
      if (tailView.getUint32(i, true) === 0x06054b50) {
        eocdRelOffset = i;
        break;
      }
    }

    if (eocdRelOffset === -1) {
      throw new Error('Arquivo .ZIP inválido (assinatura Central Directory não encontrada).');
    }

    const totalEntries = tailView.getUint16(eocdRelOffset + 10, true);
    const centralDirSize = tailView.getUint32(eocdRelOffset + 12, true);
    const centralDirOffset = tailView.getUint32(eocdRelOffset + 16, true);

    // 2. Lê apenas o Central Directory
    const cdBuffer = await zipBlob
      .slice(centralDirOffset, centralDirOffset + centralDirSize)
      .arrayBuffer();
    const cdView = new DataView(cdBuffer);
    const cdBytes = new Uint8Array(cdBuffer);
    const utf8Decoder = new TextDecoder('utf-8');

    interface ZipCdItem {
      filename: string;
      compressionMethod: number;
      compressedSize: number;
      uncompressedSize: number;
      localHeaderOffset: number;
    }

    const audioEntries: ZipCdItem[] = [];
    let ptr = 0;

    for (let idx = 0; idx < totalEntries; idx++) {
      if (ptr + 46 > cdBuffer.byteLength) break;
      const sig = cdView.getUint32(ptr, true);
      if (sig !== 0x02014b50) break;

      const compressionMethod = cdView.getUint16(ptr + 10, true);
      const compressedSize = cdView.getUint32(ptr + 20, true);
      const uncompressedSize = cdView.getUint32(ptr + 24, true);
      const fileNameLen = cdView.getUint16(ptr + 28, true);
      const extraLen = cdView.getUint16(ptr + 30, true);
      const commentLen = cdView.getUint16(ptr + 32, true);
      const localHeaderOffset = cdView.getUint32(ptr + 42, true);

      const rawNameBytes = cdBytes.subarray(ptr + 46, ptr + 46 + fileNameLen);
      const fullPath = utf8Decoder.decode(rawNameBytes).normalize('NFC');
      const baseName = fullPath.split(/[/\\]/).pop() || fullPath;

      ptr += 46 + fileNameLen + extraLen + commentLen;

      if (
        fullPath.endsWith('/') ||
        fullPath.includes('__MACOSX') ||
        baseName.startsWith('._') ||
        !/\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(baseName)
      ) {
        continue;
      }

      audioEntries.push({
        filename: baseName,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset
      });
    }

    ZipMultitrackExtractor.assertEntryCount(audioEntries.length, limits);

    const results: ExtractedZipEntry[] = [];
    let totalBytes = 0;

    for (let i = 0; i < audioEntries.length; i++) {
      const item = audioEntries[i]!;
      onProgress?.(i + 1, audioEntries.length, item.filename);
      const budget = limits.maxTotalBytes - totalBytes;
      ZipMultitrackExtractor.assertWithinBytes(item.filename, item.uncompressedSize, budget, limits);

      // Lê os 30 bytes do Local File Header para saber onde começam os dados comprimidos
      const lhBuffer = await zipBlob
        .slice(item.localHeaderOffset, item.localHeaderOffset + 30)
        .arrayBuffer();
      if (lhBuffer.byteLength < 30) continue;
      const lhView = new DataView(lhBuffer);
      if (lhView.getUint32(0, true) !== 0x04034b50) continue;

      const localNameLen = lhView.getUint16(26, true);
      const localExtraLen = lhView.getUint16(28, true);
      const dataStart = item.localHeaderOffset + 30 + localNameLen + localExtraLen;
      const compressedBlob = zipBlob.slice(dataStart, dataStart + item.compressedSize);

      const mimeType = ZipMultitrackExtractor.getAudioMimeType(item.filename);
      let outBlob: Blob;

      if (item.compressionMethod === 0) {
        // Store (sem compressão) — reusa o slice direto do disco sem copiar RAM
        ZipMultitrackExtractor.assertWithinBytes(item.filename, compressedBlob.size, budget, limits);
        outBlob = new Blob([compressedBlob], { type: mimeType });
      } else if (item.compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
        // Deflate via Web Streams API
        const decompressedStream = compressedBlob
          .stream()
          .pipeThrough(new DecompressionStream('deflate-raw'))
          .pipeThrough(ZipMultitrackExtractor.byteLimitStream(item.filename, budget, limits));
        outBlob = await new Response(decompressedStream, {
          headers: { 'Content-Type': mimeType }
        }).blob();
      } else {
        continue;
      }
      totalBytes += outBlob.size;

      // Lê apenas os primeiros 256 bytes para detectar a duração se for WAV
      const headerSlice = await outBlob.slice(0, Math.min(256, outBlob.size)).arrayBuffer();
      const durationSeconds = ZipMultitrackExtractor.parseWavDurationFromHeader(
        headerSlice,
        outBlob.size
      );

      results.push({
        filename: item.filename,
        data: headerSlice,
        blob: outBlob,
        durationSeconds
      });
    }

    return results;
  }

  /**
   * Extrai arquivos de áudio (.wav, .mp3, .ogg, .flac, .m4a) de dentro de um `ArrayBuffer` .ZIP.
   */
  public static async extractAudioFiles(
    zipBuffer: ArrayBuffer,
    limits: ZipExtractionLimits = ZipMultitrackExtractor.LIMITS
  ): Promise<ExtractedZipEntry[]> {
    const view = new DataView(zipBuffer);
    const bytes = new Uint8Array(zipBuffer);

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
    let totalBytes = 0;

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
      const fullPath = utf8Decoder.decode(rawNameBytes).normalize('NFC');
      const filename = fullPath.split(/[/\\]/).pop() || fullPath;

      ptr += 46 + fileNameLen + extraLen + commentLen;

      if (
        fullPath.endsWith('/') ||
        fullPath.includes('__MACOSX') ||
        filename.startsWith('._') ||
        !/\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(filename)
      ) {
        continue;
      }

      if (localHeaderOffset + 30 > zipBuffer.byteLength) continue;
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const compressedSlice = bytes.subarray(dataStart, dataStart + compressedSize);
      const mimeType = ZipMultitrackExtractor.getAudioMimeType(filename);
      ZipMultitrackExtractor.assertEntryCount(results.length + 1, limits);
      const budget = limits.maxTotalBytes - totalBytes;

      if (compressionMethod === 0) {
        ZipMultitrackExtractor.assertWithinBytes(filename, compressedSlice.byteLength, budget, limits);
        totalBytes += compressedSlice.byteLength;
        const copy = new Uint8Array(compressedSlice.byteLength);
        copy.set(compressedSlice);
        const arrayBuf = copy.buffer;
        const blob = new Blob([arrayBuf], { type: mimeType });
        const durationSeconds = ZipMultitrackExtractor.parseWavDurationFromHeader(
          arrayBuf,
          arrayBuf.byteLength
        );
        results.push({ filename, data: arrayBuf, blob, durationSeconds });
      } else if (compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        // Se o teto cortar a descompressão, estas promessas rejeitam; o erro real chega pelo arrayBuffer().
        writer.write(new Uint8Array(compressedSlice)).catch(() => {});
        writer.close().catch(() => {});
        const decompressedResponse = new Response(
          ds.readable.pipeThrough(ZipMultitrackExtractor.byteLimitStream(filename, budget, limits))
        );
        const arrayBuf = await decompressedResponse.arrayBuffer();
        totalBytes += arrayBuf.byteLength;
        const blob = new Blob([arrayBuf], { type: mimeType });
        const durationSeconds = ZipMultitrackExtractor.parseWavDurationFromHeader(
          arrayBuf,
          arrayBuf.byteLength
        );
        results.push({ filename, data: arrayBuf, blob, durationSeconds });
      }
    }

    return results;
  }

  public static getAudioMimeType(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    if (lower.endsWith('.flac')) return 'audio/flac';
    if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/mp4';
    return 'audio/wav';
  }
}

