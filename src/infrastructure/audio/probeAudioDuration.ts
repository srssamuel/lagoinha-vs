/**
 * Duração (s) de um áudio pelo cabeçalho, sem decodificar tudo. Devolve 0 quando o ambiente não sabe
 * (sem DOM, arquivo ilegível, tempo esgotado): quem chama trata 0 como "desconhecida".
 */
export function probeAudioDuration(blob: Blob, timeoutMs = 8000): Promise<number> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return Promise.resolve(0);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = document.createElement('audio');
    let settled = false;
    const done = (seconds: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.onloadedmetadata = null;
      el.onerror = null;
      el.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
    };
    const timer = setTimeout(() => done(0), timeoutMs);
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    el.src = url;
  });
}
