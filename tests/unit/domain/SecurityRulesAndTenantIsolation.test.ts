import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { User } from '../../../src/domain/entities/User';
import { LocalAuthAdapter } from '../../../src/infrastructure/auth/LocalAuthAdapter';

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

describe('SEC-01: Multi-Tenant Isolation & Anti-Self-Elevation Rules', () => {
  let authService: LocalAuthAdapter;

  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = createLocalStorageMock();
    }
  });

  beforeEach(() => {
    localStorage.clear();
    authService = new LocalAuthAdapter();
  });

  describe('Tenant Isolation (Church Boundary)', () => {
    it('isolates users between different churches (Lagoinha JP vs Lagoinha SP)', () => {
      const userJP = new User({
        uid: 'jp-admin',
        email: 'leandro@lagoinhajp.com.br',
        displayName: 'Leandro Machado',
        role: 'admin',
        churchBranch: 'Lagoinha João Pessoa',
        churchId: 'lagoinha-jp',
        status: 'active'
      });

      const userSP = new User({
        uid: 'sp-admin',
        email: 'admin@lagoinhasp.com.br',
        displayName: 'Admin SP',
        role: 'admin',
        churchBranch: 'Lagoinha São Paulo',
        churchId: 'lagoinha-sp',
        status: 'active'
      });

      expect(userJP.belongsToChurch('lagoinha-jp')).toBe(true);
      expect(userJP.belongsToChurch('lagoinha-sp')).toBe(false);
      expect(userJP.canManageUser(userSP)).toBe(false);
      expect(userSP.canManageUser(userJP)).toBe(false);
    });

    it('prevents an Admin of Church A from approving or modifying users of Church B', async () => {
      // Cria usuário de outra igreja no banco
      const spPendingUser = new User({
        uid: 'sp-pending-user',
        email: 'musico@lagoinhasp.com.br',
        displayName: 'Músico SP',
        role: 'pending',
        churchBranch: 'Lagoinha São Paulo',
        churchId: 'lagoinha-sp',
        status: 'pending'
      });

      // Salva no banco simulado
      const usersDb = [
        {
          uid: 'admin-leandro-machado',
          email: 'leandro@lagoinhajp.com.br',
          displayName: 'Leandro Machado',
          role: 'admin',
          churchBranch: 'Lagoinha João Pessoa',
          churchId: 'lagoinha-jp',
          status: 'active',
          createdAt: new Date().toISOString()
        },
        {
          uid: spPendingUser.uid,
          email: spPendingUser.email,
          displayName: spPendingUser.displayName,
          role: spPendingUser.role,
          churchBranch: spPendingUser.churchBranch,
          churchId: spPendingUser.churchId,
          status: spPendingUser.status,
          createdAt: new Date().toISOString()
        }
      ];
      localStorage.setItem('lagoinha_vs_users_db', JSON.stringify(usersDb));

      // Tenta aprovar usuário de SP com admin de JP
      await expect(
        authService.approveUser('sp-pending-user', 'musician', 'admin-leandro-machado')
      ).rejects.toThrow('violação de isolamento multi-tenant');

      // Tenta alterar papel do usuário de SP com admin de JP
      await expect(
        authService.updateUserRole('sp-pending-user', 'leader', 'admin-leandro-machado')
      ).rejects.toThrow('violação de isolamento multi-tenant');
    });

    it('filters user list by churchId', async () => {
      const usersDb = [
        {
          uid: 'jp-1',
          email: 'jp1@lagoinhajp.com.br',
          displayName: 'JP 1',
          role: 'musician',
          churchBranch: 'Lagoinha João Pessoa',
          churchId: 'lagoinha-jp',
          status: 'active',
          createdAt: new Date().toISOString()
        },
        {
          uid: 'sp-1',
          email: 'sp1@lagoinhasp.com.br',
          displayName: 'SP 1',
          role: 'musician',
          churchBranch: 'Lagoinha São Paulo',
          churchId: 'lagoinha-sp',
          status: 'active',
          createdAt: new Date().toISOString()
        }
      ];
      localStorage.setItem('lagoinha_vs_users_db', JSON.stringify(usersDb));

      const jpUsers = await authService.listAllUsers('lagoinha-jp');
      expect(jpUsers).toHaveLength(1);
      expect(jpUsers[0]?.uid).toBe('jp-1');

      const spUsers = await authService.listAllUsers('lagoinha-sp');
      expect(spUsers).toHaveLength(1);
      expect(spUsers[0]?.uid).toBe('sp-1');
    });
  });

  describe('Anti-Self-Elevation Protection', () => {
    it('blocks a non-admin user from elevating themselves to admin', async () => {
      const musicianRecord = {
        uid: 'guitar-player-1',
        email: 'guitar@lagoinhajp.com.br',
        displayName: 'Guitarrista',
        role: 'musician',
        churchBranch: 'Lagoinha João Pessoa',
        churchId: 'lagoinha-jp',
        status: 'active',
        createdAt: new Date().toISOString()
      };
      localStorage.setItem('lagoinha_vs_users_db', JSON.stringify([musicianRecord]));

      // O guitarrista tenta passar seu próprio UID como adminUid para se autopromover
      await expect(
        authService.updateUserRole('guitar-player-1', 'admin', 'guitar-player-1')
      ).rejects.toThrow('auto-elevação de papel não autorizada');
    });

    it('blocks a non-admin from approving other users', async () => {
      const leaderRecord = {
        uid: 'leader-1',
        email: 'leader@lagoinhajp.com.br',
        displayName: 'Líder',
        role: 'leader',
        churchBranch: 'Lagoinha João Pessoa',
        churchId: 'lagoinha-jp',
        status: 'active',
        createdAt: new Date().toISOString()
      };
      const pendingRecord = {
        uid: 'pending-1',
        email: 'pending@lagoinhajp.com.br',
        displayName: 'Pendente',
        role: 'pending',
        churchBranch: 'Lagoinha João Pessoa',
        churchId: 'lagoinha-jp',
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      localStorage.setItem('lagoinha_vs_users_db', JSON.stringify([leaderRecord, pendingRecord]));

      // Líder (que não é admin) tenta aprovar usuário pendente
      await expect(
        authService.approveUser('pending-1', 'musician', 'leader-1')
      ).rejects.toThrow('apenas administradores ativos podem aprovar');
    });
  });

  describe('Invite Links & Tenant Scoping', () => {
    it('binds invite tokens to the creator churchId and target role', async () => {
      const adminUser = new User({
        uid: 'admin-leandro-machado',
        email: 'leandro@lagoinhajp.com.br',
        displayName: 'Leandro Machado',
        role: 'admin',
        churchBranch: 'Lagoinha João Pessoa',
        churchId: 'lagoinha-jp',
        status: 'active'
      });

      const token = await authService.createInviteLink({
        targetRole: 'sound_tech',
        adminUser,
        expiresHours: 48,
        maxUses: 1
      });

      expect(token.targetRole).toBe('sound_tech');
      expect(token.churchId).toBe('lagoinha-jp');
      expect(token.churchBranch).toBe('Lagoinha João Pessoa');
      expect(token.isValid()).toBe(true);

      // Registro com o token
      const newUser = await authService.registerWithEmail(
        'novo.tecnico@lagoinhajp.com.br',
        'senhaSegura123',
        'Novo Técnico de Áudio',
        'FOH',
        token.token
      );

      expect(newUser.role).toBe('sound_tech');
      expect(newUser.status).toBe('active');
      expect(newUser.churchId).toBe('lagoinha-jp');
      expect(newUser.churchBranch).toBe('Lagoinha João Pessoa');

      // O token de uso único deve ter sido consumido
      const consumed = await authService.validateInviteToken(token.token);
      expect(consumed).toBeNull();
    });

    it('rejects invite link creation by musician or pending users', async () => {
      const musicianUser = new User({
        uid: 'musician-1',
        email: 'musico@lagoinhajp.com.br',
        displayName: 'Músico',
        role: 'musician',
        churchBranch: 'Lagoinha João Pessoa',
        churchId: 'lagoinha-jp',
        status: 'active'
      });

      await expect(
        authService.createInviteLink({
          targetRole: 'musician',
          adminUser: musicianUser
        })
      ).rejects.toThrow('apenas administradores ou líderes ativos');
    });
  });
});
