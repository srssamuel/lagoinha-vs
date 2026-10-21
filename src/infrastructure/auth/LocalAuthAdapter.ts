import { AuthPort } from '../../application/ports/AuthPort';
import { CreateInviteProps, MembershipPort } from '../../application/ports/MembershipPort';
import { User, UserRole, UserStatus } from '../../domain/entities/User';
import { InviteToken, InviteTokenProps } from '../../domain/entities/InviteToken';
import { hashPassword, isModernHash, randomToken, verifyPassword } from './passwordHash';

const CURRENT_USER_KEY = 'lagoinha_vs_auth_user';
const USERS_DB_KEY = 'lagoinha_vs_users_db';
const INVITES_DB_KEY = 'lagoinha_vs_invites_db';
const LOGGED_OUT_KEY = 'lagoinha_vs_logged_out';

interface StoredUserRecord {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  churchBranch: string;
  churchId?: string;
  status: UserStatus;
  instrumentOrMinistry?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  passwordHash?: string;
}

export interface LocalAuthAdapterOptions {
  /**
   * Modo demonstração: entra direto como o admin de exemplo, libera "Acesso Demo" e o Google simulado.
   * Padrão: ligado no `npm run dev` ou com VITE_DEMO_MODE=true; desligado no build de produção.
   */
  demoMode?: boolean;
}

const INVALID_CREDENTIALS = 'Credenciais inválidas.';

/** Lê a flag de demo do Vite sem quebrar fora dele. */
function defaultDemoMode(): boolean {
  try {
    return import.meta.env.DEV === true || import.meta.env.VITE_DEMO_MODE === 'true';
  } catch {
    return false;
  }
}

/**
 * Adaptador de autenticação LOCAL (localStorage do aparelho), apesar do nome.
 * Senhas guardadas com PBKDF2; o papel e a igreja vêm do cadastro, não da sessão salva.
 * Não é segurança de servidor: qualquer pessoa com o aparelho pode editar o localStorage.
 * Multi-igreja em produção exige o backend descrito em docs/architecture.
 */
export class LocalAuthAdapter implements AuthPort, MembershipPort {
  private currentUser: User | null = null;
  private listeners: Set<(user: User | null) => void> = new Set();
  private readonly demoMode: boolean;

  constructor(options: LocalAuthAdapterOptions = {}) {
    this.demoMode = options.demoMode ?? defaultDemoMode();
    this.ensureInitialSeedData();
    this.loadPersistedUser();
  }

  public isDemoMode(): boolean {
    return this.demoMode;
  }

  private ensureInitialSeedData(): void {
    // Fora do modo demo o aparelho começa vazio: a primeira conta cadastrada vira a administradora.
    if (!this.demoMode) return;
    try {
      const existing = localStorage.getItem(USERS_DB_KEY);
      if (!existing) {
        // Usuário inicial Administrador Oficial (Leandro Machado)
        const defaultAdmin: StoredUserRecord = {
          uid: 'admin-leandro-machado',
          email: 'leandro@lagoinhajp.com.br',
          displayName: 'Leandro Machado',
          role: 'admin',
          churchBranch: 'Lagoinha João Pessoa',
          churchId: 'lagoinha-jp',
          status: 'active',
          instrumentOrMinistry: 'Direção Musical & FOH',
          createdAt: new Date().toISOString()
        };

        // Usuário de demonstração com aprovação pendente para teste da UI
        const demoPending: StoredUserRecord = {
          uid: 'pending-marcos-guitar',
          email: 'marcos@lagoinhajp.com.br',
          displayName: 'Marcos Silva',
          role: 'pending',
          churchBranch: 'Lagoinha João Pessoa',
          churchId: 'lagoinha-jp',
          status: 'pending',
          instrumentOrMinistry: 'Guitarra Elétrica',
          createdAt: new Date(Date.now() - 3600 * 1000).toISOString()
        };

        const initialUsers: StoredUserRecord[] = [defaultAdmin, demoPending];
        localStorage.setItem(USERS_DB_KEY, JSON.stringify(initialUsers));
      }
    } catch {
      // Storage unavailable
    }
  }

