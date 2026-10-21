import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, getApps } from 'firebase/app';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { connectFirebase, FirebaseHandles } from '../../src/infrastructure/firebase/firebaseApp';
import { FirebaseAccountService } from '../../src/infrastructure/firebase/FirebaseAccountService';
import { FirestoreSetlistRepository } from '../../src/infrastructure/firebase/FirestoreSetlistRepository';
import { FirestoreSongLibraryAdapter } from '../../src/infrastructure/firebase/FirestoreSongLibraryAdapter';
import { StemBlobPort } from '../../src/application/ports/StemBlobPort';
import { SetlistConflictError } from '../../src/domain/entities/ServiceSetlist';

/**
 * Adaptadores de produção (F2) contra os emuladores de Auth e Firestore, com as regras reais.
 * Nada de mock do Firebase: o que passa aqui passa pelas mesmas regras do projeto.
 */
const PROJECT = 'demo-lagoinha-vs';
const CHURCH = 'lagoinha-jp';
const ENV = {
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_PROJECT_ID: PROJECT,
  VITE_FIREBASE_AUTH_EMULATOR: '127.0.0.1:9099',
  VITE_FIREBASE_FIRESTORE_EMULATOR: '127.0.0.1:8080'
};

let rules: RulesTestEnvironment;
const run = Date.now().toString(36);
let seq = 0;
const email = (who: string) => `${who}-${run}@teste.local`;

function session(): FirebaseHandles & { accounts: FirebaseAccountService } {
  const handles = connectFirebase(ENV, `app-${run}-${seq++}`);
  return { ...handles, accounts: new FirebaseAccountService(handles.auth, handles.db) };
}

async function asAdmin(fn: (db: import('firebase/firestore').Firestore) => Promise<void>): Promise<void> {
  await rules.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore() as unknown as import('firebase/firestore').Firestore));
}

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

class MemoryStems implements StemBlobPort {
  public calls: string[] = [];
  async put(): Promise<string> {
    throw new Error('não usado');
  }
  async get(sha256: string, ref?: { songId: string; versionId: string }): Promise<Blob | null> {
    this.calls.push(`${sha256.slice(0, 1)}@${ref?.songId}/${ref?.versionId}`);
    return new Blob([sha256]);
  }
  async has(): Promise<boolean> {
    return true;
  }
}

