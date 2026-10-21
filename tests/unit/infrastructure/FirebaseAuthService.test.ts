import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
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

  describe('Segurança do login local', () => {
    it('recusa senha errada, email desconhecido e conta de exemplo sem senha', async () => {
      const auth = new FirebaseAuthService();
      await auth.registerWithEmail('ana@lagoinhajp.com.br', 'senha-forte-1', 'Ana Vocal');
      await auth.signOut();

      await expect(auth.signInWithEmail('ana@lagoinhajp.com.br', 'senha-errada')).rejects.toThrow('Credenciais inválidas');
      await expect(auth.signInWithEmail('ninguem@lagoinhajp.com.br', 'qualquer-1')).rejects.toThrow('Credenciais inválidas');
      await expect(auth.signInWithEmail('leandro@lagoinhajp.com.br', '')).rejects.toThrow('Credenciais inválidas');

      const ok = await auth.signInWithEmail('ANA@lagoinhajp.com.br', 'senha-forte-1');
      expect(ok.email).toBe('ana@lagoinhajp.com.br');
    });

    it('email com "admin"/"lider" não vira administrador sozinho', async () => {
      const auth = new FirebaseAuthService();
      await expect(auth.signInWithEmail('admin.louvor.lider@x.com', 'qualquer-1')).rejects.toThrow();
      const user = await auth.registerWithEmail('admin.louvor.lider@x.com', 'senha-forte-1', 'Tentativa');
      expect(user.role).toBe('pending');
    });

    it('guarda a senha com PBKDF2 (não reversível) e migra o formato antigo btoa', async () => {
      const auth = new FirebaseAuthService();
      await auth.registerWithEmail('bia@lagoinhajp.com.br', 'senha-forte-1', 'Bia');
      const users = JSON.parse(localStorage.getItem('lagoinha_vs_users_db')!) as { email: string; passwordHash?: string }[];
      const bia = users.find((u) => u.email === 'bia@lagoinhajp.com.br')!;
      expect(bia.passwordHash).toMatch(/^pbkdf2\$310000\$/);
      expect(bia.passwordHash).not.toContain(btoa('senha-forte-1'));

      // Registro legado em btoa continua entrando uma vez e é regravado em PBKDF2
      bia.passwordHash = btoa('senha-antiga');
      localStorage.setItem('lagoinha_vs_users_db', JSON.stringify(users));
      await auth.signInWithEmail('bia@lagoinhajp.com.br', 'senha-antiga');
      const after = JSON.parse(localStorage.getItem('lagoinha_vs_users_db')!) as { email: string; passwordHash?: string }[];
      expect(after.find((u) => u.email === 'bia@lagoinhajp.com.br')!.passwordHash).toMatch(/^pbkdf2\$/);
    });

    it('editar papel/igreja na sessão salva não eleva o usuário', async () => {
      const first = new FirebaseAuthService();
      const musico = await first.registerWithEmail('caio@lagoinhajp.com.br', 'senha-forte-1', 'Caio');
      const session = JSON.parse(localStorage.getItem('lagoinha_vs_auth_user')!);
      localStorage.setItem(
        'lagoinha_vs_auth_user',
        JSON.stringify({ ...session, role: 'admin', status: 'active', churchId: 'outra-igreja' })
      );

      const reloaded = new FirebaseAuthService();
      expect(reloaded.getCurrentUser()?.uid).toBe(musico.uid);
      expect(reloaded.getCurrentUser()?.role).toBe('pending');
      expect(reloaded.getCurrentUser()?.churchId).toBe('lagoinha-jp');
    });

    it('fora do modo demo: sem login automático, sem Google simulado e sem Acesso Demo', async () => {
      const auth = new FirebaseAuthService({ demoMode: false });
      expect(auth.getCurrentUser()).toBeNull();
      await expect(auth.signInWithGoogle()).rejects.toThrow();
      await expect(auth.signInDemo('leader', 'X')).rejects.toThrow();

      // Instalação nova: a primeira conta administra o aparelho; a segunda aguarda aprovação
      const owner = await auth.registerWithEmail('dono@lagoinhajp.com.br', 'senha-forte-1', 'Dono');
      expect(owner.role).toBe('admin');
      const next = await auth.registerWithEmail('segundo@lagoinhajp.com.br', 'senha-forte-1', 'Segundo');
      expect(next.role).toBe('pending');
    });

    it('recusa senha curta e email repetido', async () => {
      const auth = new FirebaseAuthService();
      await expect(auth.registerWithEmail('d@x.com', '123', 'D')).rejects.toThrow(/8 caracteres/);
      await auth.registerWithEmail('d@x.com', 'senha-forte-1', 'D');
      await expect(auth.registerWithEmail('D@x.com', 'senha-forte-2', 'D2')).rejects.toThrow(/Já existe/);
    });

    it('token de convite não usa Math.random', async () => {
      const spy = vi.spyOn(Math, 'random');
      const auth = new FirebaseAuthService();
      const invite = await auth.createInviteLink({ targetRole: 'musician', adminUser: auth.getCurrentUser()! });
      expect(invite.token).toMatch(/^lagoinha-musician-[a-z0-9]{18}$/);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
