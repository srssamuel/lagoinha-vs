// Bootstrap do banco online (spec-banco-online F2): igreja, primeiro admin e curador do catalogo.
// O app nao consegue criar nada disso pelas regras (ninguem vira admin sozinho); por isso roda aqui,
// com a credencial de dono do Firebase CLI. Idempotente: so cria o que falta, nunca sobrescreve.
//
// Uso:
//   node tools/admin/bootstrap.cjs --check                 (so le e mostra o estado)
//   node tools/admin/bootstrap.cjs --church-only            (cria so a igreja)
//   node tools/admin/bootstrap.cjs --admin-uid <uid> [--curator]
// O uid aparece no app depois do primeiro login Google (tela "aguardando aprovacao") ou no console do Auth.
'use strict';
const { connect } = require('./firestoreAdmin.cjs');

const PROJECT = 'lagoinha-joao-pessoa';
const CHURCH = { id: 'lagoinha-jp', name: 'Lagoinha João Pessoa', city: 'João Pessoa' };

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const db = await connect(PROJECT);
  const uid = arg('--admin-uid');
  const churchOnly = process.argv.includes('--church-only');
  const checkOnly = process.argv.includes('--check') || (!uid && !churchOnly);
  if (uid && !/^[A-Za-z0-9]{20,128}$/.test(uid)) throw new Error('uid invalido');

  const church = await db.get(`churches/${CHURCH.id}`);
  console.log(`igreja ${CHURCH.id}: ${church ? 'existe' : 'ausente'}`);
  if (uid) {
    const member = await db.get(`churches/${CHURCH.id}/members/${uid}`);
    console.log(`membro ${uid}: ${member ? `${member.role}/${member.status}` : 'ausente'}`);
    const curator = await db.get(`platformAdmins/${uid}`);
    console.log(`curador ${uid}: ${curator ? 'sim' : 'nao'}`);
  }
  if (checkOnly) return;

  const now = new Date();
  console.log('igreja:', await db.createIfMissing(`churches/${CHURCH.id}`, { name: CHURCH.name, city: CHURCH.city, createdAt: now }));
  if (!uid) return;
  console.log(
    'primeiro admin:',
    await db.createIfMissing(`churches/${CHURCH.id}/members/${uid}`, {
      role: 'admin',
      status: 'active',
      displayName: arg('--name') || 'Administrador',
      createdAt: now,
      approvedBy: 'bootstrap',
      approvedAt: now
    })
  );
  console.log('perfil:', await db.createIfMissing(`users/${uid}`, { primaryChurchId: CHURCH.id, createdAt: now }));
  if (process.argv.includes('--curator')) {
    console.log('curador:', await db.createIfMissing(`platformAdmins/${uid}`, { since: now, note: 'bootstrap' }));
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