  private loadPersistedUser(): void {
    try {
      const saved = localStorage.getItem(CURRENT_USER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<StoredUserRecord>;
        // Papel, status e igreja vêm do cadastro: editar a sessão salva não eleva ninguém.
        const record = this.getStoredUsers().find((u) => u.uid === parsed.uid);
        if (record) {
          this.currentUser = new User({ ...record, churchId: record.churchId || 'lagoinha-jp' });
          return;
        }
        // Sessões de demonstração não têm cadastro; só valem no modo demo.
        if (this.demoMode && typeof parsed.uid === 'string' && parsed.uid.startsWith('demo-')) {
          this.currentUser = new User({
            uid: parsed.uid,
            email: parsed.email ?? '',
            displayName: parsed.displayName ?? 'Demonstração',
            role: (parsed.role as UserRole) ?? 'musician',
            churchBranch: 'Lagoinha João Pessoa',
            churchId: 'lagoinha-jp',
            status: (parsed.status as UserStatus) ?? 'active'
          });
          return;
        }
        localStorage.removeItem(CURRENT_USER_KEY);
      }

      const explicitlyLoggedOut = localStorage.getItem(LOGGED_OUT_KEY) === 'true';
      if (this.demoMode && !explicitlyLoggedOut) {
        // Por padrão no primeiro acesso, loga como Leandro Machado (Admin)
        this.currentUser = new User({
          uid: 'admin-leandro-machado',
          email: 'leandro@lagoinhajp.com.br',
          displayName: 'Leandro Machado',
          role: 'admin',
          churchBranch: 'Lagoinha João Pessoa',
          churchId: 'lagoinha-jp',
          status: 'active',
          instrumentOrMinistry: 'Direção Musical & FOH'
        });
      }
    } catch {
      this.currentUser = null;
    }
  }

  public async signInWithGoogle(): Promise<User> {
    if (!this.demoMode) {
      throw new Error('Login com Google ainda não está configurado. Entre com email e senha.');
    }
    const googleUser = new User({
      uid: `google-${Date.now()}`,
      email: 'leandro@lagoinhajp.com.br',
      displayName: 'Leandro Machado (Google)',
      role: 'admin',
      churchBranch: 'Lagoinha João Pessoa',
      churchId: 'lagoinha-jp',
      status: 'active'
    });

    this.setCurrentUser(googleUser);
    return Promise.resolve(googleUser);
  }

  public async signInWithEmail(email: string, pass: string): Promise<User> {
    const users = this.getStoredUsers();
    const cleanEmail = email.trim().toLowerCase();
    const existing = users.find((u) => u.email.toLowerCase() === cleanEmail);

    // Email desconhecido, conta sem senha (exemplo do modo demo) ou senha errada: mesma resposta.
    if (!existing || !(await verifyPassword(pass, existing.passwordHash))) {
      throw new Error(INVALID_CREDENTIALS);
    }

    if (!isModernHash(existing.passwordHash)) {
      existing.passwordHash = await hashPassword(pass);
      this.saveAllUsers(users);
    }

    const user = new User({ ...existing, churchId: existing.churchId || 'lagoinha-jp' });
    this.setCurrentUser(user);
    return user;
  }

