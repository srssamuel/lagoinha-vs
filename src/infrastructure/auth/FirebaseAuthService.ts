import { AuthPort } from '../../application/ports/AuthPort';
import { User, UserRole } from '../../domain/entities/User';

const STORAGE_KEY = 'lagoinha_vs_auth_user';
const LOGGED_OUT_KEY = 'lagoinha_vs_logged_out';

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
        return;
      }

      const explicitlyLoggedOut = localStorage.getItem(LOGGED_OUT_KEY) === 'true';
      if (!explicitlyLoggedOut) {
        this.currentUser = new User({
          uid: 'default-leader-lagoinha',
          email: 'louvor@lagoinhajp.com.br',
          displayName: 'Leandro Machado',
          role: 'leader',
          churchBranch: 'Lagoinha João Pessoa'
        });
      }
    } catch {
      this.currentUser = null;
    }
  }

  public async signInWithGoogle(): Promise<User> {
    const googleUser = new User({
      uid: `google-${Date.now()}`,
      email: 'louvor@lagoinhajp.com.br',
      displayName: 'Ministro de Louvor (Google)',
      role: 'leader',
      churchBranch: 'Lagoinha João Pessoa'
    });

    this.setCurrentUser(googleUser);
    return Promise.resolve(googleUser);
  }

  public async signInWithEmail(email: string, _pass: string): Promise<User> {
    const isLeader =
      email.toLowerCase().includes('lider') ||
      email.toLowerCase().includes('ministro') ||
      email.toLowerCase().includes('leandro') ||
      email.toLowerCase().includes('louvor');

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
    try {
      localStorage.removeItem(STORAGE_KEY);
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

  private setCurrentUser(user: User): void {
    this.currentUser = user;
    try {
      localStorage.removeItem(LOGGED_OUT_KEY);
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
