import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

/**
 * Regras reais no emulador (spec-banco-online, seção 4 e fase F1).
 * Igreja "a" tem admin, líder, técnico, músico e um pendente; igreja "b" só um admin.
 */
let env: RulesTestEnvironment;

const DAY_MS = 24 * 3600 * 1000;
const inDays = (days: number) => Timestamp.fromMillis(Date.now() + days * DAY_MS);
const LICENSE = { holder: 'Lagoinha JP', documentId: 'DOC-001', scope: 'todas as igrejas' };

const db = (uid: string | null): Firestore =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore() as unknown as Firestore;

const invite = (overrides: Record<string, unknown> = {}) => ({
  targetRole: 'musician',
  expiresAt: inDays(1),
  maxUses: 2,
  usedCount: 0,
  revoked: false,
  createdBy: 'leader-a',
  ...overrides
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lagoinha-vs',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8') }
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore() as unknown as Firestore;
    const member = (church: string, uid: string, role: string, status = 'active') =>
      setDoc(doc(admin, `churches/${church}/members/${uid}`), { role, status });

    await setDoc(doc(admin, 'churches/a'), { name: 'Lagoinha JP', city: 'João Pessoa' });
    await setDoc(doc(admin, 'churches/b'), { name: 'Outra Igreja', city: 'Recife' });
    await member('a', 'admin-a', 'admin');
    await member('a', 'leader-a', 'leader');
    await member('a', 'tech-a', 'sound_tech');
    await member('a', 'music-a', 'musician');
    await member('a', 'pend-a', 'musician', 'pending');
    await member('b', 'admin-b', 'admin');

    await setDoc(doc(admin, 'users/music-a'), { displayName: 'Músico A', primaryChurchId: 'a' });
    await setDoc(doc(admin, 'users/stranger'), { displayName: 'Intruso', primaryChurchId: 'a' });
    await setDoc(doc(admin, 'platformAdmins/curator'), { since: '2026-10-21' });

    await setDoc(doc(admin, 'churches/a/invites/inv-ok'), invite());
    await setDoc(doc(admin, 'churches/a/invites/inv-expired'), invite({ expiresAt: inDays(-1) }));
    await setDoc(doc(admin, 'churches/a/invites/inv-revoked'), invite({ revoked: true }));
    await setDoc(doc(admin, 'churches/a/invites/inv-full'), invite({ maxUses: 1, usedCount: 1 }));
    await setDoc(doc(admin, 'churches/a/invites/inv-tech'), invite({ targetRole: 'sound_tech' }));

    await setDoc(doc(admin, 'churches/a/library/song1'), { title: 'Comprada', rightsClass: 'church_purchased' });
    await setDoc(doc(admin, 'churches/a/library/song1/versions/v1'), { stems: [] });
    await setDoc(doc(admin, 'churches/a/setlists/s1'), {
      title: 'Domingo',
      revision: 3,
      updatedBy: 'leader-a',
      items: []
    });
    await setDoc(doc(admin, 'catalog/c1'), { title: 'Própria', rightsClass: 'own', licenseRef: LICENSE });
    await setDoc(doc(admin, 'catalog/c1/versions/v1'), { stems: [] });
  });
});

/** Entrada pelo convite: cria o membro pendente e consome o convite no mesmo lote. */
function joinWithInvite(uid: string, inviteId: string, role = 'musician', increment = 1, usedBefore = 0) {
  const firestore = db(uid);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, `churches/a/members/${uid}`), { role, status: 'pending', inviteId });
  batch.update(doc(firestore, `churches/a/invites/${inviteId}`), { usedCount: usedBefore + increment });
  return batch.commit();
}

