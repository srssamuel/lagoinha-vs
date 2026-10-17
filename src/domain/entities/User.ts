export type UserRole = 'leader' | 'musician' | 'sound_tech';

export interface UserProps {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  churchBranch: string;
}

export class User {
  public readonly uid: string;
  public readonly email: string;
  public readonly displayName: string;
  public readonly photoURL?: string;
  public readonly role: UserRole;
  public readonly churchBranch: string;

  constructor(props: UserProps) {
    this.uid = props.uid;
    this.email = props.email;
    this.displayName = props.displayName;
    this.photoURL = props.photoURL;
    this.role = props.role;
    this.churchBranch = props.churchBranch;
  }

  public get canUploadVS(): boolean {
    return this.role === 'leader' || this.role === 'sound_tech';
  }

  public get canEditSetlist(): boolean {
    return this.role === 'leader';
  }
}
