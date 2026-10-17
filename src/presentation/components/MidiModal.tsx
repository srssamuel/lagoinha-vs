import React, { useState } from 'react';
import { X, Sliders, Radio, Trash2, CheckCircle2 } from 'lucide-react';

interface MidiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface KeyBinding {
  actionId: string;
  actionName: string;
  defaultKey: string;
  currentKey: string;
  midiCC: string;
}

export const MidiModal: React.FC<MidiModalProps> = ({ isOpen, onClose }) => {
  const [bindings, setBindings] = useState<KeyBinding[]>([
    { actionId: 'play-pause', actionName: 'Play / Pausar Música', defaultKey: 'Espaço', currentKey: 'Espaço', midiCC: 'CC 64 (Sustain Pedal)' },
    { actionId: 'next-sec', actionName: 'Próxima Seção (Downbeat)', defaultKey: 'N', currentKey: 'N', midiCC: 'CC 21 (Foot 1)' },
    { actionId: 'prev-sec', actionName: 'Seção Anterior', defaultKey: 'P', currentKey: 'P', midiCC: 'CC 22 (Foot 2)' },
    { actionId: 'loop-sec', actionName: 'Repetir Seção (Loop)', defaultKey: 'R', currentKey: 'R', midiCC: 'CC 23 (Foot 3)' },
    { actionId: 'solo-click', actionName: 'Solo Click (Banda Errou)', defaultKey: 'C', currentKey: 'C', midiCC: 'CC 24 (Foot 4)' },
    { actionId: 'panic', actionName: 'Pânico / Fade Out de Emergência', defaultKey: 'ESC', currentKey: 'ESC', midiCC: 'CC 25 (Foot 5)' },
  ]);

  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-[#121824] border border-stage-border rounded-3xl max-w-xl w-full p-6 shadow-2xl relative text-slate-100">
        {/* Header no estilo do modal de Fader Club / Multitracks Elite */}
        <div className="flex items-center justify-between border-b border-stage-border pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>MIDI / Teclado</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  AO VIVO
                </span>
              </h3>
              <p className="text-xs text-stage-muted">
                Mapeamento rápido para pedaleiras USB (Ampero, Chocolate, FCB1010) e teclado de palco.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-stage-card border border-stage-border text-stage-muted hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instrução visual */}
        <div className="bg-slate-900/60 border border-stage-border p-3 rounded-2xl mb-4 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-purple-400 animate-pulse" />
            <span>Pressione uma tecla do notebook ou acione um pedal MIDI para mapear:</span>
          </div>
          <span className="font-mono text-purple-300 font-bold bg-purple-950/70 px-2 py-0.5 rounded border border-purple-800">
            Web MIDI Ativo
          </span>
        </div>

        {/* Lista de Ações Mapeáveis */}
        <div className="space-y-2 mb-6 max-h-72 overflow-y-auto pr-1">
          {bindings.map((b) => {
            const isSelected = selectedActionId === b.actionId;
            return (
              <div
                key={b.actionId}
                onClick={() => setSelectedActionId(b.actionId)}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                  isSelected
                    ? 'bg-purple-600/20 border-purple-400 shadow-md shadow-purple-600/10'
                    : 'bg-stage-card border-stage-border hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="font-bold text-xs text-slate-100 flex items-center gap-2">
                    <span>{b.actionName}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />}
                  </div>
                  <span className="text-[10px] font-mono text-stage-muted block mt-0.5">
                    MIDI: {b.midiCC}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg text-amber-300">
                    {b.currentKey}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Botões de Ação Inferiores */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-stage-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setBindings((prev) =>
                  prev.map((b) => ({ ...b, currentKey: b.defaultKey }))
                );
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stage-border bg-stage-card text-xs text-slate-400 hover:text-white transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Restaurar Padrão</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-lg shadow-purple-600/30"
          >
            Concluir Mapeamento
          </button>
        </div>
      </div>
    </div>
  );
};
