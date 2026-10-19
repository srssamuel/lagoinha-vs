import React from 'react';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import { X, ShieldCheck, Radio, Check, Layers, Cpu, AlertTriangle } from 'lucide-react';

interface RoutingModalProps {
  isOpen: boolean;
  routingMode: RoutingMode;
  audioHardwareChannels?: number;
  onSelectMode: (mode: RoutingMode) => void;
  onClose: () => void;
}

export const RoutingModal: React.FC<RoutingModalProps> = ({
  isOpen,
  routingMode,
  audioHardwareChannels = 2,
  onSelectMode,
  onClose
}) => {
  if (!isOpen) return null;

  const hasMultichannelHardware = audioHardwareChannels >= 4;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-[#111520] border border-stage-border rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[92vh]">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-stage-muted hover:text-white p-2 rounded-xl bg-stage-card border border-stage-border transition"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabeçalho */}
        <div className="mb-4 pr-10">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-white tracking-wide uppercase flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Roteamento de Áudio de Palco (IEM & PA)
            </h3>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
              LAGOINHA AUDIO TECH
            </span>
          </div>
          <p className="text-xs text-stage-muted mt-1 leading-relaxed">
            Configure a distribuição do áudio para os sistemas de monitoração in-ear (IEM) e som principal da congregação (FOH/PA).
          </p>
        </div>

        {/* Status do Hardware Físico Detectado */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-stage-card/70 border border-stage-border mb-4 text-xs">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-slate-300 font-medium">Interface de Áudio Detectada no SO:</span>
          </div>
          {hasMultichannelHardware ? (
            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {audioHardwareChannels} Canais Físicos (Suporte 4CH Ativo)
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold flex items-center gap-1.5" title="Dispositivo estéreo detectado. Para 4 saídas discretas na mesa física, conecte uma interface USB (ex: Behringer XR18, UMC404HD, Focusrite Scarlett 4i4/18i20).">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              {audioHardwareChannels} Canais Físicos (Dispositivo Estéreo)
            </span>
          )}
        </div>

        {/* Opções de Roteamento */}
        <div className="space-y-3.5 overflow-y-auto pr-1 flex-1 mb-4">
          {/* Opção 1: 4 Saídas Discretas (Padrão Leandro Machado Lagoinha) */}
          <div
            onClick={() => onSelectMode('MULTI_4CH_DISCRETE')}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              routingMode === 'MULTI_4CH_DISCRETE'
                ? 'bg-blue-600/15 border-blue-500/90 shadow-xl shadow-blue-500/10 ring-1 ring-blue-400/50'
                : 'bg-stage-card border-stage-border hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-sm text-white">
                  4 Saídas Discretas (Line-Level Pro)
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  PADRÃO LAGOINHA (LEANDRO MACHADO)
                </span>
              </div>
              {routingMode === 'MULTI_4CH_DISCRETE' && (
                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-slate-950 font-bold">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-3">
              Envia 4 canais físicos mono independentes line-level através da interface de áudio USB para distribuição na mesa digital:
            </p>

            {/* Matriz dos 4 Canais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-blue-500/30">
                <div className="flex items-center justify-between font-bold text-blue-300 mb-0.5">
                  <span>Output 1: VS Left (Playback L)</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-200">Mesa FOH (PA)</span>
                </div>
                <p className="text-[11px] text-slate-400">Canal esquerdo do playback estéreo da banda.</p>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-blue-500/30">
                <div className="flex items-center justify-between font-bold text-blue-300 mb-0.5">
                  <span>Output 2: VS Right (Playback R)</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-200">Mesa FOH (PA)</span>
                </div>
                <p className="text-[11px] text-slate-400">Canal direito do playback estéreo da banda.</p>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-amber-500/30">
                <div className="flex items-center justify-between font-bold text-amber-300 mb-0.5">
                  <span>Output 3: Click Track Dedicado</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200">IEM Músicos</span>
                </div>
                <p className="text-[11px] text-slate-400">Metrônomo mono puro, sem compressão do master e ZERO no PA.</p>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-purple-500/30">
                <div className="flex items-center justify-between font-bold text-purple-300 mb-0.5">
                  <span>Output 4: Guide Track Dedicado</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200">IEM Músicos</span>
                </div>
                <p className="text-[11px] text-slate-400">Voz guia, contagens e referências musicais. ZERO no PA.</p>
              </div>
            </div>
          </div>

          {/* Opção 2: Split IEM / PA (Cabo em Y para saídas de fone 2 canais) */}
          <div
            onClick={() => onSelectMode('SPLIT_IEM_PA')}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              routingMode === 'SPLIT_IEM_PA'
                ? 'bg-emerald-500/15 border-emerald-500/90 shadow-xl shadow-emerald-500/10 ring-1 ring-emerald-400/50'
                : 'bg-stage-card border-stage-border hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-sm text-white">
                  Split Estéreo em Y (2 Canais / Sem Interface Externa)
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  CABO EM Y
                </span>
              </div>
              {routingMode === 'SPLIT_IEM_PA' && (
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 font-bold">
                  <Check className="w-3.5 h-3.5 text-slate-950" />
                </div>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-2">
              Ideal para quando o notebook é ligado diretamente pelo conector P2/P10 sem interface multicanal:
            </p>
            <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
              <li><strong>Canal L (Fones IEM):</strong> Click + Guia Vocal + Multitracks para os músicos.</li>
              <li><strong>Canal R (PA Mesa):</strong> Estritamente as multitracks da banda para a igreja (Click e Guia com <strong>volume ZERO absoluto</strong>).</li>
            </ul>
          </div>

          {/* Opção 3: Stereo Full */}
          <div
            onClick={() => onSelectMode('STEREO_FULL')}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              routingMode === 'STEREO_FULL'
                ? 'bg-purple-600/15 border-purple-500/90 shadow-xl shadow-purple-500/10 ring-1 ring-purple-400/50'
                : 'bg-stage-card border-stage-border hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-sm text-white">
                  Modo Ensaio Geral: Stereo Full
                </span>
              </div>
              {routingMode === 'STEREO_FULL' && (
                <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Mixagem estéreo completa com Pan espacial normal. Recomendado para ensaios onde todos ouvem por fones individuais ou gravação.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition shadow-lg shadow-blue-600/30 shrink-0"
        >
          Confirmar Configuração
        </button>
      </div>
    </div>
  );
};
