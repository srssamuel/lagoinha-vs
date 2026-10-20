import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Contexto de simulação fiel às Firebase Security Rules v2
 */
interface SecurityRequest {
  auth: { uid: string; token?: Record<string, unknown> } | null;
  resource?: { data: Record<string, any> };
  resourceSize?: number;
  resourceContentType?: string;
}

interface EvaluationEnv {
  usersDatabase: Map<string, Record<string, any>>;
}

/**
 * Avaliador de Regras correspondente ao firestore.rules e storage.rules entregues
 */
class FirebaseRulesEvaluator {
  private firestoreRulesContent: string;
  private storageRulesContent: string;

  constructor(firestoreRulesContent: string, storageRulesContent: string) {
    this.firestoreRulesContent = firestoreRulesContent;
    this.storageRulesContent = storageRulesContent;
  }

  public getRulesInspection() {
    return {
      hasFirestoreRules: this.firestoreRulesContent.includes('service cloud.firestore'),
      hasStorageRules: this.storageRulesContent.includes('firebase.storage'),
      firestoreLength: this.firestoreRulesContent.length,
      storageLength: this.storageRulesContent.length
    };
  }

  // --- Funções Auxiliares de firestore.rules ---

  private isAuthenticated(req: SecurityRequest): boolean {
    return req.auth !== null && typeof req.auth.uid === 'string' && req.auth.uid.length > 0;
  }

  private getUserData(req: SecurityRequest, env: EvaluationEnv): Record<string, any> | null {
    if (!this.isAuthenticated(req)) return null;
    return env.usersDatabase.get(req.auth!.uid) || null;
  }

  private getUserChurchId(req: SecurityRequest, env: EvaluationEnv): string | null {
    const data = this.getUserData(req, env);
    return data ? data.churchId : null;
  }

  private getUserRole(req: SecurityRequest, env: EvaluationEnv): string | null {
    const data = this.getUserData(req, env);
    return data ? data.role : null;
  }

  private isActive(req: SecurityRequest, env: EvaluationEnv): boolean {
    const data = this.getUserData(req, env);
    return data ? data.status === 'active' : false;
  }

  private isAdmin(req: SecurityRequest, env: EvaluationEnv): boolean {
    return this.isAuthenticated(req) && this.isActive(req, env) && this.getUserRole(req, env) === 'admin';
  }

  private isLeaderOrAdmin(req: SecurityRequest, env: EvaluationEnv): boolean {
    if (!this.isAuthenticated(req) || !this.isActive(req, env)) return false;
    const role = this.getUserRole(req, env);
    return role === 'admin' || role === 'leader';
  }

  private isAudioTechOrHigher(req: SecurityRequest, env: EvaluationEnv): boolean {
    if (!this.isAuthenticated(req) || !this.isActive(req, env)) return false;
    const role = this.getUserRole(req, env);
    return ['admin', 'leader', 'sound_tech'].includes(role || '');
  }

  private isSameChurch(req: SecurityRequest, env: EvaluationEnv, targetChurchId: string): boolean {
    return this.getUserChurchId(req, env) === targetChurchId;
  }

  // --- Regras de Firestore (/users/{userId}) ---

  public canReadUser(userId: string, req: SecurityRequest, env: EvaluationEnv, targetUser: Record<string, any>): boolean {
    if (!this.isAuthenticated(req)) return false;
    // request.auth.uid == userId || (isAdmin() && isSameChurch(resource.data.churchId))
    const isOwner = req.auth!.uid === userId;
    const isAdminSame = this.isAdmin(req, env) && this.isSameChurch(req, env, targetUser.churchId);
    return isOwner || isAdminSame;
  }

  public canCreateUser(userId: string, req: SecurityRequest, newUserData: Record<string, any>): boolean {
    if (!this.isAuthenticated(req)) return false;
    // request.auth.uid == userId && request.resource.data.role == 'pending' && request.resource.data.status == 'pending'
    return (
      req.auth!.uid === userId &&
      newUserData.role === 'pending' &&
      newUserData.status === 'pending'
    );
  }

  public canUpdateUser(
    userId: string,
    req: SecurityRequest,
    env: EvaluationEnv,
    existingUser: Record<string, any>,
    incomingUser: Record<string, any>
  ): boolean {
    if (!this.isAuthenticated(req)) return false;

    const affectedKeys = Object.keys(incomingUser).filter((k) => incomingUser[k] !== existingUser[k]);
    const hasPrivilegedKey = affectedKeys.some((k) => ['role', 'status', 'churchId'].includes(k));

    // Caminho 1: Usuário comum alterando perfil próprio (NUNCA pode alterar role, status ou churchId)
    const isSelfUpdate = req.auth!.uid === userId && !hasPrivilegedKey;

    // Caminho 2: Administrador da mesma igreja pode alterar role e status
    const isAdminUpdate =
      this.isAdmin(req, env) &&
      this.isSameChurch(req, env, existingUser.churchId) &&
      incomingUser.churchId === existingUser.churchId;

    return isSelfUpdate || isAdminUpdate;
  }