  public async registerWithEmail(
    email: string,
    pass: string,
    displayName: string,
    instrumentOrMinistry?: string,
    inviteTokenString?: string
  ): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !pass) {
      throw new Error('Informe email e senha.');
    }
    if (pass.length < 8) {
      throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    }
    const users = this.getStoredUsers();
    if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('Já existe uma conta com este email neste aparelho.');
    }

    let assignedRole: UserRole = 'pending';
    let assignedStatus: UserStatus = 'pending';
    let assignedChurchBranch = 'Lagoinha João Pessoa';
    let assignedChurchId = 'lagoinha-jp';

    // Aparelho sem nenhuma administração com senha (instalação nova fora do modo demo):
    // a primeira conta cadastrada administra este aparelho.
    const hasCredentialedAdmin = users.some((u) => u.role === 'admin' && u.status === 'active' && u.passwordHash);
    if (!this.demoMode && !hasCredentialedAdmin) {
      assignedRole = 'admin';
      assignedStatus = 'active';
    }

    // Se informou um token de convite válido, auto-aprova imediatamente com a role e congregação do convite!
    if (inviteTokenString) {
      const invite = await this.validateInviteToken(inviteTokenString);
      if (invite) {
        invite.consume();
        this.saveInviteTokenToDb(invite);
        assignedRole = invite.targetRole;
        assignedStatus = 'active';
        assignedChurchBranch = invite.churchBranch;
        assignedChurchId = invite.churchId;
      }
    }

    const newUser = new User({
      uid: `usr-${Date.now()}-${randomToken(4)}`,
      email: cleanEmail,
      displayName: displayName.trim(),
      role: assignedRole,
      churchBranch: assignedChurchBranch,
      churchId: assignedChurchId,
      status: assignedStatus,
      instrumentOrMinistry: instrumentOrMinistry?.trim()
    });

    await this.saveUserToDb(newUser, pass);
    this.setCurrentUser(newUser);
    return newUser;
  }

  public async signInDemo(role: UserRole, displayName: string): Promise<User> {
    if (!this.demoMode) {
      throw new Error('Acesso de demonstração desativado nesta instalação.');
    }
    const demoUser = new User({
      uid: `demo-${role}-${Date.now()}`,
      email: `${role}@lagoinhajp.com.br`,
      displayName,
      role,
      churchBranch: 'Lagoinha João Pessoa',
      churchId: 'lagoinha-jp',
      status: role === 'pending' ? 'pending' : 'active'
    });

    this.setCurrentUser(demoUser);
    return Promise.resolve(demoUser);
  }

  public async signOut(): Promise<void> {
    this.currentUser = null;
    try {
      localStorage.removeItem(CURRENT_USER_KEY);
      localStorage.setItem(LOGGED_OUT_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
    this.notify();
    return Promise.resolve();
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public onAuthStateChanged(callback: (user: User | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentUser);
    return () => this.listeners.delete(callback);
  }

  // --- MÉTODOS ADMINISTRATIVOS ---

  public async listPendingUsers(churchId?: string): Promise<User[]> {
    const users = this.getStoredUsers();
    return Promise.resolve(
      users
        .filter((u) => u.status === 'pending' || u.role === 'pending')
        .filter((u) => !churchId || (u.churchId || 'lagoinha-jp') === churchId)
        .map((u) => new User(u))
    );
  }

  public async listAllUsers(churchId?: string): Promise<User[]> {
    const users = this.getStoredUsers();
    return Promise.resolve(
      users
        .filter((u) => !churchId || (u.churchId || 'lagoinha-jp') === churchId)
        .map((u) => new User(u))
    );
  }

  public async approveUser(uid: string, assignedRole: UserRole, adminUid: string): Promise<User> {
    const users = this.getStoredUsers();
    const admin = users.find((u) => u.uid === adminUid);
    if (!admin || admin.role !== 'admin' || admin.status !== 'active') {
      throw new Error('Acesso negado: apenas administradores ativos podem aprovar usuários.');
    }

    const idx = users.findIndex((u) => u.uid === uid);
    if (idx === -1) {
      throw new Error(`Usuário não encontrado: ${uid}`);
    }

    const record = users[idx]!;
    const adminChurchId = admin.churchId || 'lagoinha-jp';
    const targetChurchId = record.churchId || 'lagoinha-jp';
    if (adminChurchId !== targetChurchId) {
      throw new Error('Acesso negado: violação de isolamento multi-tenant entre igrejas.');
    }

    record.status = 'active';
    record.role = assignedRole;
    record.approvedBy = adminUid;
    record.approvedAt = new Date().toISOString();

    localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));

    const updatedUser = new User(record);
    // Se o usuário aprovado for o que está logado na sessão corrente, atualiza
    if (this.currentUser && this.currentUser.uid === uid) {
      this.setCurrentUser(updatedUser);
    }
    return Promise.resolve(updatedUser);
  }

  public async rejectUser(uid: string, adminUid: string): Promise<void> {
    const users = this.getStoredUsers();
    const admin = users.find((u) => u.uid === adminUid);
    if (!admin || admin.role !== 'admin' || admin.status !== 'active') {
      throw new Error('Acesso negado: apenas administradores ativos podem rejeitar usuários.');
    }

    const target = users.find((u) => u.uid === uid);
    if (!target) return Promise.resolve();

    const adminChurchId = admin.churchId || 'lagoinha-jp';
    const targetChurchId = target.churchId || 'lagoinha-jp';
    if (adminChurchId !== targetChurchId) {
      throw new Error('Acesso negado: violação de isolamento multi-tenant entre igrejas.');
    }

    const remaining = users.filter((u) => u.uid !== uid);
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(remaining));
    return Promise.resolve();
  }

  public async updateUserRole(uid: string, newRole: UserRole, adminUid: string): Promise<User> {
    const users = this.getStoredUsers();
    const admin = users.find((u) => u.uid === adminUid);

    // Bloqueia auto-elevação indevida se o usuário solicitante não for admin ativo
    if (adminUid === uid && (!admin || admin.role !== 'admin')) {
      throw new Error('Acesso negado: auto-elevação de papel não autorizada.');
    }

    if (!admin || admin.role !== 'admin' || admin.status !== 'active') {
      throw new Error('Acesso negado: apenas administradores ativos podem alterar papéis de usuário.');
    }

    const idx = users.findIndex((u) => u.uid === uid);
    if (idx === -1) {
      throw new Error(`Usuário não encontrado: ${uid}`);
    }

    const record = users[idx]!;
    const adminChurchId = admin.churchId || 'lagoinha-jp';
    const targetChurchId = record.churchId || 'lagoinha-jp';
    if (adminChurchId !== targetChurchId) {
      throw new Error('Acesso negado: violação de isolamento multi-tenant entre igrejas.');
    }

    record.role = newRole;
    if (record.status === 'pending' && newRole !== 'pending') {
      record.status = 'active';
    }

    localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
    const updated = new User(record);
    if (this.currentUser && this.currentUser.uid === uid) {
      this.setCurrentUser(updated);
    }
    return Promise.resolve(updated);
  }

  // --- GESTÃO DE LINKS DE CONVITE ---

  public async createInviteLink(props: CreateInviteProps): Promise<InviteToken> {
    if (
      !props.adminUser ||
      (!props.adminUser.isAdmin && props.adminUser.role !== 'leader') ||
      !props.adminUser.isActive
    ) {
      throw new Error('Acesso negado: apenas administradores ou líderes ativos podem gerar convites.');
    }

    const randPart = randomToken();
    const tokenStr = `lagoinha-${props.targetRole}-${randPart}`;
    const expiresAt = props.expiresHours
      ? new Date(Date.now() + props.expiresHours * 3600 * 1000).toISOString()
      : null;

    const token = new InviteToken({
      id: `inv-${Date.now()}`,
      token: tokenStr,
      targetRole: props.targetRole,
      churchBranch: props.adminUser.churchBranch || 'Lagoinha João Pessoa',
      churchId: props.adminUser.churchId || 'lagoinha-jp',
      expiresAt,
      maxUses: props.maxUses ?? 1,
      usedCount: 0,
      createdByUid: props.adminUser.uid,
      createdByName: props.adminUser.displayName,
      isActive: true
    });

    this.saveInviteTokenToDb(token);
    return Promise.resolve(token);
  }

  public async listInviteTokens(): Promise<InviteToken[]> {
    const stored = this.getStoredInviteTokens();
    return Promise.resolve(stored);
  }

  public async revokeInviteToken(tokenId: string): Promise<void> {
    const tokens = this.getStoredInviteTokens();
    const target = tokens.find((t) => t.id === tokenId || t.token === tokenId);
    if (target) {
      target.revoke();
      this.saveAllInviteTokens(tokens);
    }
    return Promise.resolve();
  }

  public async validateInviteToken(tokenString: string): Promise<InviteToken | null> {
    const tokens = this.getStoredInviteTokens();
    const found = tokens.find((t) => t.token.trim() === tokenString.trim());
    if (found && found.isValid()) {
      return Promise.resolve(found);
    }
    return Promise.resolve(null);
  }

  // --- HELPERS INTERNOS DE PERSISTÊNCIA ---

  private getStoredUsers(): StoredUserRecord[] {
    try {
      const data = localStorage.getItem(USERS_DB_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveAllUsers(users: StoredUserRecord[]): void {
    try {
      localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
    } catch {
      // Storage full or unavailable
    }
  }

  private async saveUserToDb(user: User, password?: string): Promise<void> {
    const passwordHash = password ? await hashPassword(password) : undefined;
    try {
      const users = this.getStoredUsers();
      const idx = users.findIndex((u) => u.uid === user.uid);
      const record: StoredUserRecord = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: user.role,
        churchBranch: user.churchBranch,
        churchId: user.churchId,
        status: user.status,
        instrumentOrMinistry: user.instrumentOrMinistry,
        approvedBy: user.approvedBy,
        approvedAt: user.approvedAt,
        createdAt: user.createdAt,
        passwordHash: passwordHash ?? users[idx]?.passwordHash
      };

      if (idx >= 0) {
        users[idx] = record;
      } else {
        users.push(record);
      }
      localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
    } catch {
      // Storage full or unavailable
    }
  }

  private getStoredInviteTokens(): InviteToken[] {
    try {
      const data = localStorage.getItem(INVITES_DB_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data) as InviteTokenProps[];
      return parsed.map((item) => new InviteToken(item));
    } catch {
      return [];
    }
  }

  private saveInviteTokenToDb(token: InviteToken): void {
    const tokens = this.getStoredInviteTokens();
    const idx = tokens.findIndex((t) => t.id === token.id);
    if (idx >= 0) {
      tokens[idx] = token;
    } else {
      tokens.unshift(token);
    }
    this.saveAllInviteTokens(tokens);
  }

  private saveAllInviteTokens(tokens: InviteToken[]): void {
    try {
      localStorage.setItem(INVITES_DB_KEY, JSON.stringify(tokens));
    } catch {
      // Storage unavailable
    }
  }

  private setCurrentUser(user: User): void {
    this.currentUser = user;
    try {
      localStorage.removeItem(LOGGED_OUT_KEY);
      localStorage.setItem(
        CURRENT_USER_KEY,
        JSON.stringify({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: user.role,
          churchBranch: user.churchBranch,
          churchId: user.churchId,
          status: user.status,
          instrumentOrMinistry: user.instrumentOrMinistry
        })
      );
    } catch {
      // Storage error ignored
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb(this.currentUser));
  }
}
