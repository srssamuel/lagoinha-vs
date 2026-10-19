import { AuthPort, CreateInviteProps } from '../../application/ports/AuthPort';
import { User, UserRole, UserStatus } from '../../domain/entities/User';
import { InviteToken } from '../../domain/entities/InviteToken';

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
  status: UserStatus;
  instrumentOrMinistry?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  passwordHash?: string;
}

export class FirebaseAuthService implements AuthPort {
  private currentUser: User | null = null;
  private listeners: Set<(user: User | null) => void> = new Set();

  constructor() {
    this.ensureInitialSeedData();
    this.loadPersistedUser();
  }

  private ensureInitialSeedData(): void {
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
        const parsed = JSON.parse(saved);
        this.currentUser = new User({
          uid: parsed.uid,
          email: parsed.email,
          displayName: parsed.displayName,
          photoURL: parsed.photoURL,
          role: parsed.role as UserRole,
          churchBranch: parsed.churchBranch || 'Lagoinha João Pessoa',
          status: parsed.status as UserStatus,
          instrumentOrMinistry: parsed.instrumentOrMinistry
        });
        return;
      }

      const explicitlyLoggedOut = localStorage.getItem(LOGGED_OUT_KEY) === 'true';
      if (!explicitlyLoggedOut) {
        // Por padrão no primeiro acesso, loga como Leandro Machado (Admin)
        this.currentUser = new User({
          uid: 'admin-leandro-machado',
          email: 'leandro@lagoinhajp.com.br',
          displayName: 'Leandro Machado',
          role: 'admin',
          churchBranch: 'Lagoinha João Pessoa',
          status: 'active',
          instrumentOrMinistry: 'Direção Musical & FOH'
        });
      }
    } catch {
      this.currentUser = null;
    }
  }

  public async signInWithGoogle(): Promise<User> {
    const googleUser = new User({
      uid: `google-${Date.now()}`,
      email: 'leandro@lagoinhajp.com.br',
      displayName: 'Leandro Machado (Google)',
      role: 'admin',
      churchBranch: 'Lagoinha João Pessoa',
      status: 'active'
    });

    this.setCurrentUser(googleUser);
    return Promise.resolve(googleUser);
  }

  public async signInWithEmail(email: string, pass: string): Promise<User> {
    const users = this.getStoredUsers();
    const cleanEmail = email.trim().toLowerCase();
    const existing = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (existing) {
      const user = new User({
        uid: existing.uid,
        email: existing.email,
        displayName: existing.displayName,
        photoURL: existing.photoURL,
        role: existing.role,
        churchBranch: existing.churchBranch,
        status: existing.status,
        instrumentOrMinistry: existing.instrumentOrMinistry
      });
      this.setCurrentUser(user);
      return Promise.resolve(user);
    }

    // Se o usuário não existir no banco, cria como Administrador se for email de liderança, ou pending
    const isLeadershipEmail =
      cleanEmail.includes('leandro') ||
      cleanEmail.includes('admin') ||
      cleanEmail.includes('louvor') ||
      cleanEmail.includes('lider');

    const newUser = new User({
      uid: `usr-${Date.now()}`,
      email,
      displayName: email.split('@')[0] || 'Membro do Louvor',
      role: isLeadershipEmail ? 'admin' : 'pending',
      churchBranch: 'Lagoinha João Pessoa',
      status: isLeadershipEmail ? 'active' : 'pending'
    });

    this.saveUserToDb(newUser, pass);
    this.setCurrentUser(newUser);
    return Promise.resolve(newUser);
  }

  public async registerWithEmail(
    email: string,
    pass: string,
    displayName: string,
    instrumentOrMinistry?: string,
    inviteTokenString?: string
  ): Promise<User> {
    let assignedRole: UserRole = 'pending';
    let assignedStatus: UserStatus = 'pending';

    // Se informou um token de convite válido, auto-aprova imediatamente com a role do convite!
    if (inviteTokenString) {
      const invite = await this.validateInviteToken(inviteTokenString);
      if (invite) {
        invite.consume();
        this.saveInviteTokenToDb(invite);
        assignedRole = invite.targetRole;
        assignedStatus = 'active';
      }
    }

    const newUser = new User({
      uid: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      role: assignedRole,
      churchBranch: 'Lagoinha João Pessoa',
      status: assignedStatus,
      instrumentOrMinistry: instrumentOrMinistry?.trim()
    });

    this.saveUserToDb(newUser, pass);
    this.setCurrentUser(newUser);
    return Promise.resolve(newUser);
  }

  public async signInDemo(role: UserRole, displayName: string): Promise<User> {
    const demoUser = new User({
      uid: `demo-${role}-${Date.now()}`,
      email: `${role}@lagoinhajp.com.br`,
      displayName,
      role,
      churchBranch: 'Lagoinha João Pessoa',
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

  public async listPendingUsers(): Promise<User[]> {
    const users = this.getStoredUsers();
    return Promise.resolve(
      users
        .filter((u) => u.status === 'pending' || u.role === 'pending')
        .map((u) => new User(u))
    );
  }

  public async listAllUsers(): Promise<User[]> {
    const users = this.getStoredUsers();
    return Promise.resolve(users.map((u) => new User(u)));
  }

  public async approveUser(uid: string, assignedRole: UserRole, adminUid: string): Promise<User> {
    const users = this.getStoredUsers();
    const idx = users.findIndex((u) => u.uid === uid);
    if (idx === -1) {
      throw new Error(`Usuário não encontrado: ${uid}`);
    }

    const record = users[idx]!;
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

  public async rejectUser(uid: string, _adminUid: string): Promise<void> {
    const users = this.getStoredUsers().filter((u) => u.uid !== uid);
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
    return Promise.resolve();
  }

  public async updateUserRole(uid: string, newRole: UserRole, _adminUid: string): Promise<User> {
    const users = this.getStoredUsers();
    const idx = users.findIndex((u) => u.uid === uid);
    if (idx === -1) {
      throw new Error(`Usuário não encontrado: ${uid}`);
    }

    const record = users[idx]!;
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
    const randPart = Math.random().toString(36).substring(2, 8);
    const tokenStr = `lagoinha-${props.targetRole}-${randPart}`;
    const expiresAt = props.expiresHours
      ? new Date(Date.now() + props.expiresHours * 3600 * 1000).toISOString()
      : null;

    const token = new InviteToken({
      id: `inv-${Date.now()}`,
      token: tokenStr,
      targetRole: props.targetRole,
      churchBranch: 'Lagoinha João Pessoa',
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

  private saveUserToDb(user: User, password?: string): void {
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
        status: user.status,
        instrumentOrMinistry: user.instrumentOrMinistry,
        approvedBy: user.approvedBy,
        approvedAt: user.approvedAt,
        createdAt: user.createdAt,
        passwordHash: password ? btoa(password) : undefined
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
      const parsed = JSON.parse(data);
      return parsed.map((item: any) => new InviteToken(item));
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
