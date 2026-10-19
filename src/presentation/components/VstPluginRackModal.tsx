import React, { useState } from 'react';
import { TrackStem, StemDspConfig } from '../../domain/entities/TrackStem';
import { VstPluginRackService } from '../../domain/services/VstPluginRackService';
import {
  X,
  Sliders,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  ExternalLink,
  Cpu,
  Gauge
} from 'lucide-react';

interface VstPluginRackModalProps {
  isOpen: boolean;
  stems: TrackStem[];
  initialSelectedStemId?: string | null;
  onClose: () => void;
  onUpdateStemDsp: (stemId: string, partial: Partial<StemDspConfig>) => void;
  onAutoFixAllStems: () => void;
  onResetAllDsp: () => void;
}

export const VstPluginRackModal: React.FC<VstPluginRackModalProps> = ({
  isOpen,
  stems,
  initialSelectedStemId,
  onClose,
  onUpdateStemDsp,
  onAutoFixAllStems,
  onResetAllDsp
}) => {
  const [activeTab, setActiveTab] = useState<'dsp_rack' | 'plugin_boutique'>('dsp_rack');
  const [selectedStemId, setSelectedStemId] = useState<string>(
    initialSelectedStemId || stems.find((s) => s.type === 'violao')?.id || stems[0]?.id || ''
  );

  if (!isOpen) return null;

  const activeStem =
    stems.find((s) => s.id === (initialSelectedStemId || selectedStemId)) ||
    stems.find((s) => s.id === selectedStemId) ||
    stems[0];

  const handleSelectStem = (id: string) => {
    setSelectedStemId(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
      <div className="bg-[#111520] border border-stage-border rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header do Rack de Plugins VST */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stage-border pb-4 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black text-white tracking-wide uppercase">
                  Rack VST & Channel Strip DSP (Plugin Boutique Engine)
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  MASTER LIMITER №6 ATIVO (-1.0 dBFS)
                </span>
              </div>
              <p className="text-xs text-stage-muted mt-0.5">
                Corrija vazamentos de frequência (De-Bleed), falta de brilho agudo (Air) e picos dinâmicos nos stems separados por IA.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-stage-card border border-stage-border text-stage-muted hover:text-white"
            aria-label="Fechar Rack de Plugins VST"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Abas e Botão de Auto-Fix 1-Clique */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('dsp_rack')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'dsp_rack'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                  : 'bg-stage-card text-slate-300 hover:text-white border border-stage-border'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Channel Strip DSP por Canal (Tempo Real)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('plugin_boutique')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'plugin_boutique'
                  ? 'bg-blue-600 text-white font-black shadow-md shadow-blue-600/20'
                  : 'bg-stage-card text-blue-300 hover:text-white border border-blue-500/30'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Catálogo Free VST (PluginBoutique.com)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAutoFixAllStems}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow-md shadow-emerald-500/20"
              title="Aplica automaticamente TDR Nova De-Bleed, Exciter de Brilho e Compressão OTT nos canais de Violão, Guitarra, Baixo, Bateria e Voz"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Corrigir Todos os Stems (IA Polish)</span>
            </button>

            <button
              type="button"
              onClick={onResetAllDsp}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition"
              title="Desativa todos os filtros e equalizadores (Flat Bypass)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Bypass Geral</span>
            </button>
          </div>
        </div>

        {/* ABA 1: RACK DSP POR CANAL EM TEMPO REAL */}
        {activeTab === 'dsp_rack' && activeStem && (
          <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-y-auto pr-1">
            {/* Lista Lateral de Stems para Selecionar o Canal */}
            <div className="lg:w-60 shrink-0 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1">
                Selecione o Canal para Processar
              </div>
              {stems.map((stem) => {
                const isSelected = stem.id === activeStem.id;
                const isModified =
                  stem.dsp.highPassHz > 25 ||
                  stem.dsp.eqLowDb !== 0 ||
                  stem.dsp.eqMidDb !== 0 ||
                  stem.dsp.eqHighDb !== 0 ||
                  stem.dsp.driveAmount > 0 ||
                  stem.dsp.compressorEnabled;

                return (
                  <button
                    key={stem.id}
                    type="button"
                    onClick={() => handleSelectStem(stem.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 text-white font-bold'
                        : 'bg-stage-card border-stage-border text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="text-xs font-bold truncate">{stem.name}</div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {stem.dsp.presetName}
                      </div>
                    </div>
                    {isModified && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                        FX ON
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Painel Central do Channel Strip do Canal Selecionado */}
            <div className="flex-1 bg-[#0b0e16] border border-stage-border rounded-2xl p-4 flex flex-col justify-between space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] font-mono uppercase text-amber-300 font-bold">
                    CHANNEL STRIP ATIVO • {activeStem.type.toUpperCase()}
                  </span>
                  <h4 className="text-base font-black text-white">{activeStem.name}</h4>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateStemDsp(
                        activeStem.id,
                        VstPluginRackService.getSmartPresetForStem(activeStem.type)
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-bold transition"
                  >
                    Carregar Preset Recomendado ({activeStem.name})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateStemDsp(activeStem.id, {
                        presetName: 'Flat (Bypass)',
                        highPassHz: 20,
                        eqLowDb: 0,
                        eqMidDb: 0,
                        eqHighDb: 0,
                        driveAmount: 0,
                        compressorEnabled: false
                      })
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 hover:text-white text-xs font-bold transition"
                  >
                    Reset Canal
                  </button>
                </div>
              </div>

              {/* Seletor Rápido de Presets de Estúdio (1-Clique) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-[10px] font-mono text-amber-300/80 uppercase font-bold shrink-0">
                  Presets de Estúdio:
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateStemDsp(activeStem.id, VstPluginRackService.getSmartPresetForStem('violao'))}
                  className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-[10px] font-bold text-slate-300 hover:text-white shrink-0 transition"
                  title="Preset Violão: Corta embolamento abaixo de 105Hz e devolve o brilho de cordas de aço em 8.5kHz"
                >
                  Violão Worship Air
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateStemDsp(activeStem.id, VstPluginRackService.getSmartPresetForStem('guitars'))}
                  className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-[10px] font-bold text-slate-300 hover:text-white shrink-0 transition"
                  title="Preset Guitarra: Adiciona saturação valvulada SGA1566 e realce em 1.4kHz para cortar a mix"
                >
                  Guitarras Presence
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateStemDsp(activeStem.id, VstPluginRackService.getSmartPresetForStem('bass'))}
                  className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-[10px] font-bold text-slate-300 hover:text-white shrink-0 transition"
                  title="Preset Baixo: Corpo subgrave em 80-100Hz com compressão óptica firme"
                >
                  Baixo Gordo Valvulado
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateStemDsp(activeStem.id, VstPluginRackService.getSmartPresetForStem('drums'))}
                  className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-[10px] font-bold text-slate-300 hover:text-white shrink-0 transition"
                  title="Preset Bateria: Punch no bumbo e estalo nos transientes de caixa/pratos"
                >
                  Bateria & Loops Punch
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateStemDsp(activeStem.id, VstPluginRackService.getSmartPresetForStem('vocals'))}
                  className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-[10px] font-bold text-slate-300 hover:text-white shrink-0 transition"
                  title="Preset Vocais: Remove ressonâncias anasaladas e adiciona ar sedoso"
                >
                  Vozes Silk & Air
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateStemDsp(activeStem.id, VstPluginRackService.getSmartPresetForStem('pad'))}
                  className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-[10px] font-bold text-slate-300 hover:text-white shrink-0 transition"
                  title="Preset Teclados & Pad: Abertura analógica quente e suave para fundos de oração"
                >
                  Teclados & Pad Shimmer
                </button>
              </div>

              {/* Grade de Módulos VST do Canal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. De-Bleed Surgical High-Pass Filter (TDR Nova) */}
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-cyan-300">
                      1. Filtro De-Bleed High-Pass (TDR Nova)
                    </span>
                    <span className="text-xs font-mono font-bold text-white">
                      {activeStem.dsp.highPassHz} Hz
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2">
                    Remove vazamento de bumbo e sub-grave indesejado nas tracks de Violão, Guitarra e Voz.
                  </p>
                  <input
                    type="range"
                    min={20}
                    max={300}
                    step={5}
                    value={activeStem.dsp.highPassHz}
                    onChange={(e) =>
                      onUpdateStemDsp(activeStem.id, {
                        presetName: 'Custom DSP',
                        highPassHz: parseInt(e.target.value, 10)
                      })
                    }
                    aria-label="Frequência do Filtro High-Pass De-Bleed"
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* 2. Saturação Valvulada & Exciter (SGA1566 / Softube) */}
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-amber-300">
                      2. Tube Saturation Drive (SGA1566)
                    </span>
                    <span className="text-xs font-mono font-bold text-white">
                      {Math.round(activeStem.dsp.driveAmount * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2">
                    Adiciona calor analógico e reconstrói harmônicos perdidos na separação por IA.
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={0.8}
                    step={0.02}
                    value={activeStem.dsp.driveAmount}
                    onChange={(e) =>
                      onUpdateStemDsp(activeStem.id, {
                        presetName: 'Custom DSP',
                        driveAmount: parseFloat(e.target.value)
                      })
                    }
                    aria-label="Saturação Valvulada Drive"
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                {/* 3. Equalizador Paramétrico de 3 Bandas (TDR VOS SlickEQ) */}
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 sm:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-300">
                      3. Equalizador Musical de 3 Bandas (TDR VOS SlickEQ & Air Exciter)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Low 100Hz • Mid 1.4kHz • Air 8.5kHz
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-300 font-semibold">Corpo / Grave (100Hz)</span>
                        <span className="font-mono font-bold text-white">
                          {activeStem.dsp.eqLowDb > 0 ? `+${activeStem.dsp.eqLowDb}` : activeStem.dsp.eqLowDb} dB
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={0.5}
                        value={activeStem.dsp.eqLowDb}
                        onChange={(e) =>
                          onUpdateStemDsp(activeStem.id, {
                            presetName: 'Custom DSP',
                            eqLowDb: parseFloat(e.target.value)
                          })
                        }
                        aria-label="Equalizador Grave 100Hz"
                        className="w-full accent-blue-400 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-300 font-semibold">Presença / Médio (1.4kHz)</span>
                        <span className="font-mono font-bold text-white">
                          {activeStem.dsp.eqMidDb > 0 ? `+${activeStem.dsp.eqMidDb}` : activeStem.dsp.eqMidDb} dB
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={0.5}
                        value={activeStem.dsp.eqMidDb}
                        onChange={(e) =>
                          onUpdateStemDsp(activeStem.id, {
                            presetName: 'Custom DSP',
                            eqMidDb: parseFloat(e.target.value)
                          })
                        }
                        aria-label="Equalizador Médio 1.4kHz"
                        className="w-full accent-blue-400 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-amber-300 font-semibold">Brilho / Air (8.5kHz+)</span>
                        <span className="font-mono font-bold text-amber-300">
                          {activeStem.dsp.eqHighDb > 0 ? `+${activeStem.dsp.eqHighDb}` : activeStem.dsp.eqHighDb} dB
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={0.5}
                        value={activeStem.dsp.eqHighDb}
                        onChange={(e) =>
                          onUpdateStemDsp(activeStem.id, {
                            presetName: 'Custom DSP',
                            eqHighDb: parseFloat(e.target.value)
                          })
                        }
                        aria-label="Equalizador Agudo Brilho 8.5kHz"
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Compressor Óptico / OTT Punch (Xfer OTT / Klanghelm MJUC jr.) */}
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-300">
                        4. Compressor Dinâmico OTT / Optical Glue (Ratio 4:1 • Threshold -18 dB)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Estabiliza o volume do instrumento na mixagem ao vivo e evita que dedilhados de violão sumam.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateStemDsp(activeStem.id, {
                        presetName: 'Custom DSP',
                        compressorEnabled: !activeStem.dsp.compressorEnabled
                      })
                    }
                    className={`px-4 py-2 rounded-xl text-xs font-black transition ${
                      activeStem.dsp.compressorEnabled
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                    }`}
                  >
                    {activeStem.dsp.compressorEnabled ? 'COMPRESSOR ATIVO (ON)' : 'ATIVAR COMPRESSOR'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: CATÁLOGO DE PLUGINS GRATUITOS DA PLUGIN BOUTIQUE */}
        {activeTab === 'plugin_boutique' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            <div className="p-3.5 rounded-2xl bg-blue-950/30 border border-blue-500/30 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-3">
              <div>
                Todos os algoritmos abaixo foram modelados nativamente na engine WebAudio do{' '}
                <strong className="text-white">Lagoinha VS</strong> para corrigir defeitos de separação de stems em tempo real. Você também pode baixar as versões VST3/AU gratuitas oficiais na{' '}
                <strong className="text-amber-300">Plugin Boutique</strong>:
              </div>
              <a
                href="https://www.pluginboutique.com/free-plugins"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 transition shrink-0"
              >
                <span>Abrir PluginBoutique.com/Free-Plugins</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {VstPluginRackService.PLUGIN_BOUTIQUE_CATALOG.map((plugin) => (
              <a
                key={plugin.id}
                href={plugin.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 rounded-2xl bg-stage-card border border-stage-border hover:border-amber-400/60 transition group"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-white group-hover:text-amber-300 transition">
                      {plugin.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      por {plugin.developer}
                    </span>
                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {plugin.category}
                    </span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-amber-300 shrink-0" />
                </div>
                <p className="text-xs text-slate-300 mb-1">
                  <strong className="text-rose-300">Defeito que corrige:</strong> {plugin.defectSolved}
                </p>
                <p className="text-[11px] font-mono text-emerald-300">
                  ✓ Integrado no Lagoinha VS: {plugin.dspEquivalentInLagoinhaVS}
                </p>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
