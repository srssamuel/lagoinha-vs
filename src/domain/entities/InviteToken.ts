import { UserRole } from './User';

export interface InviteTokenProps {
  id: string;
  token: string;
  targetRole: UserRole;
  churchBranch: string;
  createdAt?: string;
  expiresAt: string | null; // ISO Date string or null for no expiry
  maxUses?: number;         // Default 1 (single use) or Infinity
  usedCount?: number;
  createdByUid: string;
  createdByName: string;
  isActive?: boolean;
}

export class InviteToken {
  public readonly id: string;
  public readonly token: string;
  public readonly targetRole: UserRole;
  public readonly churchBranch: string;
  public readonly createdAt: string;
  public readonly expiresAt: string | null;
  public readonly maxUses: number;
  public usedCount: number;
  public readonly createdByUid: string;
  public readonly createdByName: string;
  public isActive: boolean;

  constructor(props: InviteTokenProps) {
    this.id = props.id;
    this.token = props.token;
    this.targetRole = props.targetRole;
    this.churchBranch = props.churchBranch || 'Lagoinha João Pessoa';
    this.createdAt = props.createdAt || new Date().toISOString();
    this.expiresAt = props.expiresAt;
    this.maxUses = props.maxUses ?? 1;
    this.usedCount = props.usedCount ?? 0;
    this.createdByUid = props.createdByUid;
    this.createdByName = props.createdByName;
    this.isActive = props.isActive ?? true;
  }

  public isValid(): boolean {
    if (!this.isActive) return false;
    if (this.usedCount >= this.maxUses) return false;
    if (this.expiresAt) {
      const now = new Date().getTime();
      const expiry = new Date(this.expiresAt).getTime();
      if (now > expiry) return false;
    }
    return true;
  }

  public consume(): boolean {
    if (!this.isValid()) return false;
    this.usedCount += 1;
    if (this.usedCount >= this.maxUses) {
      this.isActive = false;
    }
    return true;
  }

  public revoke(): void {
    this.isActive = false;
  }

  public get inviteUrl(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lagoinha-vs-jp.web.app';
    return `${origin}/?invite=${this.token}`;
  }
}
