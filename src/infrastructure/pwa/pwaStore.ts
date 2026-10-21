/**
 * Estado do service worker do app (PWA), observável pela interface.
 *  - shell: "aplicativo disponível offline" = SW ativo, o que implica o precache completo do build
 *    (o Workbox só ativa depois de baixar todo o precache). NÃO diz nada sobre os stems do culto.
 *  - updatePending: há versão nova baixada e em espera. Nada é aplicado sem ação explícita.
 */
export type ShellState = 'unsupported' | 'installing' | 'ready' | 'error';

export interface PwaSnapshot {
  shell: ShellState;
  updatePending: boolean;
  buildTag: string;
}

let snapshot: PwaSnapshot = { shell: 'unsupported', updatePending: false, buildTag: typeof __BUILD_TAG__ === 'string' ? __BUILD_TAG__ : 'dev' };
const listeners = new Set<() => void>();

export const getPwaSnapshot = (): PwaSnapshot => snapshot;

export function subscribePwa(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function patchPwa(patch: Partial<PwaSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

/**
 * Regra de momento seguro: a atualização pendente só é oferecida com o palco parado
 * (sem reprodução e sem pad ao vivo) e se a pessoa não adiou até a próxima reprodução.
 */
export function shouldOfferUpdate(input: { updatePending: boolean; live: boolean; dismissed: boolean }): boolean {
  return input.updatePending && !input.live && !input.dismissed;
}
