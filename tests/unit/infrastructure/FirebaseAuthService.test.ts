import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { FirebaseAuthService } from '../../../src/infrastructure/auth/FirebaseAuthService';

// Mock localStorage para ambiente Node.js do Vitest
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
};

describe('FirebaseAuthService Infrastructure Suite', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = createLocalStorageMock();
    }
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes default admin (Leandro Machado) when no user is logged in', () => {
    const auth = new FirebaseAuthService();
    const current = auth.getCurrentUser();
    expect(current).not.toBeNull();
    expect(current?.displayName).toBe('Leandro Machado');
    expect(current?.role).toBe('admin');
    expect(current?.isAdmin).toBe(true);
  });

  it('registers a new user with pending status when no invite token is used', async () => {
    const auth = new FirebaseAuthService();
    const newUser = await auth.registerWithEmail(
      'novo.tecladista@lagoinhajp.com.br',
      'senha123',
      'Lucas Teclado',
      'Teclados & Synth'
    );

    expect(newUser.status).toBe('pending');
    expect(newUser.role).toBe('pending');
    expect(newUser.isPending).toBe(true);
    expect(newUser.instrumentOrMinistry).toBe('Teclados & Synth');

    // O usuário recém-registrado deve aparecer na lista de pendentes do ADM
    const pendingList = await auth.listPendingUsers();
    expect(pendingList.some((u) => u.email === 'novo.tecladista@lagoinhajp.com.br')).toBe(true);
  });

  it('allows Admin to approve a pending user as Musician', async () => {
    const auth = new FirebaseAuthService();
    const admin = auth.getCurrentUser()!;

    // Cadastra um usuário pendente
    const pending = await auth.registerWithEmail(
      'baterista.novo@lagoinhajp.com.br',
      'senha123',
      'Mateus Bateria',
      'Bateria'
    );

    // Admin aprova
    const approved = await auth.approveUser(pending.uid, 'musician', admin.uid);
    expect(approved.status).toBe('active');
    expect(approved.role).toBe('musician');
    expect(approved.approvedBy).toBe(admin.uid);

    // Não deve mais constar como pendente
    const pendingList = await auth.listPendingUsers();
    expect(pendingList.some((u) => u.uid === pending.uid)).toBe(false);
  });

  it('creates an invite link and auto-approves user who registers with it', async () => {
    const auth = new FirebaseAuthService();
    const admin = auth.getCurrentUser()!;

    // Admin gera um link de convite para Músico
    const invite = await auth.createInviteLink({
      targetRole: 'musician',
      expiresHours: 24,
      maxUses: 1,
      adminUser: admin
    });

    expect(invite.isValid()).toBe(true);
    expect(invite.targetRole).toBe('musician');

    // Novo usuário se cadastra utilizando o token de convite
    const invitedUser = await auth.registerWithEmail(
      'convidado@lagoinhajp.com.br',
      'senha123',
      'João Convidado',
      'Violão Acústico',
      invite.token
    );

    // Deve estar IMEDIATAMENTE ativo e aprovado como músico!
    expect(invitedUser.status).toBe('active');
    expect(invitedUser.role).toBe('musician');
    expect(invitedUser.isActive).toBe(true);
    expect(invitedUser.isPending).toBe(false);

    // O token de uso único deve agora estar esgotado/inválido
    const checkToken = await auth.validateInviteToken(invite.token);
    expect(checkToken).toBeNull();
  });
});