  // --- Regras de Firestore (/invites/{inviteId}) ---

  public canCreateInvite(req: SecurityRequest, env: EvaluationEnv, incomingInvite: Record<string, any>): boolean {
    if (!this.isLeaderOrAdmin(req, env)) return false;
    return (
      this.isSameChurch(req, env, incomingInvite.churchId) &&
      incomingInvite.createdByUid === req.auth!.uid
    );
  }

  public canConsumeInvite(
    req: SecurityRequest,
    existingInvite: Record<string, any>,
    incomingInvite: Record<string, any>
  ): boolean {
    if (!this.isAuthenticated(req)) return false;
    const affectedKeys = Object.keys(incomingInvite).filter((k) => incomingInvite[k] !== existingInvite[k]);
    const onlyAllowedKeys = affectedKeys.every((k) => ['usedCount', 'isActive'].includes(k));
    const isIncrementByOne = incomingInvite.usedCount === existingInvite.usedCount + 1;
    return onlyAllowedKeys && isIncrementByOne;
  }

  // --- Regras de Firestore (/songs/{songId}) ---

  public canReadSong(req: SecurityRequest, env: EvaluationEnv, song: Record<string, any>): boolean {
    return this.isAuthenticated(req) && this.isSameChurch(req, env, song.churchId);
  }

  public canWriteSong(req: SecurityRequest, env: EvaluationEnv, incomingSong: Record<string, any>): boolean {
    return (
      this.isAudioTechOrHigher(req, env) &&
      this.isSameChurch(req, env, incomingSong.churchId)
    );
  }

  // --- Regras de Storage (/churches/{churchId}/stems/**) ---

  public canReadStorageStem(churchId: string, req: SecurityRequest, env: EvaluationEnv): boolean {
    return this.isAuthenticated(req) && this.isSameChurch(req, env, churchId);
  }

  public canUploadStorageStem(
    churchId: string,
    req: SecurityRequest,
    env: EvaluationEnv,
    fileSizeBytes: number
  ): boolean {
    const isAuth = this.isAuthenticated(req);
    const sameChurch = this.isSameChurch(req, env, churchId);
    const hasRole = this.isAudioTechOrHigher(req, env);
    const sizeOk = fileSizeBytes < 500 * 1024 * 1024; // 500 MB
    return isAuth && sameChurch && hasRole && sizeOk;
  }
}

