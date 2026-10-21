// Lista as contas do Firebase Authentication do projeto (somente leitura, credencial de dono do Firebase CLI):
// uid, e-mail, provedores e ultimo login. Nao imprime tokens.
'use strict';
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const { selectAccount, setActiveAccount } = require('firebase-tools/lib/auth');

const PROJECT = process.argv[2] || 'lagoinha-joao-pessoa';

async function main() {
  const account = selectAccount(undefined, process.cwd());
  if (!account) throw new Error('Firebase CLI sem login nesta maquina.');
  const options = { project: PROJECT, user: account.user, tokens: account.tokens };
  setActiveAccount(options, account);
  await requireAuth(options);
  const client = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', auth: true, apiVersion: 'v1' });
  const res = await client.request({
    method: 'POST',
    path: `projects/${PROJECT}/accounts:query`,
    body: { returnUserInfo: true, limit: '50' },
    resolveOnHTTPError: true
  });
  if (res.status >= 400) {
    console.log(`HTTP ${res.status} ${(res.body && res.body.error && res.body.error.message) || ''}`);
    return;
  }
  const users = res.body.userInfo || [];
  console.log(`contas: ${users.length}`);
  for (const u of users) {
    const providers = (u.providerUserInfo || []).map((p) => p.providerId).join(',');
    const last = u.lastLoginAt ? new Date(Number(u.lastLoginAt)).toISOString() : '-';
    console.log(`${u.localId} ${u.email || '-'} [${providers}] ultimo login ${last}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
