import { lazy, useEffect, useState } from 'react';

/**
 * Modais pesados fora do bundle inicial. Roteamento e MIDI ficam no bundle
 * principal: a recuperação de rota (ENG-02) não pode depender de baixar código.
 */
const loaders = {
  cloudLibrary: () => import('./components/CloudVSLibraryModal'),
  cifra: () => import('./components/CifraProModal'),
  vstRack: () => import('./components/VstPluginRackModal'),
  help: () => import('./components/HelpGuideModal'),
  adminUsers: () => import('./components/AdminUsersModal')
};

export const CloudVSLibraryModal = lazy(() => loaders.cloudLibrary().then((m) => ({ default: m.CloudVSLibraryModal })));
export const CifraProModal = lazy(() => loaders.cifra().then((m) => ({ default: m.CifraProModal })));
export const VstPluginRackModal = lazy(() => loaders.vstRack().then((m) => ({ default: m.VstPluginRackModal })));
export const HelpGuideModal = lazy(() => loaders.help().then((m) => ({ default: m.HelpGuideModal })));
export const AdminUsersModal = lazy(() => loaders.adminUsers().then((m) => ({ default: m.AdminUsersModal })));

/**
 * Baixa todos os modais logo após a abertura do app (ocioso): se a rede cair
 * no culto, os módulos já estão na memória e abrem offline (ENG-01).
 */
export function usePrefetchLazyModals(delayMs = 1500): void {
  useEffect(() => {
    const id = window.setTimeout(() => {
      Object.values(loaders).forEach((load) => {
        load().catch((err: unknown) => console.warn('[lazyModals] pré-carregamento falhou:', err));
      });
    }, delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);
}

/** Monta o modal só depois da primeira abertura e o mantém montado (preserva o estado interno). */
export function useHasOpened(isOpen: boolean): boolean {
  const [opened, setOpened] = useState(isOpen);
  if (isOpen && !opened) setOpened(true);
  return opened;
}
