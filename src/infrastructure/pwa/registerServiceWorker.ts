import { registerSW } from 'virtual:pwa-register';
import { patchPwa } from './pwaStore';

const UPDATE_CHECK_MS = 15 * 60 * 1000;

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

/** Registra o service worker. Só roda em build de produção servido por http(s) seguro/localhost. */
export function initServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  patchPwa({ shell: 'installing' });
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Versão nova pronta e em espera: só marca. Quem decide o momento é a interface.
      patchPwa({ updatePending: true });
    },
    onOfflineReady() {
      patchPwa({ shell: 'ready' });
    },
    onRegisteredSW(_url, registration) {
      // Worker ativo = precache completo (o Workbox só ativa depois de baixar tudo).
      if (registration?.active) patchPwa({ shell: 'ready' });
      void navigator.serviceWorker.ready.then((reg) => {
        if (reg.active) patchPwa({ shell: 'ready' });
      });
      if (registration) window.setInterval(() => void registration.update().catch(() => undefined), UPDATE_CHECK_MS);
    },
    onRegisterError() {
      patchPwa({ shell: 'error' });
    }
  });
}

/** Ativa a versão em espera e recarrega. Chamado só por um toque explícito, com o palco parado. */
export async function applyPendingUpdate(): Promise<void> {
  await applyUpdate?.(true);
}
