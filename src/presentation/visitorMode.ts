/**
 * Modo visitante da biblioteca pública: o player abre sem login com o que foi preparado neste aparelho.
 * Fica no localStorage para valer ao reabrir sem internet; entrar com uma conta desliga.
 */
const KEY = 'lagoinha-vs:modo-visitante';

export function isVisitorMode(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function enterVisitorMode(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // sem armazenamento: o player ainda abre nesta carga pela URL
  }
}

export function leaveVisitorMode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada a limpar
  }
}

/** Música pedida pela biblioteca ao abrir o player (`/?tocar=cloud:global:...`). */
export function requestedSongId(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('tocar');
  } catch {
    return null;
  }
}
