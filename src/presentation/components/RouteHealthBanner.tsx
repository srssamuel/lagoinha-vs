import React from 'react';
import { AudioRouteHealth } from '../../application/ports/AudioEnginePort';

interface RouteHealthBannerProps {
  routeHealth?: AudioRouteHealth;
  routeLossReason?: string | null;
  onOpenRouting: () => void;
  onConfirmRecovery: () => void;
}

/**
 * Alerta de segurança de rota de áudio de palco (ENG-02): interface perdida
 * (playback já interrompido) ou reconectada (play bloqueado até revalidação explícita).
 */
export const RouteHealthBanner: React.FC<RouteHealthBannerProps> = ({
  routeHealth,
  routeLossReason,
  onOpenRouting,
  onConfirmRecovery
}) => {
  if (routeHealth === 'lost') {
    return (
      <div className="bg-red-950/90 border-b border-red-500 text-red-100 px-4 py-2 flex items-center justify-between z-50 text-xs sm:text-sm animate-pulse">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wider bg-red-600 px-2 py-0.5 rounded text-[10px] text-white">
            Falha de Saída
          </span>
          <span>
            {routeLossReason ||
              'A interface de áudio foi desconectada. Reprodução interrompida para proteger PA e fones.'}
          </span>
        </div>
        <button
          onClick={onOpenRouting}
          className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-semibold rounded text-xs transition"
        >
          Abrir Roteamento
        </button>
      </div>
    );
  }

  if (routeHealth === 'reconnected') {
    return (
      <div className="bg-amber-950/90 border-b border-amber-500 text-amber-100 px-4 py-2 flex items-center justify-between z-50 text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wider bg-amber-600 px-2 py-0.5 rounded text-[10px] text-white">
            Interface Reconectada
          </span>
          <span>Interface de áudio restabelecida. Revalide a rota física antes de retomar o playback.</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onConfirmRecovery}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded text-xs transition"
          >
            Revalidar Saída Agora
          </button>
          <button
            onClick={onOpenRouting}
            className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-amber-200"
          >
            Verificar Canais
          </button>
        </div>
      </div>
    );
  }

  return null;
};
