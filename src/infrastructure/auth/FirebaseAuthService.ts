import { AuthPort } from '../../application/ports/AuthPort';
import { User, UserRole } from '../../domain/entities/User';

const STORAGE_KEY = 'lagoinha_vs_auth_user';

export class FirebaseAuthService implements AuthPort {
  private currentUser: User | null = null;
  private listeners: Set<(user: User | null) => void> = new Set();

  constructor() {
    this.loadPersistedUser();
  }

  private loadPersistedUser(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.currentUser = new User({
          uid: parsed.uid,
          email: parsed.email,
          displayName: parsed.displayName,
          photoURL: parsed.photoURL,
          role: parsed.role as UserRole,
          churchBranch: 'Lagoinha João Pessoa'
        });
      }
    } catch {
      this.currentUser = null;
    }
  }

  public async signInWithGoogle(): Promise<User> {
    // Simula autenticação com conta Google / Google Identity
    const googleUser = new User({
      uid: `google-${Date.now()}`,
      email: 'louvor@lagoinhajp.com.br',
      displayName: 'Ministro de Louvor',
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
      role: 'leader',
      churchBranch: 'Lagoinha João Pessoa'
    });

    this.setCurrentUser(googleUser);
    return Promise.resolve(googleUser);
  }

  public async signInWithEmail(email: string, _pass: string): Promise<User> {
    const isLeader = email.toLowerCase().includes('lider') || email.toLowerCase().includes('ministro') || email.toLowerCase().includes('leandro');

    const emailUser = new User({
      uid: `email-${Date.now()}`,
      email,
      displayName: email.split('@')[0] || 'Membro do Louvor',
      role: isLeader ? 'leader' : 'musician',
      churchBranch: 'Lagoinha João Pessoa'
    });

    this.setCurrentUser(emailUser);
    return Promise.resolve(emailUser);
  }

  public async signInDemo(role: UserRole, displayName: string): Promise<User> {
    const demoUser = new User({
      uid: `demo-${role}-${Date.now()}`,
      email: `${role}@lagoinhajp.com.br`,
      displayName,
      role,
      churchBranch: 'Lagoinha João Pessoa'
    });

    this.setCurrentUser(demoUser);
    return Promise.resolve(demoUser);
  }

  public async signOut(): Promise<void> {
    this.currentUser = null;
    localStorage.removeItem(STORAGE_KEY);
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

  private setCurrentUser(user: User): void {
    this.currentUser = user;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: user.role
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
