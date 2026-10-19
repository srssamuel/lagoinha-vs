import { User, UserRole } from '../../domain/entities/User';
import { InviteToken } from '../../domain/entities/InviteToken';

export interface CreateInviteProps {
  targetRole: UserRole;
  expiresHours?: number; // e.g. 24, 168 (7 days), or undefined for no expiry
  maxUses?: number;      // e.g. 1 (single-use) or undefined (Infinity)
  adminUser: User;
}

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

  // Gestão de Usuários (Painel do Administrador)
  listPendingUsers(): Promise<User[]>;
  listAllUsers(): Promise<User[]>;
  approveUser(uid: string, assignedRole: UserRole, adminUid: string): Promise<User>;
  rejectUser(uid: string, adminUid: string): Promise<void>;
  updateUserRole(uid: string, newRole: UserRole, adminUid: string): Promise<User>;

  // Links de Convite
  createInviteLink(props: CreateInviteProps): Promise<InviteToken>;
  listInviteTokens(): Promise<InviteToken[]>;
  revokeInviteToken(tokenId: string): Promise<void>;
  validateInviteToken(tokenString: string): Promise<InviteToken | null>;
}
