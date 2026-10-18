import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  Radio,
  Zap,
  RotateCcw
} from 'lucide-react';
import {
  WebMidiHardwareService,
  MidiBinding,
  MidiDeviceStatus,
  MidiActionId
} from '../../infrastructure/midi/WebMidiHardwareService';

interface MidiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MidiModal: React.FC<MidiModalProps> = ({ isOpen, onClose }) => {
  const midiService = WebMidiHardwareService.getInstance();
  const [bindings, setBindings] = useState<MidiBinding[]>(() => midiService.getBindings());
  const [deviceStatus, setDeviceStatus] = useState<MidiDeviceStatus>(() => midiService.getStatus());
  const [learningActionId, setLearningActionId] = useState<MidiActionId | null>(null);

  useEffect(() => {
    if (isOpen) {
      void midiService.init();
      const unsubscribe = midiService.subscribeStatus((status) => {
        setDeviceStatus(status);
        setBindings(midiService.getBindings());
        setLearningActionId(midiService.getLearningActionId());
      });
      return () => unsubscribe();
    }
  }, [isOpen, midiService]);

  if (!isOpen) return null;

  const handleStartLearn = (actionId: MidiActionId) => {
    if (learningActionId === actionId) {
      midiService.cancelLearning();
      setLearningActionId(null);
    } else {
      midiService.startLearning(actionId);
      setLearningActionId(actionId);
    }
  };

  const handleResetBindings = () => {
    midiService.resetDefaultBindings();
    setBindings(midiService.getBindings());
    setLearningActionId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
      <div className="bg-[#121824] border border-stage-border rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[88vh]">
        {/* Header no estilo do console de palco */}
        <div className="flex items-center justify-between border-b border-stage-border pb-4 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white tracking-wide uppercase">
                  Controle MIDI & Pedaleiras USB
                </h3>
                <span
                  className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                    deviceStatus.isConnected
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      deviceStatus.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  {deviceStatus.isConnected
                    ? `${deviceStatus.deviceNames.length} Dispositivo(s)`
                    : 'Aguardando Pedal'}
                </span>
              </div>
              <p className="text-xs text-stage-muted mt-0.5">
                M-VAVE Chocolate, Ampero Control, Behringer FCB1010, Korg nanoKONTROL e teclado de palco.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-stage-card border border-stage-border text-stage-muted hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status de Conexão MIDI em Tempo Real */}
        <div className="bg-slate-900/80 border border-stage-border p-3 rounded-2xl mb-4 shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Radio
              className={`w-4 h-4 shrink-0 ${
                deviceStatus.isConnected ? 'text-emerald-400 animate-pulse' : 'text-purple-400'
              }`}
            />
            <div className="min-w-0 truncate">
              {deviceStatus.deviceNames.length > 0 ? (
                <span className="font-bold text-slate-200">
                  Conectado: {deviceStatus.deviceNames.join(', ')}
                </span>
              ) : (
                <span className="text-slate-400">
                  Nenhum pedal USB detectado. Conecte sua pedaleira para ativar.
                </span>
              )}
            </div>
          </div>

          {deviceStatus.lastMessage && (
            <span className="font-mono text-[10px] text-amber-300 font-bold bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30 shrink-0">
              Último Sinal: {deviceStatus.lastMessage}
            </span>
          )}
        </div>

        {/* Lista de Ações Mapeáveis com MIDI Learn */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-4">
          {bindings.map((b) => {
            const isLearning = learningActionId === b.actionId;

            return (
              <div
                key={b.actionId}
                className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition ${
                  isLearning
                    ? 'bg-amber-500/15 border-amber-400 shadow-md shadow-amber-500/10'
                    : 'bg-stage-card border-stage-border hover:border-slate-700'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-bold text-xs text-slate-100 flex items-center gap-1.5 truncate">
                    <span>{b.actionName}</span>
                    <span className="text-[10px] font-mono text-stage-amber">
                      [{b.currentKey}]
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 block mt-0.5 truncate">
                    {b.description}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartLearn(b.actionId)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                      isLearning
                        ? 'bg-amber-500 text-slate-950 font-black animate-pulse shadow-md shadow-amber-500/30'
                        : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-purple-400'
                    }`}
                    title="Clique e pise no pedal para associar este comando"
                  >
                    {isLearning ? (
                      <>
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>Pise no Pedal...</span>
                      </>
                    ) : (
                      <>
                        <Sliders className="w-3 h-3 text-purple-400" />
                        <span>Aprender MIDI</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Botões de Ação Inferiores */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-stage-border shrink-0">
          <button
            type="button"
            onClick={handleResetBindings}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stage-border bg-stage-card text-xs text-slate-400 hover:text-white transition"
            title="Restaurar comandos padrão de teclado e pedaleira"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Padrão</span>
          </button>

          <button
            type="button"
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
