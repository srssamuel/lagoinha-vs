import { User } from '../../domain/entities/User';

export interface AuthPort {
  signInWithGoogle(): Promise<User>;
  signInWithEmail(email: string, pass: string): Promise<User>;
  signOut(): Promise<void>;
  getCurrentUser(): User | null;
  onAuthStateChanged(callback: (user: User | null) => void): () => void;
}
