export type UserRole = 'admin' | 'leader' | 'sound_tech' | 'musician' | 'pending';
export type UserStatus = 'active' | 'pending' | 'suspended';

export interface UserProps {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  churchBranch: string;
  churchId?: string;
  status?: UserStatus;
  instrumentOrMinistry?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt?: string;
}

/** Quem abre a biblioteca pública sem login: toca e prepara offline o que foi publicado, sem nenhum papel. */
export const VISITOR_UID = 'visitante';

export class User {
  public readonly uid: string;
  public readonly email: string;
  public readonly displayName: string;
  public readonly photoURL?: string;
  public role: UserRole;
  public readonly churchBranch: string;
  public readonly churchId: string;
  public status: UserStatus;
  public readonly instrumentOrMinistry?: string;
  public approvedBy?: string;
  public approvedAt?: string;
  public readonly createdAt: string;

  constructor(props: UserProps) {
    this.uid = props.uid;
    this.email = props.email;
    this.displayName = props.displayName;
    this.photoURL = props.photoURL;
    this.role = props.role;
    this.churchBranch = props.churchBranch || 'Lagoinha João Pessoa';
    this.churchId = props.churchId || 'lagoinha-jp';
    this.status = props.status || (props.role === 'pending' ? 'pending' : 'active');
    this.instrumentOrMinistry = props.instrumentOrMinistry;
    this.approvedBy = props.approvedBy;
    this.approvedAt = props.approvedAt;
    this.createdAt = props.createdAt || new Date().toISOString();
  }

  /** Visitante da biblioteca pública: sem igreja, sem permissão de envio, setlist só no aparelho. */
  public static visitor(): User {
    return new User({
      uid: VISITOR_UID,
      email: '',
      displayName: 'Visitante',
      role: 'musician',
      churchBranch: 'Biblioteca pública',
      churchId: VISITOR_UID,
      status: 'active'
    });
  }

  public get isVisitor(): boolean {
    return this.uid === VISITOR_UID;
  }

  public belongsToChurch(targetChurchId: string): boolean {
    return this.churchId === targetChurchId;
  }

  public canManageUser(targetUser: User): boolean {
    return this.isAdmin && this.isActive && this.belongsToChurch(targetUser.churchId);
  }

  public get isAdmin(): boolean {
    return this.role === 'admin';
  }

  public get canApproveUsers(): boolean {
    return this.role === 'admin';
  }

  public get canGenerateInviteLinks(): boolean {
    return this.role === 'admin' || this.role === 'leader';
  }

  public get canConfigureStorage(): boolean {
    return this.role === 'admin';
  }

  public get canUploadVS(): boolean {
    if (this.status !== 'active') return false;
    return this.role === 'admin' || this.role === 'leader' || this.role === 'sound_tech';
  }

  public get canEditSetlist(): boolean {
    if (this.status !== 'active') return false;
    return this.role === 'admin' || this.role === 'leader';
  }

  public get isActive(): boolean {
    return this.status === 'active';
  }

  public get isPending(): boolean {
    return this.status === 'pending' || this.role === 'pending';
  }

  public approve(adminUid: string, assignedRole: UserRole): void {
    this.status = 'active';
    this.role = assignedRole;
    this.approvedBy = adminUid;
    this.approvedAt = new Date().toISOString();
  }

  public suspend(): void {
    this.status = 'suspended';
  }
}
