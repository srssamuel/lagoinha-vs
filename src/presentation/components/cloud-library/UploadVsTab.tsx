import React, { useState } from 'react';
import { HardDrive } from 'lucide-react';
import { ZipMultitrackExtractor } from '../../../infrastructure/audio/ZipMultitrackExtractor';
import { detectKeyFromStems } from '../../../infrastructure/audio/AudioKeyAnalyzer';
import { TrackStem } from '../../../domain/entities/TrackStem';

export interface VsUploadDraft {
  title: string;
  artist: string;
  originalKey: string;
  bpm: number;
  duration: number;
  files: File[];
}

const isZipFile = (f: File) =>
  f.name.toLowerCase().endsWith('.zip') || f.type === 'application/zip' || f.type === 'application/x-zip-compressed';

/**
 * Estado do formulário "Subir Novo VS". Vive no modal (não na aba) para que
 * trocar de aba não apague o que o operador já preencheu.
 */
export function useVsUploadForm() {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [originalKey, setOriginalKey] = useState('B');
  const [bpm, setBpm] = useState(140);
  const [duration, setDuration] = useState(247);
  const [files, setFiles] = useState<File[]>([]);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState('');

  /** .ZIP: lê BPM/Tom do nome, extrai os stems e detecta a duração; áudio solto entra direto. */
  const selectFiles = async (rawFiles: File[]) => {
    if (rawFiles.length === 0) return;

    const zipFile = rawFiles.find(isZipFile);
    if (!zipFile) {
      setFiles(rawFiles);
      return;
    }

    setIsExtractingZip(true);
    setZipProgress('Lendo cabeçalho do .ZIP...');
    try {
      const meta = ZipMultitrackExtractor.parseMetadataFromZipName(zipFile.name);
      if (!title) setTitle(meta.title);
      if (!artist) setArtist(meta.artist);
      setBpm(meta.bpm);
      if (meta.keyFromName) setOriginalKey(meta.originalKey);

      const extracted = await ZipMultitrackExtractor.extractFromZipBlob(zipFile, (current, total, filename) => {
        setZipProgress(`Descompactando ${current}/${total}: ${filename}`);
      });

      let maxDur = 0;
      const asFiles = extracted.map((entry) => {
        if (entry.durationSeconds && entry.durationSeconds > maxDur) maxDur = entry.durationSeconds;
        return new File([entry.blob], entry.filename, { type: ZipMultitrackExtractor.getAudioMimeType(entry.filename) });
      });
      if (!meta.keyFromName) {
        // Nome sem tom: identifica pelo áudio dos stems tonais (Click/Guia/Bateria/Loop fora)
        setZipProgress('Identificando o tom pelo áudio...');
        const estimate = await detectKeyFromStems(
          asFiles.map((f) => ({ type: TrackStem.classifyStemFromFilename(f.name).type, blob: f }))
        );
        if (estimate) setOriginalKey(estimate.key);
      }
      if (maxDur > 10) setDuration(maxDur);
      setFiles(asFiles.length > 0 ? asFiles : rawFiles);
    } catch {
      setFiles(rawFiles);
    } finally {
      setIsExtractingZip(false);
      setZipProgress('');
    }
  };

  const reset = () => {
    setTitle('');
    setArtist('');
    setFiles([]);
  };

  const draft: VsUploadDraft = { title, artist, originalKey, bpm, duration, files };

  return {
    draft,
    isExtractingZip,
    zipProgress,
    setTitle,
    setArtist,
    setOriginalKey,
    setBpm,
    selectFiles,
    reset
  };
}

type VsUploadForm = ReturnType<typeof useVsUploadForm>;

interface UploadVsTabProps {
  form: VsUploadForm;
  isSubmitting: boolean;
  onSubmit: (draft: VsUploadDraft) => void;
}

const inputClass = 'w-full px-3 py-2 rounded-xl bg-slate-900 border border-stage-border text-xs text-white';
const labelClass = 'text-[10px] font-bold text-slate-300 uppercase block mb-1';

/** Aba Subir Novo VS: pacote .ZIP ou stems WAV/MP3, com Pitch Lock automático na classificação. */
export const UploadVsTab: React.FC<UploadVsTabProps> = ({ form, isSubmitting, onSubmit }) => {
  const { draft, isExtractingZip, zipProgress } = form;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.title) onSubmit(draft);
      }}
      className="flex-1 overflow-y-auto space-y-4 pr-1"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Título da Música</label>
          <input
            type="text"
            placeholder="ex: O Nosso General"
            value={draft.title}
            onChange={(e) => form.setTitle(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Artista / Banda</label>
          <input
            type="text"
            placeholder="ex: Versão Mateus Brito"
            value={draft.artist}
            onChange={(e) => form.setArtist(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Tom Original</label>
          <input
            type="text"
            value={draft.originalKey}
            onChange={(e) => form.setOriginalKey(e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </div>

        <div>
          <label className={labelClass}>BPM (Tempo)</label>
          <input
            type="number"
            value={draft.bpm}
            onChange={(e) => form.setBpm(parseInt(e.target.value, 10))}
            className={`${inputClass} font-mono`}
          />
        </div>
      </div>

      {/* Seletor de Pacote ZIP ou Arquivos de Áudio */}
      <div>
        <label className={labelClass}>Pacote .ZIP de Multitrack ou Stems Individuais (WAV / MP3)</label>
        <div className="border-2 border-dashed border-stage-border rounded-2xl p-6 text-center hover:border-blue-500/60 bg-slate-900/40">
          <HardDrive className="w-8 h-8 text-blue-400 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-300">
            Selecione o arquivo .ZIP completo da Multitrack ou os arquivos WAV/MP3
          </p>
          <p className="text-[11px] text-stage-muted mt-0.5">
            O sistema extrai o .ZIP automaticamente, identifica BPM/Tom e protege Bateria, Loops, Click e Guia contra
            mudança de tom.
          </p>
          <input
            type="file"
            multiple
            accept=".zip,application/zip,audio/*,.wav,.mp3,.ogg,.flac,.m4a"
            onChange={(e) => void form.selectFiles(Array.from(e.target.files || []))}
            className="mt-3 text-xs text-slate-400"
          />
        </div>

        {isExtractingZip && (
          <div className="mt-2 text-xs text-amber-300 font-mono">
            {zipProgress || 'Descompactando pacote .ZIP de Multitracks...'}
          </div>
        )}

        {draft.files.length > 0 && !isExtractingZip && (
          <div className="mt-2 text-xs text-emerald-400 font-mono">
            ✓ {draft.files.length} stems prontos para abrir no Mixer (Bateria, Loops, Click e Guia com Pitch Lock
            automático).
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting || isExtractingZip || !draft.title}
        className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-lg shadow-blue-600/30 disabled:opacity-50"
      >
        {isSubmitting ? 'Carregando Stems no Mixer...' : 'Salvar e Abrir Multitrack no Culto'}
      </button>
    </form>
  );
};
