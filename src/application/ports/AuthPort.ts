import { User, UserRole } from '../../domain/entities/User';
import { MembershipPort } from './MembershipPort';

/**
 * Só identidade (spec-banco-online, seção 8): quem é a pessoa logada.
 * Membros, papéis e convites ficam em MembershipPort.
 */
export interface AuthPort {
  signInWithGoogle(): Promise<User>;
  signInWithEmail(email: string, pass: string): Promise<User>;
  registerWithEmail(
    email: string,
    pass: string,
    displayName: string,
    instrumentOrMinistry?: string,
    inviteTokenString?: string
  ): Promise<User>;
  signOut(): Promise<void>;
  getCurrentUser(): User | null;
  onAuthStateChanged(callback: (user: User | null) => void): () => void;
  /** Modo demonstração (usuários de exemplo e acesso direto). Sempre falso em produção sem VITE_DEMO_MODE. */
  isDemoMode(): boolean;
  /** Entra com um usuário de exemplo; lança erro fora do modo demonstração. */
  signInDemo(role: UserRole, displayName: string): Promise<User>;
}

/** Login + gestão de membros, para telas que fazem as duas coisas (tela de entrada com convite, App). */
export type AccountService = AuthPort & MembershipPort;