describe('I1: ninguém se promove', () => {
  it('músico não muda o próprio papel', async () => {
    await assertFails(updateDoc(doc(db('music-a'), 'churches/a/members/music-a'), { role: 'admin' }));
  });

  it('pendente não se ativa sozinho', async () => {
    await assertFails(updateDoc(doc(db('pend-a'), 'churches/a/members/pend-a'), { status: 'active' }));
  });

  it('ninguém cria o próprio membro como ativo, nem pendente sem convite', async () => {
    await assertFails(setDoc(doc(db('novo'), 'churches/a/members/novo'), { role: 'musician', status: 'active' }));
    await assertFails(setDoc(doc(db('novo'), 'churches/a/members/novo'), { role: 'musician', status: 'pending' }));
  });

  it('admin não muda o próprio papel, mas aprova outra pessoa', async () => {
    await assertFails(updateDoc(doc(db('admin-a'), 'churches/a/members/admin-a'), { role: 'musician' }));
    await assertSucceeds(
      updateDoc(doc(db('admin-a'), 'churches/a/members/pend-a'), {
        status: 'active',
        approvedBy: 'admin-a',
        approvedAt: Timestamp.now()
      })
    );
  });

  it('aprovação não pode assinar em nome de outro admin', async () => {
    await assertFails(
      updateDoc(doc(db('admin-a'), 'churches/a/members/pend-a'), { status: 'active', approvedBy: 'leader-a' })
    );
  });

  it('líder não aprova membro (só admin)', async () => {
    await assertFails(updateDoc(doc(db('leader-a'), 'churches/a/members/pend-a'), { status: 'active' }));
  });

  it('a pessoa só edita o próprio instrumento', async () => {
    await assertSucceeds(updateDoc(doc(db('music-a'), 'churches/a/members/music-a'), { instrument: 'Baixo' }));
  });

  it('perfil em users/ não aceita papel nem status', async () => {
    await assertFails(setDoc(doc(db('music-a'), 'users/music-a'), { displayName: 'A', role: 'admin' }));
    await assertSucceeds(setDoc(doc(db('music-a'), 'users/music-a'), { displayName: 'A', primaryChurchId: 'a' }));
  });

  it('ninguém se cadastra como curador', async () => {
    await assertFails(setDoc(doc(db('music-a'), 'platformAdmins/music-a'), { since: 'hoje' }));
  });
});

describe('I2: igreja B não enxerga a igreja A', () => {
  it('admin de B não lê igreja, biblioteca, versões, setlists, membros nem convites de A', async () => {
    const b = db('admin-b');
    await assertFails(getDoc(doc(b, 'churches/a')));
    await assertFails(getDoc(doc(b, 'churches/a/library/song1')));
    await assertFails(getDoc(doc(b, 'churches/a/library/song1/versions/v1')));
    await assertFails(getDoc(doc(b, 'churches/a/setlists/s1')));
    await assertFails(getDocs(collection(b, 'churches/a/members')));
    await assertFails(getDocs(collection(b, 'churches/a/invites')));
  });

  it('admin de B não escreve em A', async () => {
    const b = db('admin-b');
    await assertFails(setDoc(doc(b, 'churches/a/library/x'), { title: 'X', rightsClass: 'unknown' }));
    await assertFails(updateDoc(doc(b, 'churches/a/members/music-a'), { role: 'leader' }));
    await assertFails(setDoc(doc(b, 'churches/a/members/admin-b'), { role: 'admin', status: 'active' }));
  });

  it('membro ativo de A lê a biblioteca; pendente e anônimo não', async () => {
    await assertSucceeds(getDoc(doc(db('music-a'), 'churches/a/library/song1')));
    await assertFails(getDoc(doc(db('pend-a'), 'churches/a/library/song1')));
    await assertFails(getDoc(doc(db(null), 'churches/a/library/song1')));
  });

  it('ninguém lê o perfil de outra pessoa', async () => {
    await assertFails(getDoc(doc(db('admin-a'), 'users/music-a')));
  });

  it('coleções antigas da raiz ficam fechadas', async () => {
    await assertFails(getDocs(collection(db('admin-a'), 'songs')));
    await assertFails(setDoc(doc(db('admin-a'), 'setlists/x'), { churchId: 'a' }));
  });
});

