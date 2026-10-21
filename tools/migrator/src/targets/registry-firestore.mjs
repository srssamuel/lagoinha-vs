// Alvo "firestore": REST com o mesmo ID token (arquivo em MIGRATOR_ID_TOKEN_FILE). As regras decidem o acesso:
// o migrador age como usuario admin da igreja. Sem login aqui; token nunca vai para log.
import fs from 'node:fs';
import { sleep } from '../util.mjs';

export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  throw new Error(`tipo nao suportado: ${typeof v}`);
}

export function toFields(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toValue(v)]));
}

export function fromValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields ?? {});
  return undefined;
}

export const fromFields = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, fromValue(v)]));

export class FirestoreRegistry {
  constructor({ projectId, tokenFile, fetchImpl = fetch, baseUrl = 'https://firestore.googleapis.com', retries = 3, backoffMs = 800 }) {
    if (!tokenFile) throw new Error('MIGRATOR_ID_TOKEN_FILE nao definido');
    this.name = 'firestore';
    this.tokenFile = tokenFile;
    this.fetch = fetchImpl;
    this.root = `${baseUrl}/v1/projects/${projectId}/databases/(default)/documents`;
    this.retries = retries;
    this.backoffMs = backoffMs;
    this.stats = { songWrites: 0, versionCreates: 0 };
  }

  token() {
    const t = fs.readFileSync(this.tokenFile, 'utf8').trim();
    if (!t) throw new Error('arquivo de token vazio');
    return t;
  }

  /** uid = sub do token (so o payload e lido; a assinatura e conferida pelo servidor). */
  get uid() {
    const payload = JSON.parse(Buffer.from(this.token().split('.')[1], 'base64url').toString('utf8'));
    if (!payload.sub) throw new Error('token sem sub');
    return payload.sub;
  }

  async req(method, url, body) {
    let last;
    for (let a = 0; a <= this.retries; a++) {
      try {
        const res = await this.fetch(url, {
          method,
          headers: { authorization: `Bearer ${this.token()}`, 'content-type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401) throw Object.assign(new Error('401 token invalido/expirado'), { fatal: true });
        if (res.status >= 500 || res.status === 429) {
          last = new Error(`HTTP ${res.status}`);
          await res.arrayBuffer().catch(() => {});
        } else return res;
      } catch (e) {
        if (e.fatal) throw e;
        last = e;
      }
      await sleep(this.backoffMs * 2 ** a);
    }
    throw last;
  }

  async getSong(churchId, songId) {
    const res = await this.req('GET', `${this.root}/churches/${churchId}/library/${songId}`);
    if (res.status === 404) return null;
    if (res.status !== 200) throw new Error(`GET musica: ${res.status}`);
    return fromFields((await res.json()).fields ?? {});
  }

  async setSong(churchId, songId, data) {
    const res = await this.req('PATCH', `${this.root}/churches/${churchId}/library/${songId}`, { fields: toFields(data) });
    if (res.status === 403) throw new Error('403: as regras negaram a escrita da musica');
    if (res.status !== 200) throw new Error(`PATCH musica: ${res.status}`);
    this.stats.songWrites++;
  }

  async createVersion(churchId, songId, versionId, data) {
    const url = `${this.root}/churches/${churchId}/library/${songId}/versions/${versionId}?currentDocument.exists=false`;
    const res = await this.req('PATCH', url, { fields: toFields(data) });
    if (res.status === 409 || res.status === 412) return 'exists';
    if (res.status === 403) throw new Error('403: as regras negaram a versao');
    if (res.status !== 200) throw new Error(`PATCH versao: ${res.status}`);
    this.stats.versionCreates++;
    return 'created';
  }

  async getVersion(churchId, songId, versionId) {
    const res = await this.req('GET', `${this.root}/churches/${churchId}/library/${songId}/versions/${versionId}`);
    if (res.status === 404) return null;
    if (res.status !== 200) throw new Error(`GET versao: ${res.status}`);
    return fromFields((await res.json()).fields ?? {});
  }
}
