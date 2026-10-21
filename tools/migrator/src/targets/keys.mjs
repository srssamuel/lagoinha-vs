// Chaves e rotas do contrato (secoes 2 e 5).
export const SHA_RE = /^[0-9a-f]{64}$/;

/** scope do D1: 'church:{id}' | 'catalog' */
export function r2Key(scope, sha256) {
  if (!SHA_RE.test(sha256)) throw new Error('sha256 invalido');
  if (scope === 'catalog') return `catalog/blobs/${sha256}`;
  const m = /^church:([a-z0-9-]{1,64})$/.exec(scope);
  if (!m) throw new Error(`escopo invalido: ${scope}`);
  return `churches/${m[1]}/blobs/${sha256}`;
}

/** Segmento de rota do Worker: 'churches/{id}' | 'catalog' */
export function routeScope(scope) {
  if (scope === 'catalog') return 'catalog';
  const m = /^church:([a-z0-9-]{1,64})$/.exec(scope);
  if (!m) throw new Error(`escopo invalido: ${scope}`);
  return `churches/${m[1]}`;
}

/** Cabecalho x-original-name: ASCII imprimivel, ate 255 (o nome verdadeiro vai no registro de origem, em JSON UTF-8). */
export function headerSafeName(name) {
  return String(name ?? '').normalize('NFC').replace(/[^\x20-\x7e]/g, '_').slice(0, 255);
}
