// Alvo "worker": HTTP ao Worker do contrato (docs/architecture/contrato-stems-worker.md, secao 5).
// O ID token vem de um ARQUIVO (caminho em MIGRATOR_ID_TOKEN_FILE), relido a cada requisicao; este modulo nao faz login
// e nunca registra o token em log.
import fs from 'node:fs';
import { sleep } from '../util.mjs';
import { headerSafeName, routeScope } from './keys.mjs';

const SINGLE_PUT_MAX = 95 * 1024 * 1024;
const PART_SIZE = 50 * 1024 * 1024;

export class WorkerStorage {
  constructor({ baseUrl, tokenFile, fetchImpl = fetch, retries = 3, backoffMs = 800 }) {
    if (!baseUrl) throw new Error('workerUrl nao configurado (MIGRATOR_WORKER_URL)');
    if (!tokenFile) throw new Error('MIGRATOR_ID_TOKEN_FILE nao definido');
    this.name = 'worker';
    this.base = baseUrl.replace(/\/+$/, '') + '/v1';
    this.tokenFile = tokenFile;
    this.fetch = fetchImpl;
    this.retries = retries;
    this.backoffMs = backoffMs;
    this.stats = { heads: 0, puts: 0, putBytes: 0, verifies: 0, sources: 0 };
  }

  token() {
    const t = fs.readFileSync(this.tokenFile, 'utf8').trim();
    if (!t) throw new Error('arquivo de token vazio');
    return t;
  }

  async req(method, url, { headers = {}, body } = {}) {
    let last;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await this.fetch(url, { method, headers: { authorization: `Bearer ${this.token()}`, ...headers }, body });
        if (res.status === 401) throw Object.assign(new Error('401 nao autenticado (token ausente, expirado ou invalido)'), { fatal: true });
        // 409 in_progress: outro envio do mesmo hash segura a reserva (envio em paralelo); espera e tenta de novo.
        if (res.status >= 500 || res.status === 429 || res.status === 409) {
          last = new Error(`HTTP ${res.status}`);
          await res.arrayBuffer().catch(() => {});
        } else return res;
      } catch (e) {
        if (e.fatal) throw e;
        last = e;
      }
      await sleep(this.backoffMs * 2 ** attempt);
    }
    throw last;
  }

  blobUrl(scope, sha256) {
    return `${this.base}/${routeScope(scope)}/blobs/${sha256}`;
  }

  async head(scope, sha256) {
    this.stats.heads++;
    const res = await this.req('HEAD', this.blobUrl(scope, sha256));
    if (res.status === 404) return { exists: false };
    if (res.status === 200) return { exists: true, size: Number(res.headers.get('content-length')), integrity: res.headers.get('x-integrity') };
    if (res.status === 403) throw new Error('403 sem permissao no escopo');
    throw new Error(`HEAD inesperado: ${res.status}`);
  }

  async put(scope, sha256, openStream, { size, contentType, originalName } = {}) {
    const cur = await this.head(scope, sha256);
    if (cur.exists) return { created: false };
    const headers = { 'content-type': contentType ?? 'application/octet-stream', 'x-original-name': headerSafeName(originalName) };
    const url = this.blobUrl(scope, sha256);
    if (size != null && size > SINGLE_PUT_MAX) return this.multipart(scope, sha256, openStream, { size, headers });
    const body = await readAll(openStream());
    const res = await this.req('PUT', url, { headers, body });
    if (res.status === 400) throw new Error('sha256_mismatch (o Worker/R2 recusou o conteudo)');
    if (res.status !== 201 && res.status !== 200) throw new Error(`PUT falhou: ${res.status}`);
    this.stats.puts += res.status === 201 ? 1 : 0;
    this.stats.putBytes += body.length;
    return { created: res.status === 201 };
  }

  async multipart(scope, sha256, openStream, { size, headers }) {
    const url = this.blobUrl(scope, sha256);
    const init = await this.req('POST', `${url}/multipart`, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size, contentType: headers['content-type'] }),
    });
    if (init.status !== 201) throw new Error(`multipart: criar falhou (${init.status})`);
    const { uploadId } = await init.json();
    const parts = [];
    try {
      let n = 0;
      for await (const part of chunked(openStream(), PART_SIZE)) {
        n++;
        const r = await this.req('PUT', `${url}/multipart/${uploadId}/${n}`, { headers: { 'content-type': 'application/octet-stream' }, body: part });
        if (r.status !== 200) throw new Error(`multipart: parte ${n} falhou (${r.status})`);
        parts.push({ partNumber: n, etag: (await r.json()).etag });
      }
      const done = await this.req('POST', `${url}/multipart/${uploadId}/complete`, {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parts }),
      });
      if (done.status !== 201) throw new Error(`multipart: completar falhou (${done.status})`);
    } catch (e) {
      await this.req('DELETE', `${url}/multipart/${uploadId}`).catch(() => {});
      throw e;
    }
    this.stats.puts++;
    this.stats.putBytes += size;
    return { created: true };
  }

  /** HEAD + tamanho. No multipart a integridade e 'client-declared': quem baixa confere (fora do escopo do migrador). */
  async verify(scope, sha256, { size } = {}) {
    this.stats.verifies++;
    const h = await this.head(scope, sha256);
    if (!h.exists) return { ok: false, detail: 'HEAD 404 apos o upload' };
    if (size != null && h.size !== size) return { ok: false, detail: `tamanho ${h.size} != ${size}` };
    return { ok: true, integrity: h.integrity };
  }

  async recordSource(scope, sha256, src) {
    const body = {
      kind: src.kind === 'zip-entry' ? 'zip-entry' : 'drive',
      sourceId: src.sourceId, path: src.path, name: src.name, modifiedAt: src.modifiedAt, size: src.size, md5: src.md5,
    };
    const res = await this.req('POST', `${this.blobUrl(scope, sha256)}/sources`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status !== 201 && res.status !== 200) throw new Error(`registro de origem falhou: ${res.status}`);
    this.stats.sources++;
  }
}

async function readAll(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

async function* chunked(stream, size) {
  let buf = [];
  let len = 0;
  for await (const c of stream) {
    buf.push(c);
    len += c.length;
    while (len >= size) {
      const all = Buffer.concat(buf);
      yield all.subarray(0, size);
      const rest = all.subarray(size);
      buf = rest.length ? [rest] : [];
      len = rest.length;
    }
  }
  if (len) yield Buffer.concat(buf);
}
