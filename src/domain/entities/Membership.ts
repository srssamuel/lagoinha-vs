import { User } from './User';

export type MemberRole = 'admin' | 'leader' | 'sound_tech' | 'musician';
export type MemberStatus = 'pending' | 'active' | 'suspended';

export interface MembershipProps {
  churchId: string;
  uid: string;
  role: MemberRole;
  status: MemberStatus;
  instrument?: string;
  approvedBy?: string;
  approvedAt?: string;
}

/**
 * Papel de uma pessoa DENTRO de uma igreja (spec-banco-online, seção 3: churches/{id}/members/{uid}).
 * Um usuário pode servir em duas igrejas com papéis diferentes; o papel não mora no User.
 */
export class Membership {
  public readonly churchId: string;
  public readonly uid: string;
  public readonly role: MemberRole;
  public readonly status: MemberStatus;
  public readonly instrument?: string;
  public readonly approvedBy?: string;
  public readonly approvedAt?: string;

  constructor(props: MembershipProps) {
    if (!props.churchId) throw new Error('Membership exige churchId.');
    if (!props.uid) throw new Error('Membership exige uid.');
    this.churchId = props.churchId;
    this.uid = props.uid;
    this.role = props.role;
    this.status = props.status;
    this.instrument = props.instrument;
    this.approvedBy = props.approvedBy;
    this.approvedAt = props.approvedAt;
  }

  public get isActive(): boolean {
    return this.status === 'active';
  }

  /**
   * Ponte da F0: o cadastro local ainda guarda papel e igreja no User.
   * Na F2 os membros passam a vir de churches/{id}/members e esta ponte sai.
   */
  public static fromLegacyUser(user: User): Membership {
    const pending = user.role === 'pending' || user.status === 'pending';
    return new Membership({
      churchId: user.churchId,
      uid: user.uid,
      role: user.role === 'pending' ? 'musician' : user.role,
      status: pending ? 'pending' : user.status,
      instrument: user.instrumentOrMinistry,
      approvedBy: user.approvedBy,
      approvedAt: user.approvedAt
    });
  }
}
