// Operacao confiavel (contrato-stems-worker, secao 1): fala com o Firestore como DONO do projeto,
// usando o login que o proprio Firebase CLI ja guarda nesta maquina (`firebase login`).
// Nenhum token e impresso nem gravado; nada disso entra no app nem no Worker.
'use strict';
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const { selectAccount, setActiveAccount } = require('firebase-tools/lib/auth');

const FIRESTORE = 'https://firestore.googleapis.com';

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
  }
  throw new Error(`tipo nao suportado: ${typeof value}`);
}

function decode(field) {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('nullValue' in field) return null;
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(decode);
  if ('mapValue' in field) return decodeFields(field.mapValue.fields || {});
  return undefined;
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, decode(v)]));
}

async function connect(projectId) {
  const account = selectAccount(undefined, process.cwd());
  if (!account) throw new Error('Firebase CLI sem login nesta maquina: rode `npx firebase login`.');
  const options = { project: projectId, user: account.user, tokens: account.tokens };
  setActiveAccount(options, account);
  await requireAuth(options);
  const client = new Client({ urlPrefix: FIRESTORE, auth: true, apiVersion: 'v1' });
  const root = `projects/${projectId}/databases/(default)/documents`;
  return {
    async get(path) {
      const res = await client.request({ method: 'GET', path: `${root}/${path}`, resolveOnHTTPError: true });
      if (res.status === 404) return null;
      if (res.status >= 400) throw new Error(`GET ${path}: HTTP ${res.status}`);
      return decodeFields(res.body.fields);
    },
    /** Cria so se nao existir (precondicao exists=false): rodar de novo nao sobrescreve nada. */
    async createIfMissing(path, data) {
      const writes = [{ update: { name: `${root}/${path}`, fields: encode(data).mapValue.fields }, currentDocument: { exists: false } }];
      const res = await client.request({
        method: 'POST',
        path: `projects/${projectId}/databases/(default)/documents:commit`,
        body: { writes },
        resolveOnHTTPError: true
      });
      if (res.status === 200) return 'created';
      const message = JSON.stringify(res.body || {});
      if (/ALREADY_EXISTS|already exists/i.test(message)) return 'exists';
      throw new Error(`commit ${path}: HTTP ${res.status} ${message.slice(0, 300)}`);
    }
  };
}

module.exports = { connect, encode, decodeFields };
