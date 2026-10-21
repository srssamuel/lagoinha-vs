// Estado do Firebase Authentication do projeto (somente leitura, credencial de dono do Firebase CLI):
// inicializado?, provedores Google / anonimo / e-mail e dominios autorizados.
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
  const client = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', auth: true, apiVersion: 'admin/v2' });
  const cfg = await client.request({ method: 'GET', path: `projects/${PROJECT}/config`, resolveOnHTTPError: true });
  if (cfg.status >= 400) {
    console.log(`config: HTTP ${cfg.status} ${(cfg.body && cfg.body.error && cfg.body.error.message) || ''}`);
    return;
  }
  const signIn = cfg.body.signIn || {};
  console.log('inicializado: sim');
  console.log('anonimo:', signIn.anonymous && signIn.anonymous.enabled ? 'LIGADO' : 'desligado');
  console.log('email/senha:', signIn.email && signIn.email.enabled ? 'ligado' : 'desligado');
  console.log('dominios autorizados:', (cfg.body.authorizedDomains || []).join(', '));
  const idp = await client.request({
    method: 'GET',
    path: `projects/${PROJECT}/defaultSupportedIdpConfigs/google.com`,
    resolveOnHTTPError: true
  });
  console.log('google:', idp.status === 200 ? (idp.body.enabled ? 'ligado' : 'cadastrado e desligado') : `ausente (HTTP ${idp.status})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
