// Auditoria SOMENTE LEITURA dos tons gravados no Firestore: lista as musicas com tom G cuja procedencia nao
// confirma o G (possivel fallback antigo). Nao altera registros, nao reenvia audio, nao imprime tokens.
//   node tools/admin/audit-song-keys.cjs [--project lagoinha-joao-pessoa] [--manifest <manifest.db>] [--report <revisao-g.md>]
// Procedencia que CONFIRMA o G: (1) keyMeta.origin 'name' ou 'manual' (gravado pelo app novo); (2) registro sem keyMeta cujo
// id esta no manifesto do migrador com original_key G (o migrador so le o tom do NOME e grava nulo quando nao ha).
// Stdout traz so contagens; a lista com titulos vai para --report (fora do git).
'use strict';
const fs = require('node:fs');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const { selectAccount, setActiveAccount } = require('firebase-tools/lib/auth');
const { decodeFields } = require('./firestoreAdmin.cjs');

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const PROJECT = opt('project', 'lagoinha-joao-pessoa');
const MANIFEST = opt('manifest');
const REPORT = opt('report');

async function connect() {
  const account = selectAccount(undefined, process.cwd());
  if (!account) throw new Error('Firebase CLI sem login nesta maquina: rode `npx firebase login`.');
  const options = { project: PROJECT, user: account.user, tokens: account.tokens };
  setActiveAccount(options, account);
  await requireAuth(options);
  return new Client({ urlPrefix: 'https://firestore.googleapis.com', auth: true, apiVersion: 'v1' });
}

/** Lista uma colecao (somente GET), com paginacao. */
async function listCollection(client, collectionPath, showMissing = false) {
  const root = `projects/${PROJECT}/databases/(default)/documents`;
  const docs = [];
  let pageToken;
  do {
    const res = await client.request({
      method: 'GET',
      path: `${root}/${collectionPath}`,
      queryParams: { pageSize: '300', ...(showMissing ? { showMissing: 'true' } : {}), ...(pageToken ? { pageToken } : {}) },
      resolveOnHTTPError: true
    });
    if (res.status === 404) return docs;
    if (res.status >= 400) throw new Error(`GET ${collectionPath}: HTTP ${res.status}`);
    for (const d of res.body.documents || []) docs.push({ id: d.name.split('/').pop(), data: decodeFields(d.fields) });
    pageToken = res.body.nextPageToken;
  } while (pageToken);
  return docs;
}

function manifestKeys() {
  if (!MANIFEST) return null;
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(MANIFEST, { readOnly: true });
  const rows = db.prepare('select song_id, original_key from songs').all();
  db.close();
  return new Map(rows.map((r) => [r.song_id, r.original_key]));
}

async function main() {
  const client = await connect();
  const manifest = manifestKeys();
  // showMissing: igrejas sem documento proprio (so subcolecoes) tambem entram
  const churches = await listCollection(client, 'churches', true);
  const collections = [...churches.map((c) => ({ label: `churches/${c.id}/library`, path: `churches/${c.id}/library` })), { label: 'catalog', path: 'catalog' }];

  const counts = { docs: 0, semTom: 0, comTom: 0, g: 0, gConfirmadoMeta: 0, gConfirmadoNomeMigrador: 0, gRevisar: 0 };
  const review = [];
  const porColecao = {};
  for (const col of collections) {
    const songs = await listCollection(client, col.path);
    porColecao[col.label.replace(/churches\/[^/]+/, 'churches/<igreja>')] = (porColecao[col.label.replace(/churches\/[^/]+/, 'churches/<igreja>')] || 0) + songs.length;
    for (const song of songs) {
      counts.docs++;
      const key = typeof song.data.originalKey === 'string' ? song.data.originalKey.trim() : '';
      if (!key) {
        counts.semTom++;
        continue;
      }
      counts.comTom++;
      if (key !== 'G') continue;
      counts.g++;
      const origin = song.data.keyMeta && song.data.keyMeta.origin;
      if (origin === 'name' || origin === 'manual') {
        counts.gConfirmadoMeta++;
      } else if (manifest && !origin && manifest.get(song.id) === 'G') {
        counts.gConfirmadoNomeMigrador++;
      } else {
        counts.gRevisar++;
        review.push({ colecao: col.label, id: song.id, titulo: song.data.title, artista: song.data.artist, origem: origin || 'sem procedencia', criadoPor: song.data.createdBy });
      }
    }
  }
  console.log(JSON.stringify({ projeto: PROJECT, somenteLeitura: true, manifestoUsado: Boolean(manifest), igrejas: churches.length, porColecao, ...counts }, null, 2));
  if (REPORT) {
    const lines = [`# Revisao de tom G (${new Date().toISOString()})`, '', `Projeto ${PROJECT}. ${review.length} musica(s) com G sem procedencia confirmada. Nada foi alterado.`, ''];
    for (const r of review) lines.push(`- ${r.titulo} | ${r.artista || '-'} | ${r.colecao}/${r.id} | origem: ${r.origem}`);
    fs.writeFileSync(REPORT, lines.join('\n') + '\n');
    console.log(`lista com nomes: ${REPORT}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