describe('I3: convite', () => {
  it('convite válido: entra como pendente e o uso sobe 1', async () => {
    await assertSucceeds(joinWithInvite('novo', 'inv-ok'));
  });

  it('convite expirado, revogado ou esgotado é negado', async () => {
    await assertFails(joinWithInvite('novo', 'inv-expired'));
    await assertFails(joinWithInvite('novo', 'inv-revoked'));
    await assertFails(joinWithInvite('novo', 'inv-full', 'musician', 1, 1));
  });

  it('papel diferente do convite é negado', async () => {
    await assertFails(joinWithInvite('novo', 'inv-ok', 'sound_tech'));
    await assertSucceeds(joinWithInvite('novo2', 'inv-tech', 'sound_tech'));
  });

  it('uso só sobe de 1 em 1 e só junto com a entrada do membro', async () => {
    await assertFails(joinWithInvite('novo', 'inv-ok', 'musician', 2));
    await assertFails(updateDoc(doc(db('novo'), 'churches/a/invites/inv-ok'), { usedCount: 1 }));
  });

  it('quem já é membro não consome convite de novo', async () => {
    await assertFails(
      updateDoc(doc(db('music-a'), 'churches/a/invites/inv-ok'), { usedCount: 1 })
    );
  });

  it('convite não muda de papel nem de prazo por quem usa', async () => {
    await assertFails(
      updateDoc(doc(db('novo'), 'churches/a/invites/inv-ok'), { usedCount: 1, targetRole: 'admin' })
    );
  });

  it('quem tem o link lê o convite; listar é só da liderança', async () => {
    await assertSucceeds(getDoc(doc(db('novo'), 'churches/a/invites/inv-ok')));
    await assertFails(getDocs(collection(db('novo'), 'churches/a/invites')));
    await assertFails(getDocs(collection(db('music-a'), 'churches/a/invites')));
    await assertSucceeds(getDocs(collection(db('leader-a'), 'churches/a/invites')));
  });

  it('líder convida até técnico de som; admin até líder; ninguém convida admin; músico não convida', async () => {
    const create = (uid: string, id: string, targetRole: string) =>
      setDoc(doc(db(uid), `churches/a/invites/${id}`), invite({ targetRole, createdBy: uid }));
    await assertSucceeds(create('leader-a', 'n1', 'sound_tech'));
    await assertFails(create('leader-a', 'n2', 'leader'));
    await assertSucceeds(create('admin-a', 'n3', 'leader'));
    await assertFails(create('admin-a', 'n4', 'admin'));
    await assertFails(create('music-a', 'n5', 'musician'));
  });

  it('convite nasce zerado, no nome de quem cria e com prazo de até 30 dias', async () => {
    const put = (id: string, data: Record<string, unknown>) =>
      setDoc(doc(db('leader-a'), `churches/a/invites/${id}`), invite(data));
    await assertFails(put('p1', { usedCount: 5 }));
    await assertFails(put('p2', { createdBy: 'admin-a' }));
    await assertFails(put('p3', { expiresAt: inDays(60) }));
    await assertFails(put('p4', { revoked: true }));
    await assertFails(put('p5', { maxUses: 0 }));
  });

  it('revogar é da liderança e só para revogado', async () => {
    await assertFails(updateDoc(doc(db('music-a'), 'churches/a/invites/inv-ok'), { revoked: true }));
    await assertFails(updateDoc(doc(db('leader-a'), 'churches/a/invites/inv-revoked'), { revoked: false }));
    await assertSucceeds(updateDoc(doc(db('leader-a'), 'churches/a/invites/inv-ok'), { revoked: true }));
  });
});

describe('I4: catálogo global', () => {
  it('curador não publica church_purchased, unknown nem própria sem documento', async () => {
    const curator = db('curator');
    await assertFails(setDoc(doc(curator, 'catalog/x1'), { title: 'X', rightsClass: 'church_purchased', licenseRef: LICENSE }));
    await assertFails(setDoc(doc(curator, 'catalog/x2'), { title: 'X', rightsClass: 'unknown', licenseRef: LICENSE }));
    await assertFails(setDoc(doc(curator, 'catalog/x3'), { title: 'X', rightsClass: 'own' }));
    await assertFails(
      setDoc(doc(curator, 'catalog/x4'), { title: 'X', rightsClass: 'own', licenseRef: { ...LICENSE, documentId: '' } })
    );
  });

  it('curador publica material próprio com documento', async () => {
    await assertSucceeds(setDoc(doc(db('curator'), 'catalog/x5'), { title: 'X', rightsClass: 'own', licenseRef: LICENSE }));
  });

  it('admin de igreja não escreve no catálogo', async () => {
    await assertFails(setDoc(doc(db('admin-a'), 'catalog/x6'), { title: 'X', rightsClass: 'own', licenseRef: LICENSE }));
  });

  it('curador não rebaixa música do catálogo para church_purchased', async () => {
    await assertFails(updateDoc(doc(db('curator'), 'catalog/c1'), { rightsClass: 'church_purchased' }));
  });

  it('membro ativo lê o catálogo; quem só aponta uma igreja sem ser membro, não', async () => {
    await assertSucceeds(getDoc(doc(db('music-a'), 'catalog/c1')));
    await assertSucceeds(getDoc(doc(db('music-a'), 'catalog/c1/versions/v1')));
    await assertFails(getDoc(doc(db('stranger'), 'catalog/c1')));
    await assertFails(getDoc(doc(db(null), 'catalog/c1')));
  });

  it('versão é imutável no catálogo e na biblioteca', async () => {
    await assertFails(updateDoc(doc(db('curator'), 'catalog/c1/versions/v1'), { stems: ['x'] }));
    await assertFails(deleteDoc(doc(db('curator'), 'catalog/c1/versions/v1')));
    await assertFails(updateDoc(doc(db('admin-a'), 'churches/a/library/song1/versions/v1'), { stems: ['x'] }));
  });
});

