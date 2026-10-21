import React, { useState, useEffect, useRef } from 'react';
import { Song } from '../../domain/entities/Song';
import { ChordTransposer } from '../../domain/services/ChordTransposer';
import { escapeHtml } from '../utils/escapeHtml';
import {
  X,
  FileText,
  Hash,
  Music,
  Minus,
  Plus,
  Play,
  Printer,
  ScrollText,
  Pause
} from 'lucide-react';

interface CifraProModalProps {
  isOpen: boolean;
  song: Song | null;
  activeSectionId: string | null;
  onPitchShiftChange: (semitones: number) => void;
  onSelectSection: (sectionId: string) => void;
  onClose: () => void;
}

interface SectionChartData {
  type: string;
  chords: string;
  lyrics: string;
}

const CHARTS_BY_SONG_ID: Record<string, SectionChartData[]> = {
  'o-nosso-general': [
    {
      type: 'intro',
      chords: 'G#m7   E   B   F#',
      lyrics: '[Riff Synth Lead + Guitarras EG1/EG2 + Bateria 140 BPM em Si Maior]'
    },
    {
      type: 'verse',
      chords: 'G#m7   E   B   F#',
      lyrics: 'Pelo Senhor marchamos sim / O Seu exército poderoso é / Sua glória será vista em toda a Terra...'
    },
    {
      type: 'chorus',
      chords: 'G#m7   E   B   F#',
      lyrics: 'O nosso General é Cristo / Seguimos os Seus passos / Nenhum inimigo nos resistirá!'
    },
    {
      type: 'interlude',
      chords: 'G#m7   E   B   F#',
      lyrics: '[Interlúdio Brass/Synth Lead + EG 3 + Órgão Hammond]'
    },
    {
      type: 'verse',
      chords: 'G#m7   E   B   F#',
      lyrics: 'Vamos cantar o canto da vitória / Glória a Deus, vencemos a batalha / Toda arma contra nós perecerá!'
    },
    {
      type: 'chorus',
      chords: 'G#m7   E   B   F#',
      lyrics: 'O nosso General é Cristo / Seguimos os Seus passos / Nenhum inimigo nos resistirá!'
    },
    {
      type: 'vamp',
      chords: 'E   F#   G#m7   D#m7',
      lyrics: '[Solo Guitarra EG 3 Lead + Keys EP + Groove Contrabaixo]'
    },
    {
      type: 'bridge',
      chords: 'E   F#   G#m7   B/D#',
      lyrics: 'Com o Messias marchamos sim / Em Suas mãos a chave da vitória / Que nos leva a possuir a Terra Prometida!'
    },
    {
      type: 'chorus',
      chords: 'G#m7   E   B   F#',
      lyrics: 'O nosso General é Cristo / Seguimos os Seus passos / Nenhum inimigo nos resistirá! (2x)'
    },
    {
      type: 'outro',
      chords: 'G#m7   E   B   F#   G#m7',
      lyrics: '[Final Explosivo — Parada Geral no Tempo 1]'
    }
  ],
  'song-casa-sua': [
    {
      type: 'intro',
      chords: 'G   D/F#   Em7   C9',
      lyrics: '[Dedilhado Violão Acústico + Ambiente Pad em Sol Maior]'
    },
    {
      type: 'verse',
      chords: 'G   D/F#   Em7   C9',
      lyrics: 'Você é bem-vindo aqui / A casa é Sua, pode entrar / Me esvazio de mim...'
    },
    {
      type: 'chorus',
      chords: 'G   D   Em7   C9',
      lyrics: 'Essa casa é Sua casa / Nós deixamos ela pra Você, Jesus!'
    },
    {
      type: 'bridge',
      chords: 'C9   D   Em7   Bm7',
      lyrics: 'Apareça, que o Teu nome cresça / Enche este lugar, enche este lugar!'
    },
    {
      type: 'vamp',
      chords: 'C9   D   Em7   G/B',
      lyrics: '[Ministração Espontânea — Crescendo Bateria & Guitarra Drive]'
    }
  ],
  'song-vitorioso-es': [
    {
      type: 'intro',
      chords: 'D   G   Bm7   A',
      lyrics: '[Riff Guitarra Elétrica + Synth Arp em Ré Maior]'
    },
    {
      type: 'verse',
      chords: 'Bm7   G   D   A',
      lyrics: 'Lutamos com armas de fé / Nada resistirá ao nosso Deus...'
    },
    {
      type: 'chorus',
      chords: 'Bm7   G   D   A',
      lyrics: 'Vitorioso És / Na tempestade estás / Teu nome infalível é / Os reinos vêm e vão!'
    },
    {
      type: 'bridge',
      chords: 'G   A   Bm7   F#m7',
      lyrics: 'Como um trovão impetuoso / Poderoso em batalha / Todo mal já venceste na cruz!'
    }
  ],
  'song-ousado-amor': [
    {
      type: 'intro',
      chords: 'Eb   Bb   Ab   Eb',
      lyrics: '[Compasso 6/8 — Violão Acústico + Piano Rhodes]'
    },
    {
      type: 'verse',
      chords: 'Eb   Bb   Ab   Eb',
      lyrics: 'Antes de eu falar, Tu cantavas sobre mim / Tu tens sido tão, tão bom pra mim...'
    },
    {
      type: 'chorus',
      chords: 'Eb   Bb   Ab   Eb',
      lyrics: 'Ó impressionante, infinito e ousado amor de Deus / Deixa as noventa e nove só pra me encontrar!'
    },
    {
      type: 'bridge',
      chords: 'Eb   Bb   Ab   Eb',
      lyrics: 'Traz luz para as sombras / Escalando montanhas / Pra me alcançar, derruba muralhas!'
    }
  ],
  'song-ruja-o-leao': [
    {
      type: 'intro',
      chords: 'Em   C   G   D',
      lyrics: '[Synth Bass Profundo + Strings em Mi Menor]'
    },
    {
      type: 'verse',
      chords: 'Em   C   G   D',
      lyrics: 'Sobre o trono de justiça / Sobre o trono de louvor / Ele reina em majestade...'
    },
    {
      type: 'chorus',
      chords: 'C   D   Em   Bm7',
      lyrics: 'Ruja o Leão / Que a Terra estremeça / Diante da majestade de Jesus!'
    },
    {
      type: 'bridge',
      chords: 'C   D   Em   Bm7',
      lyrics: 'Quem é como o Senhor? Poderoso, Invencível / O Leão da Tribo de Judá rugiu!'
    }
  ]
};