describe('F2: adaptadores Firebase no emulador', () => {
  const admin = session();
  const newcomer = session();
  let adminUid = '';
  let inviteToken = '';

  beforeAll(async () => {
    rules = await initializeTestEnvironment({
      projectId: PROJECT,
      firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') }
    });
    // Bootstrap pela operação confiável: igreja + primeiro admin (o app não consegue criar isso)
    const user = await admin.accounts.registerWithEmail(email('admin'), 'senha-forte-1', 'Admin Teste');
    adminUid = user.uid;
    expect(user.status).toBe('pending'); // sem membro ainda: ninguém vira admin sozinho
    await asAdmin(async (db) => {
      await setDoc(doc(db, 'churches', CHURCH), { name: 'Lagoinha João Pessoa', city: 'João Pessoa' });
      await setDoc(doc(db, 'churches', CHURCH, 'members', adminUid), {
        role: 'admin',
        status: 'active',
        displayName: 'Admin Teste',
        createdAt: Timestamp.now()
      });
    });
    await admin.accounts.signOut();
    await admin.accounts.signInWithEmail(email('admin'), 'senha-forte-1');
  });

  afterAll(async () => {
    await rules?.cleanup();
    await Promise.all(getApps().map((a) => deleteApp(a)));
  });

  it('login lê papel e status do documento de membro', () => {
    const user = admin.accounts.getCurrentUser();
    expect(user?.uid).toBe(adminUid);
    expect(user?.role).toBe('admin');
    expect(user?.isActive).toBe(true);
    expect(user?.churchId).toBe(CHURCH);
  });

  it('convite: admin cria, novo membro entra pendente pelo link e o uso é contado', async () => {
    const created = await admin.accounts.createInviteLink({
      targetRole: 'leader',
      expiresHours: 48,
      maxUses: 1,
      adminUser: admin.accounts.getCurrentUser()!
    });
    inviteToken = created.token;
    expect(inviteToken.startsWith(`${CHURCH}.`)).toBe(true);
    expect(created.id).toMatch(/^[a-f0-9]{64}$/);

    const joined = await newcomer.accounts.registerWithEmail(email('lider'), 'senha-forte-2', 'Líder Novo', 'Teclado', inviteToken);
    expect(joined.status).toBe('pending');
    expect(joined.role).toBe('pending');

    const listed = await admin.accounts.listInviteTokens();
    const stored = listed.find((t) => t.id === created.id);
    expect(stored?.usedCount).toBe(1);
    expect(stored?.token).toBe(''); // o banco guarda só o hash do link
  });

  it('o mesmo convite de uso único não vale para uma terceira pessoa', async () => {
    const third = session();
    const user = await third.accounts.registerWithEmail(email('terceiro'), 'senha-forte-3', 'Terceiro', undefined, inviteToken).catch((e: Error) => e);
    expect(user).toBeInstanceOf(Error);
    expect((user as Error).message).toMatch(/Convite/);
  });

  it('pendente não lista membros; admin aprova e o papel do convite vale', async () => {
    await expect(newcomer.accounts.listAllUsers()).rejects.toThrow();
    const pending = await admin.accounts.listPendingUsers();
    const target = pending.find((u) => u.displayName === 'Líder Novo');
    expect(target).toBeDefined();
    const approved = await admin.accounts.approveUser(target!.uid, 'leader', adminUid);
    expect(approved.status).toBe('active');
    expect(approved.role).toBe('leader');

    await newcomer.accounts.signOut();
    const again = await newcomer.accounts.signInWithEmail(email('lider'), 'senha-forte-2');
    expect(again.role).toBe('leader');
    expect(again.isActive).toBe(true);
  });

  it('ninguém se aprova sozinho: o pendente não troca o próprio papel', async () => {
    const solo = session();
    const user = await solo.accounts.registerWithEmail(email('solo'), 'senha-forte-4', 'Solo');
    await expect(solo.accounts.approveUser(user.uid, 'admin', user.uid)).rejects.toThrow();
  });

  it('biblioteca: lista a igreja, toca a versão publicada pelo Worker e explica a pendente', async () => {
    await asAdmin(async (db) => {
      await setDoc(doc(db, 'churches', CHURCH, 'library', 'song-ok'), {
        title: 'Música Pronta',
        artist: 'Ministério',
        kind: 'song',
        bpm: 72,
        timeSignature: { beats: 4, value: 4 },
        durationSec: 240,
        rightsClass: 'unknown',
        status: 'ready',
        currentVersionId: 'v1',
        stemsCount: 2
      });
      await setDoc(doc(db, 'churches', CHURCH, 'library', 'song-ok', 'versions', 'v1'), {
        createdAt: Timestamp.now(),
        createdBy: adminUid,
        changelog: 'piloto',
        sections: [{ name: 'Refrão', startSec: 40, endSec: 80 }],
        stems: [
          { sha256: SHA_A, name: 'Click.wav', type: 'click', size: 10, contentType: 'audio/wav' },
          { sha256: SHA_B, name: 'Baixo.wav', type: 'bass', size: 10, contentType: 'audio/wav' }
        ]
      });
      await setDoc(doc(db, 'churches', CHURCH, 'library', 'song-pend'), {
        title: 'Música Sem BPM',
        rightsClass: 'unknown',
        status: 'pending',
        pendingReason: 'sem BPM válido'
      });
    });

    const stems = new MemoryStems();
    const library = new FirestoreSongLibraryAdapter(newcomer.db, stems, () => newcomer.auth.currentUser?.uid ?? null, () => 'blob:teste');
    const scope = { kind: 'church' as const, churchId: CHURCH };
    const songs = await library.list(scope);
    expect(songs.map((s) => s.title)).toEqual(['Música Pronta', 'Música Sem BPM']);
    expect(songs[1]!.status).toBe('pending');
    expect(songs[1]!.pendingReason).toBe('sem BPM válido');

    const playback = await library.toPlaybackSong(scope, songs[0]!);
    expect(playback.bpm).toBe(72);
    expect(playback.stems.map((s) => s.type)).toEqual(['click', 'bass']);
    expect(playback.sections[0]!.type).toBe('chorus');
    expect(stems.calls).toEqual(['a@song-ok/v1', 'b@song-ok/v1']);

    await expect(library.toPlaybackSong(scope, songs[1]!)).rejects.toThrow(/sem BPM/);
  });

  it('biblioteca de outra igreja não abre (I2)', async () => {
    const library = new FirestoreSongLibraryAdapter(newcomer.db, new MemoryStems(), () => null);
    await expect(library.list({ kind: 'church', churchId: 'outra-igreja' })).rejects.toThrow();
  });

  it('setlist: grava com revisão +1 e recusa revisão velha', async () => {
    const repo = new FirestoreSetlistRepository(newcomer.db, () => newcomer.auth.currentUser?.uid ?? null);
    const created = await repo.create({
      id: `culto-${run}`,
      churchId: CHURCH,
      title: 'Culto de domingo',
      serviceDate: '2026-10-25',
      status: 'draft',
      updatedBy: '',
      items: [{ order: 1, source: 'church', songId: 'song-ok', versionId: 'v1' }]
    });
    expect(created.revision).toBe(1);
    const saved = await repo.save({ ...created, title: 'Culto de domingo (noite)' }, 1);
    expect(saved.revision).toBe(2);
    await expect(repo.save({ ...created, title: 'atrasado' }, 1)).rejects.toBeInstanceOf(SetlistConflictError);
    const stored = await repo.get(CHURCH, created.id);
    expect(stored?.title).toBe('Culto de domingo (noite)');
    expect(stored?.items[0]?.versionId).toBe('v1');
  });

  it('músico não edita setlist', async () => {
    const musician = session();
    const user = await musician.accounts.registerWithEmail(email('musico'), 'senha-forte-5', 'Músico');
    await asAdmin(async (db) => {
      await setDoc(doc(db, 'churches', CHURCH, 'members', user.uid), { role: 'musician', status: 'active', displayName: 'Músico' });
    });
    const repo = new FirestoreSetlistRepository(musician.db, () => musician.auth.currentUser?.uid ?? null);
    await expect(
      repo.create({ id: `x-${run}`, churchId: CHURCH, title: 'x', serviceDate: '2026-10-26', status: 'draft', updatedBy: '', items: [] })
    ).rejects.toThrow();
  });
});
