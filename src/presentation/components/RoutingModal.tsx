import React from 'react';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import { X, ShieldCheck, Radio, Check } from 'lucide-react';

interface RoutingModalProps {
  isOpen: boolean;
  routingMode: RoutingMode;
  onSelectMode: (mode: RoutingMode) => void;
  onClose: () => void;
}

export const RoutingModal: React.FC<RoutingModalProps> = ({
  isOpen,
  routingMode,
  onSelectMode,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-stage-surface border border-stage-border rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-stage-muted hover:text-white p-2 rounded-xl bg-stage-card"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          Roteamento de Áudio de Palco (IEM & PA)
        </h3>
        <p className="text-xs text-stage-muted mb-6">
          Defina como o sinal de áudio do notebook será enviado para a mesa de som da Lagoinha.
        </p>

        <div className="space-y-4 mb-6">
          {/* Opção 1: Split IEM / PA */}
          <div
            onClick={() => onSelectMode('SPLIT_IEM_PA')}
            className={`p-4 rounded-2xl border cursor-pointer transition ${
              routingMode === 'SPLIT_IEM_PA'
                ? 'bg-emerald-500/10 border-emerald-500/80 shadow-lg shadow-emerald-500/10'
                : 'bg-stage-card border-stage-border hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Modo Culto Oficial: Split Estéreo (IEM / PA)</span>
              </div>
              {routingMode === 'SPLIT_IEM_PA' && (
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 font-bold">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Utiliza um cabo P2 ou P10 em Y:
            </p>
            <ul className="text-xs text-slate-400 space-y-1 mt-2 list-disc list-inside">
              <li><strong>Canal Esquerdo (L):</strong> Click + Guia Vocal + Multitracks para os <em>fones dos músicos</em>.</li>
              <li><strong>Canal Direito (R):</strong> Estritamente as <em>multitracks da banda para a mesa de som / PA</em>. O Click e a Guia ficam com <strong>volume ZERO absoluto</strong> no canal R.</li>
            </ul>
          </div>

          {/* Opção 2: Stereo Full */}
          <div
            onClick={() => onSelectMode('STEREO_FULL')}
            className={`p-4 rounded-2xl border cursor-pointer transition ${
              routingMode === 'STEREO_FULL'
                ? 'bg-blue-500/10 border-blue-500/80 shadow-lg shadow-blue-500/10'
                : 'bg-stage-card border-stage-border hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-bold text-sm text-blue-400">
                <Radio className="w-4 h-4" />
                <span>Modo Ensaio Geral: Stereo Full</span>
              </div>
              {routingMode === 'STEREO_FULL' && (
                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Mixagem estéreo completa com Pan espacial normal. Recomendado para ensaios onde todos ouvem pelo fone de ouvido ou gravações.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition shadow-lg shadow-blue-600/30"
        >
          Confirmar Configuração
        </button>
      </div>
    </div>
  );
};