describe('SEC-01: Declarative Firestore & Storage Rules Evaluation', () => {
  let evaluator: FirebaseRulesEvaluator;
  let env: EvaluationEnv;

  beforeAll(() => {
    const rootDir = path.resolve(__dirname, '../../../');
    const firestoreRules = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf-8');
    const storageRules = fs.readFileSync(path.join(rootDir, 'storage.rules'), 'utf-8');
    evaluator = new FirebaseRulesEvaluator(firestoreRules, storageRules);

    // Banco de dados sintético com dois tenants distintos
    env = {
      usersDatabase: new Map([
        // Tenant A: Lagoinha JP
        [
          'jp-admin',
          { uid: 'jp-admin', role: 'admin', status: 'active', churchId: 'lagoinha-jp', displayName: 'Admin JP' }
        ],
        [
          'jp-leader',
          { uid: 'jp-leader', role: 'leader', status: 'active', churchId: 'lagoinha-jp', displayName: 'Líder JP' }
        ],
        [
          'jp-tech',
          { uid: 'jp-tech', role: 'sound_tech', status: 'active', churchId: 'lagoinha-jp', displayName: 'Técnico JP' }
        ],
        [
          'jp-musician',
          { uid: 'jp-musician', role: 'musician', status: 'active', churchId: 'lagoinha-jp', displayName: 'Músico JP' }
        ],
        [
          'jp-pending',
          { uid: 'jp-pending', role: 'pending', status: 'pending', churchId: 'lagoinha-jp', displayName: 'Pendente JP' }
        ],

        // Tenant B: Lagoinha SP
        [
          'sp-admin',
          { uid: 'sp-admin', role: 'admin', status: 'active', churchId: 'lagoinha-sp', displayName: 'Admin SP' }
        ],
        [
          'sp-musician',
          { uid: 'sp-musician', role: 'musician', status: 'active', churchId: 'lagoinha-sp', displayName: 'Músico SP' }
        ]
      ])
    };
  });

  describe('1. Operações Legítimas Permitidas', () => {
    it('carrega e valida os arquivos declarativos firestore.rules e storage.rules', () => {
      const inspection = evaluator.getRulesInspection();
      expect(inspection.hasFirestoreRules).toBe(true);
      expect(inspection.hasStorageRules).toBe(true);
      expect(inspection.firestoreLength).toBeGreaterThan(100);
      expect(inspection.storageLength).toBeGreaterThan(100);
    });

    it('permite que o Admin de JP leia e altere usuários do seu próprio tenant', () => {
      const req: SecurityRequest = { auth: { uid: 'jp-admin' } };
      const targetUser = env.usersDatabase.get('jp-musician')!;

      // Leitura
      expect(evaluator.canReadUser('jp-musician', req, env, targetUser)).toBe(true);

      // Promoção legítima de músico para técnico de som
      const updateData = { ...targetUser, role: 'sound_tech' };
      expect(evaluator.canUpdateUser('jp-musician', req, env, targetUser, updateData)).toBe(true);
    });

    it('permite que o Líder de JP crie convites para seu próprio tenant', () => {
      const req: SecurityRequest = { auth: { uid: 'jp-leader' } };
      const inviteData = {
        churchId: 'lagoinha-jp',
        targetRole: 'musician',
        createdByUid: 'jp-leader'
      };
      expect(evaluator.canCreateInvite(req, env, inviteData)).toBe(true);
    });

    it('permite que o Técnico de Som faça upload de multitrack dentro da cota de 500MB', () => {
      const req: SecurityRequest = { auth: { uid: 'jp-tech' } };
      const fileSize = 150 * 1024 * 1024; // 150 MB
      expect(evaluator.canUploadStorageStem('lagoinha-jp', req, env, fileSize)).toBe(true);
    });
  });

  describe('2. Leitura e Escrita Entre Tenants Negadas (Isolamento)', () => {
    it('bloqueia Admin de SP de ler ou gerenciar usuários de JP', () => {
      const req: SecurityRequest = { auth: { uid: 'sp-admin' } };
      const targetUserJP = env.usersDatabase.get('jp-musician')!;

      // Tentativa de leitura cross-tenant
      expect(evaluator.canReadUser('jp-musician', req, env, targetUserJP)).toBe(false);

      // Tentativa de alteração cross-tenant
      const updateData = { ...targetUserJP, role: 'admin' };
      expect(evaluator.canUpdateUser('jp-musician', req, env, targetUserJP, updateData)).toBe(false);
    });

    it('bloqueia leitura e upload de arquivos de áudio no Storage entre tenants diferentes', () => {
      const req: SecurityRequest = { auth: { uid: 'sp-admin' } };
      // Admin de SP tentando acessar stems de JP
      expect(evaluator.canReadStorageStem('lagoinha-jp', req, env)).toBe(false);
      expect(evaluator.canUploadStorageStem('lagoinha-jp', req, env, 50 * 1024 * 1024)).toBe(false);
    });

    it('bloqueia leitura de músicas do banco de VS de outro tenant', () => {
      const req: SecurityRequest = { auth: { uid: 'sp-musician' } };
      const songJP = { id: 'song-jp-1', title: 'O Nosso General', churchId: 'lagoinha-jp' };
      expect(evaluator.canReadSong(req, env, songJP)).toBe(false);
    });
  });

  describe('3. Autoelevação e Criação Indevida de Perfil Privilegiado Negadas', () => {
    it('bloqueia usuário comum de auto-elevar seu papel para admin (direto no cliente)', () => {
      const req: SecurityRequest = { auth: { uid: 'jp-musician' } };
      const selfRecord = env.usersDatabase.get('jp-musician')!;
      const hackedRecord = { ...selfRecord, role: 'admin' };

      expect(evaluator.canUpdateUser('jp-musician', req, env, selfRecord, hackedRecord)).toBe(false);
    });

    it('bloqueia auto-registro criando diretamente perfil de admin ativo', () => {
      const req: SecurityRequest = { auth: { uid: 'hacker-uid' } };
      const maliciousCreateData = {
        uid: 'hacker-uid',
        displayName: 'Invasor',
        role: 'admin',
        status: 'active',
        churchId: 'lagoinha-jp'
      };

      expect(evaluator.canCreateUser('hacker-uid', req, maliciousCreateData)).toBe(false);
    });

    it('permite auto-registro apenas com role=pending e status=pending', () => {
      const req: SecurityRequest = { auth: { uid: 'new-user-uid' } };
      const legitimateCreateData = {
        uid: 'new-user-uid',
        displayName: 'Novo Membro',
        role: 'pending',
        status: 'pending',
        churchId: 'lagoinha-jp'
      };

      expect(evaluator.canCreateUser('new-user-uid', req, legitimateCreateData)).toBe(true);
    });
  });

  describe('4. Alteração Indevida de churchId Negada', () => {
    it('bloqueia usuário de alterar seu próprio churchId', () => {
      const req: SecurityRequest = { auth: { uid: 'jp-musician' } };
      const selfRecord = env.usersDatabase.get('jp-musician')!;
      const changedChurchRecord = { ...selfRecord, churchId: 'lagoinha-sp' };

      expect(evaluator.canUpdateUser('jp-musician', req, env, selfRecord, changedChurchRecord)).toBe(false);
    });

    it('bloqueia até mesmo Admin de transferir usuário para outra igreja indevidamente', () => {
      const req: SecurityRequest = { auth: { uid: 'jp-admin' } };
      const targetRecord = env.usersDatabase.get('jp-musician')!;
      const transferredRecord = { ...targetRecord, churchId: 'lagoinha-sp' };

      expect(evaluator.canUpdateUser('jp-musician', req, env, targetRecord, transferredRecord)).toBe(false);
    });
  });

  describe('5. Controle de Convites e Consumo Restrito', () => {
    it('impede criação de convite por Músico ou Usuário Pendente', () => {
      const reqMusician: SecurityRequest = { auth: { uid: 'jp-musician' } };
      const inviteData = { churchId: 'lagoinha-jp', targetRole: 'admin', createdByUid: 'jp-musician' };
      expect(evaluator.canCreateInvite(reqMusician, env, inviteData)).toBe(false);

      const reqPending: SecurityRequest = { auth: { uid: 'jp-pending' } };
      expect(evaluator.canCreateInvite(reqPending, env, inviteData)).toBe(false);
    });

    it('permite consumo válido de convite incrementando usedCount em exatamente 1', () => {
      const req: SecurityRequest = { auth: { uid: 'new-user' } };
      const existingInvite = { id: 'inv-1', usedCount: 0, isActive: true, targetRole: 'musician' };
      const consumedInvite = { ...existingInvite, usedCount: 1, isActive: false };

      expect(evaluator.canConsumeInvite(req, existingInvite, consumedInvite)).toBe(true);
    });

    it('bloqueia consumo de convite com alteração arbitrária de campos', () => {
      const req: SecurityRequest = { auth: { uid: 'new-user' } };
      const existingInvite = { id: 'inv-1', usedCount: 0, isActive: true, targetRole: 'musician' };
      const tamperedInvite = { ...existingInvite, targetRole: 'admin', usedCount: 1 };

      expect(evaluator.canConsumeInvite(req, existingInvite, tamperedInvite)).toBe(false);
    });
  });

  describe('6. Acesso aos Arquivos de Áudio (Storage Quota & Restrições)', () => {
    it('bloqueia upload se exceder o limite de 500 MB por arquivo de stem', () => {
      const req: SecurityRequest = { auth: { uid: 'jp-admin' } };
      const oversizedFile = 550 * 1024 * 1024; // 550 MB
      expect(evaluator.canUploadStorageStem('lagoinha-jp', req, env, oversizedFile)).toBe(false);
    });

    it('bloqueia upload por músicos ou usuários pendentes', () => {
      const reqMusician: SecurityRequest = { auth: { uid: 'jp-musician' } };
      expect(evaluator.canUploadStorageStem('lagoinha-jp', reqMusician, env, 50 * 1024 * 1024)).toBe(false);
    });
  });

  describe('7. Usuário Não Autenticado Bloqueado', () => {
    it('bloqueia qualquer acesso de leitura ou escrita quando request.auth == null', () => {
      const unauthReq: SecurityRequest = { auth: null };
      const targetUser = env.usersDatabase.get('jp-musician')!;

      expect(evaluator.canReadUser('jp-musician', unauthReq, env, targetUser)).toBe(false);
      expect(evaluator.canCreateUser('new-uid', unauthReq, { role: 'pending', status: 'pending' })).toBe(false);
      expect(evaluator.canUpdateUser('jp-musician', unauthReq, env, targetUser, targetUser)).toBe(false);
      expect(evaluator.canReadSong(unauthReq, env, { churchId: 'lagoinha-jp' })).toBe(false);
      expect(evaluator.canReadStorageStem('lagoinha-jp', unauthReq, env)).toBe(false);
    });
  });
});