export const CifraProModal: React.FC<CifraProModalProps> = ({
  isOpen,
  song,
  activeSectionId,
  onPitchShiftChange,
  onSelectSection,
  onClose
}) => {
  const [notationMode, setNotationMode] = useState<'CHORDS' | 'NASHVILLE'>('CHORDS');
  const [capoFret, setCapoFret] = useState<number>(0);
  const [fontSizePx, setFontSizePx] = useState<number>(16);
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll loop
  useEffect(() => {
    if (!isOpen || !isAutoScrolling) return;

    const interval = setInterval(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop += scrollSpeed * 0.8;
      }
    }, 40);

    return () => clearInterval(interval);
  }, [isOpen, isAutoScrolling, scrollSpeed]);

  if (!isOpen || !song) return null;

  const baseCharts = CHARTS_BY_SONG_ID[song.id] ?? CHARTS_BY_SONG_ID['song-casa-sua'] ?? [];
  const totalSemitones = song.pitchShiftSemitones - capoFret;
  const capoKey = song.currentKey ? ChordTransposer.transposeKey(song.currentKey, -capoFret) : null;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const sectionsHtml = song.sections
      .map((section, idx) => {
        const chartItem = baseCharts[idx] ?? baseCharts[0];
        const rawChords = chartItem?.chords ?? 'G   D   Em7   C9';
        const displayedChords =
          notationMode === 'NASHVILLE'
            ? (song.originalKey ? ChordTransposer.toNashvilleLine(rawChords, song.originalKey) : rawChords)
            : ChordTransposer.transposeChordLine(rawChords, totalSemitones);

        return `
          <div style="margin-bottom: 18px; page-break-inside: avoid;">
            <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569; margin-bottom: 4px;">
              [${escapeHtml(section.name)}]
            </div>
            <div style="font-family: monospace; font-size: 16px; font-weight: bold; color: #b45309; letter-spacing: 1px; margin-bottom: 4px;">
              ${escapeHtml(displayedChords)}
            </div>
            <div style="font-size: 13px; color: #1e293b; line-height: 1.5;">
              ${escapeHtml(chartItem?.lyrics || '')}
            </div>
          </div>
        `;
      })
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapeHtml(song.title)} — Cifra Pro Lagoinha VS</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; max-width: 800px; margin: 0 auto; color: #0f172a; }
            h1 { font-size: 22px; margin: 0 0 4px 0; }
            .meta { font-size: 12px; color: #64748b; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(song.title)}</h1>
          <div class="meta">
            <strong>Artista:</strong> ${escapeHtml(song.artist)} |
            <strong>Tom no Áudio:</strong> ${escapeHtml(song.currentKey ?? 'não identificado')} ${capoFret > 0 ? `(Capo ${escapeHtml(capoFret)})` : ''} |
            <strong>BPM:</strong> ${escapeHtml(song.bpm)} |
            <strong>Notação:</strong> ${notationMode === 'NASHVILLE' ? 'Graus Nashville' : 'Acordes'}
          </div>
          ${sectionsHtml}
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
      <div className="bg-[#121824] border border-stage-border rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header estilo Cifra Pro® / ChartBuilder MultiTracks.com.br */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stage-border pb-4 mb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white tracking-wide uppercase">
                  Cifra Pro® & Mapa Dinâmico • {song.title}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  SINCRONIZADO AO VIVO
                </span>
              </div>
              <p className="text-xs text-stage-muted">
                {song.artist} • Tom Original: {song.originalKey ?? 'não identificado'} • Tom no Áudio:{' '}
                <strong className="text-amber-300">{song.currentKey ?? '?'}</strong> ({song.bpm} BPM)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-amber-400 transition flex items-center gap-1.5 text-xs font-bold"
              title="Imprimir ou Salvar PDF da Cifra"
            >
              <Printer className="w-4 h-4 text-amber-300" />
              <span className="hidden sm:inline">Imprimir / PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-stage-card border border-stage-border text-stage-muted hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Ferramentas Cifra Pro®: Transposição, Nashville, Capo, Zoom de Fonte e Auto-Scroll */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900/90 border border-stage-border rounded-2xl p-2.5 mb-3 shrink-0">
          {/* 1. Transpositor de Tom (Áudio + Cifra simultâneos) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-300">
              Tom (Áudio + Cifra):
            </span>
            <button
              type="button"
              onClick={() => onPitchShiftChange(song.pitchShiftSemitones - 1)}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              title="Baixar 1 semitom (-1) no áudio e na cifra"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/40 font-mono text-xs font-black text-amber-300 min-w-[65px] text-center">
              {song.currentKey}{' '}
              {song.pitchShiftSemitones !== 0 &&
                `(${song.pitchShiftSemitones > 0 ? '+' : ''}${song.pitchShiftSemitones})`}
            </span>
            <button
              type="button"
              onClick={() => onPitchShiftChange(song.pitchShiftSemitones + 1)}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              title="Subir 1 semitom (+1) no áudio e na cifra"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 2. Alternador Acordes vs Graus Numéricos Nashville */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setNotationMode('CHORDS')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 transition ${
                notationMode === 'CHORDS'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <Music className="w-3 h-3" />
              <span>Acordes ({capoKey ?? '?'})</span>
            </button>
            <button
              type="button"
              onClick={() => setNotationMode('NASHVILLE')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 transition ${
                notationMode === 'NASHVILLE'
                  ? 'bg-amber-500 text-slate-950 font-black'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <Hash className="w-3 h-3" />
              <span>Graus Nashville (1-4-5-6m)</span>
            </button>
          </div>

          {/* 3. Capotraste para Violão */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-300">Capo:</span>
            <select
              value={capoFret}
              onChange={(e) => setCapoFret(parseInt(e.target.value, 10))}
              aria-label="Capotraste Violão"
              className="px-2 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 font-mono"
            >
              <option value={0}>Sem Capo</option>
              {[1, 2, 3, 4, 5].map((fret) => (
                <option key={fret} value={fret}>
                  Casa {fret} ({song.currentKey ? ChordTransposer.transposeKey(song.currentKey, -fret) : '?'})
                </option>
              ))}
            </select>
          </div>

          {/* 4. Zoom de Fonte (A- / A+) */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded-xl border border-slate-700">
            <span className="text-[10px] font-bold text-slate-400">Fonte:</span>
            <button
              type="button"
              onClick={() => setFontSizePx((prev) => Math.max(13, prev - 2))}
              className="px-1.5 py-0.5 rounded hover:bg-slate-700 text-slate-300 text-xs font-bold"
              title="Diminuir tamanho da fonte"
            >
              A-
            </button>
            <span className="font-mono text-xs text-amber-300 font-bold">{fontSizePx}px</span>
            <button
              type="button"
              onClick={() => setFontSizePx((prev) => Math.min(24, prev + 2))}
              className="px-1.5 py-0.5 rounded hover:bg-slate-700 text-slate-300 text-xs font-bold"
              title="Aumentar tamanho da fonte"
            >
              A+
            </button>
          </div>

          {/* 5. Auto-Scroll para Palco */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-0.5 rounded-xl border border-slate-700">
            <button
              type="button"
              onClick={() => setIsAutoScrolling(!isAutoScrolling)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold transition ${
                isAutoScrolling
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'bg-slate-900 text-slate-300 hover:text-white'
              }`}
            >
              {isAutoScrolling ? (
                <>
                  <Pause className="w-3 h-3 fill-current" />
                  <span>Rolando</span>
                </>
              ) : (
                <>
                  <ScrollText className="w-3 h-3 text-slate-400" />
                  <span>Auto-Scroll</span>
                </>
              )}
            </button>

            {isAutoScrolling && (
              <select
                value={scrollSpeed}
                onChange={(e) => setScrollSpeed(parseInt(e.target.value, 10))}
                aria-label="Velocidade da Rolagem Automática"
                className="bg-slate-900 text-slate-200 text-[10px] font-bold rounded px-1.5 py-0.5 border border-slate-700 font-mono"
              >
                <option value={1}>1x (Lento)</option>
                <option value={2}>2x (Médio)</option>
                <option value={3}>3x (Rápido)</option>
              </select>
            )}
          </div>
        </div>

        {/* Lista de Seções Sincronizadas com Pulo Quantizado ao Clicar */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto space-y-3 pr-1 scroll-smooth"
        >
          {song.sections.map((section, idx) => {
            const chartItem = baseCharts[idx] ?? baseCharts[0];
            const rawChords = chartItem?.chords ?? 'G   D   Em7   C9';
            const displayedChords =
              notationMode === 'NASHVILLE'
                ? (song.originalKey ? ChordTransposer.toNashvilleLine(rawChords, song.originalKey) : rawChords)
                : ChordTransposer.transposeChordLine(rawChords, totalSemitones);
            const isActive = activeSectionId === section.id;

            return (
              <div
                key={section.id}
                onClick={() => onSelectSection(section.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSection(section.id);
                  }
                }}
                className={`p-4 rounded-2xl border transition cursor-pointer ${
                  isActive
                    ? 'bg-blue-600/20 border-blue-400 shadow-lg shadow-blue-500/10'
                    : 'bg-stage-card border-stage-border hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-mono font-bold text-slate-200 uppercase">
                      {section.name}
                    </span>
                    <span className="text-[11px] font-mono text-slate-300">
                      Compasso {section.startBar} ({section.barCount} comp.)
                    </span>
                    {isActive && (
                      <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Play className="w-2.5 h-2.5 fill-current" />
                        TOCANDO AGORA
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-blue-300">
                    Clique para agendar pulo no próximo compasso →
                  </span>
                </div>

                {/* Linha de Acordes ou Graus Nashville com Zoom Dinâmico */}
                <div
                  className="font-mono font-black text-amber-300 tracking-wide mb-1 transition-all"
                  style={{ fontSize: `${fontSizePx}px` }}
                >
                  {displayedChords}
                </div>

                {/* Guia de Letra / Dinâmica da Banda */}
                <div
                  className="text-slate-200 leading-relaxed transition-all"
                  style={{ fontSize: `${Math.max(11, fontSizePx - 3)}px` }}
                >
                  {chartItem?.lyrics}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