describe('biblioteca e setlist da igreja', () => {
  it('técnico de som sobe música; músico não', async () => {
    await assertSucceeds(setDoc(doc(db('tech-a'), 'churches/a/library/n1'), { title: 'N', rightsClass: 'unknown' }));
    await assertFails(setDoc(doc(db('music-a'), 'churches/a/library/n2'), { title: 'N', rightsClass: 'unknown' }));
    await assertFails(setDoc(doc(db('tech-a'), 'churches/a/library/n3'), { title: 'N', rightsClass: 'pirata' }));
  });

  it('setlist: revisão sobe exatamente 1; revisão velha é negada', async () => {
    const leader = db('leader-a');
    const write = (revision: number) =>
      updateDoc(doc(leader, 'churches/a/setlists/s1'), { revision, updatedBy: 'leader-a', items: [] });
    await assertFails(write(3));
    await assertFails(write(5));
    await assertSucceeds(write(4));
  });

  it('setlist: músico e técnico não editam; quem grava assina como si', async () => {
    await assertFails(updateDoc(doc(db('music-a'), 'churches/a/setlists/s1'), { revision: 4, updatedBy: 'music-a', items: [] }));
    await assertFails(updateDoc(doc(db('tech-a'), 'churches/a/setlists/s1'), { revision: 4, updatedBy: 'tech-a', items: [] }));
    await assertFails(updateDoc(doc(db('leader-a'), 'churches/a/setlists/s1'), { revision: 4, updatedBy: 'admin-a', items: [] }));
  });

  it('setlist novo começa na revisão 1', async () => {
    const leader = db('leader-a');
    await assertFails(setDoc(doc(leader, 'churches/a/setlists/s2'), { revision: 7, updatedBy: 'leader-a', items: [] }));
    await assertSucceeds(setDoc(doc(leader, 'churches/a/setlists/s3'), { revision: 1, updatedBy: 'leader-a', items: [] }));
  });

  it('igreja não nasce pelo app e admin só muda nome e cidade', async () => {
    await assertFails(setDoc(doc(db('admin-a'), 'churches/nova'), { name: 'Nova' }));
    await assertSucceeds(updateDoc(doc(db('admin-a'), 'churches/a'), { city: 'Cabedelo' }));
    await assertFails(updateDoc(doc(db('admin-a'), 'churches/a'), { owner: 'admin-a' }));
    await assertFails(updateDoc(doc(db('leader-a'), 'churches/a'), { city: 'Cabedelo' }));
  });
});

describe('storage: capas por igreja; stems fora do Firebase', () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  const storageOf = (uid: string) => env.authenticatedContext(uid).storage();

  it('técnico de A sobe capa em A; admin de B não', async () => {
    await assertSucceeds(uploadBytes(ref(storageOf('tech-a'), 'churches/a/covers/capa.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(storageOf('admin-b'), 'churches/a/covers/capa.png'), png, { contentType: 'image/png' }));
  });

  it('músico não sobe capa e ninguém sobe stem no Storage', async () => {
    await assertFails(uploadBytes(ref(storageOf('music-a'), 'churches/a/covers/c.png'), png, { contentType: 'image/png' }));
    await assertFails(
      uploadBytes(ref(storageOf('admin-a'), 'churches/a/stems/click.wav'), png, { contentType: 'audio/wav' })
    );
  });
});
