import React, { useEffect, useRef, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { ZipMultitrackExtractor } from '../../../infrastructure/audio/ZipMultitrackExtractor';
import { analyzeKeyFromStems } from '../../../infrastructure/audio/AudioKeyAnalyzer';
import { applyAnalysisIfCurrent, KeyAnalysisSlot } from '../../../infrastructure/audio/KeyAnalysisSlot';
import {
  isValidKey,
  keyFromName,
  manualKey,
  UNKNOWN_KEY,
  type SongKeyInfo
} from '../../../domain/value-objects/SongKey';
import { KeyIdentity } from '../mixer/KeyIdentity';
import { TrackStem } from '../../../domain/entities/TrackStem';

export interface VsUploadDraft {
  title: string;
  artist: string;
  /** null = tom não identificado (nunca um valor padrão). */
  originalKey: string | null;
  keyInfo: SongKeyInfo;
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
  const [keyInfo, setKeyInfo] = useState<SongKeyInfo>(UNKNOWN_KEY);
  const [keyText, setKeyText] = useState('');
  const slotRef = useRef<KeyAnalysisSlot>(new KeyAnalysisSlot());
  useEffect(() => {
    const slot = slotRef.current;
    return () => slot.cancelAll();
  }, []);
  const [bpm, setBpm] = useState(140);
  const [duration, setDuration] = useState(247);
  const [files, setFiles] = useState<File[]>([]);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState('');

  const applyKey = (next: SongKeyInfo) => {
    setKeyInfo(next);
    setKeyText(next.value ?? '');
  };

  /** Digitado à mão: válido vira tom confirmado; vazio ou inválido, sem tom. */
  const setOriginalKey = (text: string) => {
    setKeyText(text);
    const typed = text.trim();
    setKeyInfo(isValidKey(typed) ? manualKey(typed) : UNKNOWN_KEY);
  };

  const confirmKey = (key: string) => applyKey(manualKey(key));

  const cancelKeyAnalysis = () => slotRef.current.abortAnalyses();

  /** .ZIP: lê BPM/Tom do nome, extrai os stems e detecta a duração; áudio solto entra direto. */
  const selectFiles = async (rawFiles: File[]) => {
    if (rawFiles.length === 0) return;
    // Nova seleção aborta a análise anterior e torna obsoleto o que ela ainda produzir
    const run = slotRef.current.begin();

    const zipFile = rawFiles.find(isZipFile);
    if (!zipFile) {
      setFiles(rawFiles);
      setIsExtractingZip(false);
      setZipProgress('');
      return;
    }

    setIsExtractingZip(true);
    setZipProgress('Lendo cabeçalho do .ZIP...');
    try {
      const meta = ZipMultitrackExtractor.parseMetadataFromZipName(zipFile.name);
      if (!title) setTitle(meta.title);
      if (!artist) setArtist(meta.artist);
      setBpm(meta.bpm);
      applyKey(keyFromName(meta.originalKey));

      const extracted = await ZipMultitrackExtractor.extractFromZipBlob(zipFile, (current, total, filename) => {
        if (run.isCurrent()) setZipProgress(`Descompactando ${current}/${total}: ${filename}`);
      });
      if (!run.isCurrent()) return;

      let maxDur = 0;
      const asFiles = extracted.map((entry) => {
        if (entry.durationSeconds && entry.durationSeconds > maxDur) maxDur = entry.durationSeconds;
        return new File([entry.blob], entry.filename, { type: ZipMultitrackExtractor.getAudioMimeType(entry.filename) });
      });
      if (!meta.keyFromName) {
        // Nome sem tom: analisa o áudio dos stems tonais em segundo plano (Worker), com progresso e cancelamento.
        // Resultado fraco ou ambíguo não vira tom; resultado de análise obsoleta nunca é aplicado.
        await applyAnalysisIfCurrent(
          run,
          (signal) =>
            analyzeKeyFromStems(
              asFiles.map((f) => ({ type: TrackStem.classifyStemFromFilename(f.name).type, blob: f })),
              {
                signal,
                onProgress: (p) => {
                  if (run.isCurrent()) setZipProgress(`Identificando o tom pelo áudio... ${Math.round(p.fraction * 100)}%`);
                }
              }
            ),
          applyKey
        );
      }
      if (!run.isCurrent()) return;
      if (maxDur > 10) setDuration(maxDur);
      setFiles(asFiles.length > 0 ? asFiles : rawFiles);
    } catch {
      if (run.isCurrent()) setFiles(rawFiles);
    } finally {
      run.release();
      // Só a importação atual libera o estado de extração
      if (run.isCurrent()) {
        setIsExtractingZip(false);
        setZipProgress('');
      }
    }
  };
  const reset = () => {
    slotRef.current.cancelAll();
    setIsExtractingZip(false);
    setZipProgress('');
    setTitle('');
    setArtist('');
    setFiles([]);
    applyKey(UNKNOWN_KEY);
  };

  const draft: VsUploadDraft = { title, artist, originalKey: keyInfo.value, keyInfo, bpm, duration, files };

  return {
    draft,
    isExtractingZip,
    zipProgress,
    setTitle,
    setArtist,
    keyText,
    setOriginalKey,
    confirmKey,
    cancelKeyAnalysis,
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
            value={form.keyText}
            placeholder="vazio = não identificado"
            onChange={(e) => form.setOriginalKey(e.target.value)}
            className={`${inputClass} font-mono`}
          />
          <div className="mt-2">
            <KeyIdentity keyInfo={draft.keyInfo} onConfirm={form.confirmKey} />
          </div>
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
            {zipProgress.startsWith('Identificando') && (
              <button type="button" onClick={form.cancelKeyAnalysis} className="ml-3 min-h-[44px] px-3 rounded-lg border border-slate-600 text-slate-200">
                Cancelar análise
              </button>
            )}
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
