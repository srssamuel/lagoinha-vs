import { User, UserRole } from '../../domain/entities/User';
import { InviteToken } from '../../domain/entities/InviteToken';

export interface CreateInviteProps {
  targetRole: UserRole;
  expiresHours?: number; // e.g. 24, 168 (7 days), or undefined for no expiry
  maxUses?: number;      // e.g. 1 (single-use) or undefined (Infinity)
  adminUser: User;
}

/**
 * Operações de banco sobre os membros de uma igreja (aprovar, papéis, convites).
 * Local: LocalAuthAdapter. Produção (F2): FirestoreMembershipAdapter.
 */
export interface MembershipPort {
  listPendingUsers(churchId?: string): Promise<User[]>;
  listAllUsers(churchId?: string): Promise<User[]>;
  approveUser(uid: string, assignedRole: UserRole, adminUid: string): Promise<User>;
  rejectUser(uid: string, adminUid: string): Promise<void>;
  updateUserRole(uid: string, newRole: UserRole, adminUid: string): Promise<User>;

  createInviteLink(props: CreateInviteProps): Promise<InviteToken>;
  listInviteTokens(): Promise<InviteToken[]>;
  revokeInviteToken(tokenId: string): Promise<void>;
  validateInviteToken(tokenString: string): Promise<InviteToken | null>;
}
