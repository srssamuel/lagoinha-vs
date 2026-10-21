import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { getPwaSnapshot, shouldOfferUpdate, subscribePwa } from '../../infrastructure/pwa/pwaStore';
import { applyPendingUpdate } from '../../infrastructure/pwa/registerServiceWorker';
import { parseCloudSongKey } from '../../domain/services/CloudSongKey';

interface PwaStatusProps {
  /** Reprodução ou pad ao vivo: enquanto verdadeiro, a atualização fica pendente e invisível. */
  live: boolean;
  /** Repertório atual do player; as músicas com chave de acervo online são as preparadas no aparelho. */
  songs: ReadonlyArray<{ id: string }>;
}

const SHELL_TEXT = {
  ready: 'App disponível offline',
  installing: 'Preparando o app para offline…',
  error: 'App offline indisponível',
  unsupported: 'App offline indisponível neste navegador'
} as const;

/**
 * Dois estados distintos, nunca confundidos:
 *  1. "App disponível offline": o service worker guardou o app (telas e código). Não inclui áudio.
 *  2. "Culto preparado no aparelho": as músicas do acervo estão no IndexedDB (via "Preparar e abrir offline"),
 *     cada uma gravada só depois de ter todos os stems.
 * Mais o aviso de atualização, que só aparece com o palco parado e nunca recarrega sozinho.
 */
export const PwaStatus: React.FC<PwaStatusProps> = ({ live, songs }) => {
  const pwa = useSyncExternalStore(subscribePwa, getPwaSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (live) setDismissed(false);
  }, [live]);

  const prepared = songs.filter((s) => parseCloudSongKey(s.id) !== null).length;
  const offerUpdate = shouldOfferUpdate({ updatePending: pwa.updatePending, live, dismissed });

  return (
    <>
      <div
        data-testid="pwa-status"
        data-shell={pwa.shell}
        data-prepared={prepared}
        data-update-pending={pwa.updatePending}
        title={`Versão do app: ${pwa.buildTag}`}
        className="fixed bottom-2 left-2 z-40 flex flex-col gap-0.5 rounded border border-slate-700 bg-black/70 px-2 py-1 text-[10px] leading-tight text-slate-300 pointer-events-none"
      >
        <span className={pwa.shell === 'ready' ? 'text-emerald-400' : 'text-amber-400'}>{SHELL_TEXT[pwa.shell]}</span>
        <span className={prepared > 0 ? 'text-emerald-400' : 'text-slate-400'}>
          {prepared > 0 ? `Culto preparado no aparelho: ${prepared} música(s)` : 'Culto não preparado neste aparelho'}
        </span>
      </div>
      {offerUpdate && (
        <div
          role="alertdialog"
          aria-label="Atualização do aplicativo"
          data-testid="pwa-update"
          className="fixed bottom-2 right-2 z-50 flex max-w-sm flex-col gap-2 rounded border border-blue-500 bg-slate-900 p-3 text-sm text-slate-100 shadow-lg"
        >
          <span>Há uma versão nova do aplicativo. Atualize só fora do culto; o culto preparado continua no aparelho.</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={applying}
              onClick={() => {
                setApplying(true);
                void applyPendingUpdate();
              }}
              className="min-h-[44px] rounded bg-blue-600 px-3 font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {applying ? 'Atualizando…' : 'Atualizar agora'}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="min-h-[44px] rounded border border-slate-600 px-3 text-slate-200 hover:bg-slate-800"
            >
              Depois
            </button>
          </div>
        </div>
      )}
    </>
  );
};
