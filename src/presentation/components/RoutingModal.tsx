import React, { useState } from 'react';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import { AudioOutputDeviceInfo, AudioRouteHealth } from '../../application/ports/AudioEnginePort';
import {
  X,
  ShieldCheck,
  Radio,
  Check,
  Layers,
  Cpu,
  AlertTriangle,
  Volume2,
  HelpCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Headphones,
  Sliders,
  Sparkles,
  AlertOctagon
} from 'lucide-react';

interface RoutingModalProps {
  isOpen: boolean;
  routingMode: RoutingMode;
  audioHardwareChannels?: number;
  availableDevices?: AudioOutputDeviceInfo[];
  selectedDeviceId?: string;
  routeHealth?: AudioRouteHealth;
  routeLossReason?: string | null;
  onSelectMode: (mode: RoutingMode) => void;
  onSelectDevice?: (deviceId: string) => void;
  onRequestDevicePermissions?: () => void;
  onTestChannelTone?: (channelIndex: number) => void;
  onConfirmRouteRecovery?: () => void;
  onClose: () => void;
}

export const RoutingModal: React.FC<RoutingModalProps> = ({
  isOpen,
  routingMode,
  audioHardwareChannels = 2,
  availableDevices = [],
  selectedDeviceId = 'default',
  routeHealth = 'healthy',
  routeLossReason,
  onSelectMode,
  onSelectDevice,
  onRequestDevicePermissions,
  onTestChannelTone,
  onConfirmRouteRecovery,
  onClose
}) => {
  const [testingChannel, setTestingChannel] = useState<number | null>(null);
  const [isWindowsGuideOpen, setIsWindowsGuideOpen] = useState(false);
  const [isScanningDevices, setIsScanningDevices] = useState(false);

  if (!isOpen) return null;

  const hasMultichannelHardware = audioHardwareChannels >= 4;

  const handleTestChannel = (channelIdx: number) => {
    setTestingChannel(channelIdx);
    onTestChannelTone?.(channelIdx);
    setTimeout(() => {
      setTestingChannel((prev) => (prev === channelIdx ? null : prev));
    }, 1250);
  };

  const handleRequestPermissions = async () => {
    setIsScanningDevices(true);
    try {
      await onRequestDevicePermissions?.();
    } finally {
      setTimeout(() => setIsScanningDevices(false), 600);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-[#10141f] border border-stage-border rounded-3xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[92vh]">
        {/* Botão Fechar */}
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
            <h3 className="text-base sm:text-lg font-black text-white tracking-wide uppercase flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Roteamento de Áudio de Palco (IEM & PA)
            </h3>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
              LAGOINHA AUDIO TECH
            </span>
          </div>
          <p className="text-xs text-stage-muted mt-1 leading-relaxed">
            Distribuição independente para a mesa principal FOH (Congregação) e sistema de monitoração in-ear (Banda).
          </p>
        </div>

        {/* Área Rolável */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1 mb-4">
          {/* BANNER DE EMERGÊNCIA: Perda de Interface de Saída (ENG-02) */}
          {routeHealth === 'lost' && (
            <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/70 text-rose-200 space-y-2 animate-pulse">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" />
                <h4 className="text-xs font-black uppercase tracking-wider text-rose-100">
                  ALERTA DE SEGURANÇA: Interface de Saída Desconectada!
                </h4>
              </div>
              <p className="text-xs text-rose-300/90 leading-relaxed">
                {routeLossReason ||
                  'A interface física foi perdida. O player foi pausado automaticamente para impedir vazamento do metrônomo para os alto-falantes do templo.'}
              </p>
            </div>
          )}

          {/* BANNER DE RECONEXÃO: Revalidação Obrigatória pelo Operador */}
          {routeHealth === 'reconnected' && (
            <div className="p-4 rounded-2xl bg-amber-950/80 border border-amber-500/70 text-amber-200 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-100">
                    Interface Detectada Novamente
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={onConfirmRouteRecovery}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition"
                >
                  Revalidar Rota de Palco
                </button>
              </div>
              <p className="text-xs text-amber-300/90 leading-relaxed">
                {routeLossReason ||
                  'Clique no botão acima para religar as 4 saídas discretas antes de retomar o playback.'}
              </p>
            </div>
          )}

          {/* CARD 1: Detecção e Seleção de Interface de Áudio (Física USB vs Virtual) */}
          <div className="p-4 rounded-2xl bg-stage-card/80 border border-stage-border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Interface de Saída de Áudio (WASAPI / USB / Virtual)
                </span>
              </div>

              {/* Status de Canais Reportados */}
              {hasMultichannelHardware ? (
                <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-[11px] font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  {audioHardwareChannels} Canais Ativos no SO (4CH Discreto Pronto)
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[11px] font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  {audioHardwareChannels} Canais Reportados (Modo Estéreo)
                </span>
              )}
            </div>

            {/* Dropdown de Dispositivos + Botão Escanear/Permitir */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <select
                  value={selectedDeviceId}
                  onChange={(e) => onSelectDevice?.(e.target.value)}
                  className="w-full bg-slate-900 border border-stage-border text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value="default">Dispositivo Padrão do Windows (WASAPI Default)</option>
                  {availableDevices.map((dev) => (
                    <option key={dev.deviceId} value={dev.deviceId}>
                      {dev.isUsb ? '🔌 [USB FÍSICA] ' : dev.isVirtual ? '🎛️ [VIRTUAL] ' : '💻 [INTEGRADA] '}
                      {dev.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleRequestPermissions}
                disabled={isScanningDevices}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-stage-border transition active:scale-95 shrink-0"
                title="Solicita permissão de áudio no navegador para listar os nomes reais das interfaces USB e cabos virtuais"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isScanningDevices ? 'animate-spin' : ''}`} />
                <span>{isScanningDevices ? 'Escaneando...' : 'Detectar Placas & Cabos'}</span>
              </button>
            </div>

            {/* Banner Didático com Toggle para Configuração no Windows */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsWindowsGuideOpen((prev) => !prev)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-blue-950/30 border border-blue-500/30 text-xs text-blue-300 hover:bg-blue-950/50 transition font-semibold"
              >
                <span className="flex items-center gap-2 text-left">
                  <HelpCircle className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Por que canais virtuais aparecem como 2 canais por padrão no Windows?</span>
                </span>
                {isWindowsGuideOpen ? (
                  <ChevronUp className="w-4 h-4 shrink-0 text-blue-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0 text-blue-400" />
                )}
              </button>

              {isWindowsGuideOpen && (
                <div className="mt-2.5 p-3.5 rounded-2xl bg-slate-900/90 border border-blue-500/30 text-xs text-slate-300 space-y-2.5 animate-in fade-in">
                  <div className="space-y-1">
                    <strong className="text-white font-bold block flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      1. Canais Virtuais (VoiceMeeter / VB-Cable / Dante DVS):
                    </strong>
                    <p className="text-slate-400 leading-relaxed text-[11px]">
                      No Windows, qualquer placa de som virtual é criada inicialmente no formato <strong>Estéreo (2 canais)</strong>. Para o navegador liberar as 4 saídas discretas para sua DAW/VoiceMeeter:
                    </p>
                    <ol className="list-decimal list-inside text-[11px] text-slate-300 space-y-1 pl-1">
                      <li>Pressione as teclas <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">Win + R</kbd>, digite <span className="font-mono text-emerald-400">mmsys.cpl</span> e tecle Enter.</li>
                      <li>Na aba <strong>&ldquo;Reprodução&rdquo;</strong>, clique no seu dispositivo virtual com o botão direito e selecione <strong>&ldquo;Configurar Alto-falantes&rdquo;</strong>.</li>
                      <li>Altere de <em>Estéreo</em> para <strong>&ldquo;Quadrafônico (4 canais)&rdquo;</strong> ou <strong>&ldquo;5.1 Surround&rdquo;</strong> e avance até concluir.</li>
                      <li>O Windows passará a entregar 4 saídas discretas ao Lagoinha VS instantaneamente!</li>
                    </ol>
                  </div>

                  <div className="border-t border-slate-800 pt-2 space-y-1">
                    <strong className="text-white font-bold block flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                      2. Interfaces Físicas USB (Behringer UMC404HD, XR18, X32, Scarlett 4i4):
                    </strong>
                    <p className="text-slate-400 leading-relaxed text-[11px]">
                      Basta plugar o cabo USB no computador. Os drivers USB profissionais já informam nativamente ao Windows que existem <strong>4 ou mais saídas físicas line-level</strong>, dispensando qualquer cabo virtual.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CARD 2: Matriz das 4 Saídas Discretas com Teste de Sinal Individual */}
          <div className="p-4 rounded-2xl bg-stage-card border border-stage-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Matriz de Saídas Físicas & Teste de Sinal Line-Level
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Pressione para testar o canal na mesa/fones
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* Canal 1 */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-blue-500/30 flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center justify-between font-bold text-blue-300 mb-0.5">
                    <span>Output 1: VS Left (Playback L)</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-200">Mesa FOH (PA)</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Canal esquerdo do playback estéreo da congregação.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTestChannel(0)}
                  className={`w-full py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    testingChannel === 0
                      ? 'bg-blue-500 text-white animate-pulse shadow-md shadow-blue-500/40 ring-1 ring-blue-300'
                      : 'bg-blue-950/40 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{testingChannel === 0 ? 'Emitindo Tom 440 Hz...' : 'Testar Saída 1 (FOH L)'}</span>
                </button>
              </div>

              {/* Canal 2 */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-blue-500/30 flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center justify-between font-bold text-blue-300 mb-0.5">
                    <span>Output 2: VS Right (Playback R)</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-200">Mesa FOH (PA)</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Canal direito do playback estéreo da congregação.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTestChannel(1)}
                  className={`w-full py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    testingChannel === 1
                      ? 'bg-blue-500 text-white animate-pulse shadow-md shadow-blue-500/40 ring-1 ring-blue-300'
                      : 'bg-blue-950/40 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{testingChannel === 1 ? 'Emitindo Tom 554 Hz...' : 'Testar Saída 2 (FOH R)'}</span>
                </button>
              </div>

              {/* Canal 3 */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/30 flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center justify-between font-bold text-amber-300 mb-0.5">
                    <span>Output 3: Click Track Dedicado</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200">IEM Músicos</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Metrônomo mono puro, sem compressão do master e ZERO no PA.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTestChannel(2)}
                  className={`w-full py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    testingChannel === 2
                      ? 'bg-amber-500 text-slate-950 font-black animate-pulse shadow-md shadow-amber-500/40 ring-1 ring-amber-300'
                      : 'bg-amber-950/40 border border-amber-500/40 text-amber-300 hover:bg-amber-600/30'
                  }`}
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>{testingChannel === 2 ? 'Emitindo Click 1000 Hz...' : 'Testar Saída 3 (Click IEM)'}</span>
                </button>
              </div>

              {/* Canal 4 */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-purple-500/30 flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center justify-between font-bold text-purple-300 mb-0.5">
                    <span>Output 4: Guide Track Dedicado</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200">IEM Músicos</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Voz guia, contagens e referências musicais. ZERO no PA.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTestChannel(3)}
                  className={`w-full py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    testingChannel === 3
                      ? 'bg-purple-500 text-white animate-pulse shadow-md shadow-purple-500/40 ring-1 ring-purple-300'
                      : 'bg-purple-950/40 border border-purple-500/40 text-purple-300 hover:bg-purple-600/30'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{testingChannel === 3 ? 'Emitindo Tom 880 Hz...' : 'Testar Saída 4 (Guia IEM)'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* CARD 3: Opções de Modo de Roteamento */}
          <div className="space-y-2.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Selecione o Modo de Operação no Culto:
            </span>

            {/* Opção 1: 4 Saídas Discretas (Padrão Leandro Machado Lagoinha) */}
            <div
              onClick={() => onSelectMode('MULTI_4CH_DISCRETE')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                routingMode === 'MULTI_4CH_DISCRETE'
                  ? 'bg-blue-600/15 border-blue-500/90 shadow-xl shadow-blue-500/10 ring-1 ring-blue-400/50'
                  : 'bg-stage-card border-stage-border hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
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
              <p className="text-xs text-slate-300 leading-relaxed">
                Distribui 4 saídas mono físicas independentes line-level: Ch 1 (VS L FOH) | Ch 2 (VS R FOH) | Ch 3 (Click IEM) | Ch 4 (Guia IEM).
              </p>
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
              <div className="flex items-center justify-between mb-1.5">
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
              <p className="text-xs text-slate-300 leading-relaxed">
                Canal L (Fones IEM): Click + Guia Vocal + Multitracks | Canal R (Mesa PA): Somente Multitracks (Click e Guia com volume ZERO absoluto).
              </p>
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
              <div className="flex items-center justify-between mb-1.5">
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
                Mixagem estéreo completa com Pan livre. Recomendado para ensaios onde todos ouvem por fones individuais ou gravação.
              </p>
            </div>
          </div>
        </div>

        {/* Rodapé / Botão de Confirmação */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-lg shadow-blue-600/30 shrink-0"
        >
          Confirmar Configuração de Palco
        </button>
      </div>
    </div>
  );
};
