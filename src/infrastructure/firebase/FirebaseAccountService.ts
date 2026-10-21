import {
  Auth,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  DocumentData
} from 'firebase/firestore';
import { AuthPort } from '../../application/ports/AuthPort';
import { CreateInviteProps, MembershipPort } from '../../application/ports/MembershipPort';
import { InviteToken } from '../../domain/entities/InviteToken';
import { MemberRole } from '../../domain/entities/Membership';
import { User, UserRole, UserStatus } from '../../domain/entities/User';

const CHURCH_ID = /^[a-z0-9-]{1,64}$/;
const MEMBER_ROLES: MemberRole[] = ['admin', 'leader', 'sound_tech', 'musician'];
/** As regras aceitam no máximo 30 dias; a folga cobre relógio do aparelho adiantado. */
const MAX_INVITE_MS = 30 * 24 * 3600 * 1000 - 10 * 60 * 1000;
const CHURCH_NAMES: Record<string, string> = { 'lagoinha-jp': 'Lagoinha João Pessoa' };

async function sha256HexOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomInviteSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Link de convite = `{igreja}.{segredo}`; o documento do convite é guardado pelo sha256 do link inteiro. */
export function parseInviteToken(token: string): { churchId: string; token: string } | null {
  const clean = token.trim();
  const dot = clean.indexOf('.');
  if (dot <= 0) return null;
  const churchId = clean.slice(0, dot);
  if (!CHURCH_ID.test(churchId) || clean.length - dot - 1 < 16) return null;
  return { churchId, token: clean };
}

function isoOf(value: unknown): string | undefined {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return typeof value === 'string' ? value : undefined;
}

function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === 'string' && (MEMBER_ROLES as string[]).includes(value);
}

function memberToUser(uid: string, churchId: string, data: DocumentData, email = ''): User {
  const status = (['active', 'pending', 'suspended'].includes(data.status) ? data.status : 'pending') as UserStatus;
  const role: UserRole = status === 'pending' || !isMemberRole(data.role) ? 'pending' : data.role;
  return new User({
    uid,
    email,
    displayName: typeof data.displayName === 'string' && data.displayName ? data.displayName : 'Sem nome',
    role,
    status,
    churchId,
    churchBranch: CHURCH_NAMES[churchId] ?? churchId,
    instrumentOrMinistry: typeof data.instrument === 'string' ? data.instrument : undefined,
    approvedBy: typeof data.approvedBy === 'string' ? data.approvedBy : undefined,
    approvedAt: isoOf(data.approvedAt),
    createdAt: isoOf(data.createdAt)
  });
}

export interface FirebaseAccountOptions {
  /** Igreja usada quando a pessoa ainda não escolheu nenhuma (users/{uid}.primaryChurchId). */
  defaultChurchId?: string;
  /** Convite vindo da URL (?invite=...): resgatado no primeiro login de quem ainda não é membro. */
  pendingInviteToken?: string | null;
  /** Onde lembrar o último papel conhecido para abrir o app sem internet (padrão: localStorage; null desliga). */
  memberStorage?: MemberStorage | null;
}

/** Último membro lido com sucesso: só serve para reabrir o app SEM REDE; online o Firestore sempre manda e as regras decidem. */
interface RememberedMember {
  churchId: string;
  role: string;
  status: string;
  displayName: string;
  instrument?: string;
}

const REMEMBERED_PREFIX = 'lvs.member.';

type MemberStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultMemberStorage(): MemberStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isOfflineError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'unavailable';
}

/**
 * Login (Firebase Auth) e membros (churches/{id}/members) no Firestore.
 * O login Google pede só perfil e e-mail: o acesso ao Drive não faz parte do app (fica no migrador).
 * Papel e status vêm sempre do documento de membro; quem decide o que pode é o servidor (firestore.rules).
 */
export class FirebaseAccountService implements AuthPort, MembershipPort {
  private currentUser: User | null = null;
  private readonly listeners = new Set<(user: User | null) => void>();
  private readonly defaultChurchId: string;
  private pendingInvite: string | null;
  private refreshing: Promise<void> = Promise.resolve();
  private readonly memberStorage: MemberStorage | null;

  constructor(
    private readonly auth: Auth,
    private readonly db: Firestore,
    options: FirebaseAccountOptions = {}
  ) {
    this.defaultChurchId = options.defaultChurchId ?? 'lagoinha-jp';
    this.pendingInvite = options.pendingInviteToken ?? null;
    this.memberStorage = options.memberStorage === undefined ? defaultMemberStorage() : options.memberStorage;
    onAuthStateChanged(this.auth, (fbUser) => {
      this.refreshing = this.refresh(fbUser).catch(() => {
        this.currentUser = null;
        this.notify();
      });
    });
  }

  /** Espera a leitura do membro depois de uma mudança de login (útil nos testes e após o resgate de convite). */
  public async whenReady(): Promise<void> {
    await this.auth.authStateReady();
    await this.refreshing;
  }

  public isDemoMode(): boolean {
    return false;
  }

  public async signInDemo(): Promise<User> {
    throw new Error('Acesso de demonstração desativado nesta instalação.');
  }

  public async signInWithGoogle(): Promise<User> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(this.auth, provider);
    return this.afterSignIn(cred.user);
  }

  public async signInWithEmail(email: string, pass: string): Promise<User> {
    try {
      const cred = await signInWithEmailAndPassword(this.auth, email.trim(), pass);
      return await this.afterSignIn(cred.user);
    } catch (err) {
      throw new Error(this.friendlyAuthError(err));
    }
  }

  public async registerWithEmail(
    email: string,
    pass: string,
    displayName: string,
    instrumentOrMinistry?: string,
    inviteTokenString?: string
  ): Promise<User> {
    if (pass.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    if (inviteTokenString) this.pendingInvite = inviteTokenString;
    let fbUser: FirebaseUser;
    try {
      fbUser = (await createUserWithEmailAndPassword(this.auth, email.trim(), pass)).user;
    } catch (err) {
      throw new Error(this.friendlyAuthError(err));
    }
    const name = displayName.trim().slice(0, 100);
    if (name) await updateProfile(fbUser, { displayName: name });
    return this.afterSignIn(fbUser, instrumentOrMinistry?.trim().slice(0, 100));
  }

  public async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public onAuthStateChanged(callback: (user: User | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentUser);
    return () => this.listeners.delete(callback);
  }

  // --- membros ---

  private churchOf(churchId?: string): string {
    const id = churchId ?? this.currentUser?.churchId ?? this.defaultChurchId;
    if (!CHURCH_ID.test(id)) throw new Error('Igreja inválida.');
    return id;
  }

  private requireUid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Entre com sua conta primeiro.');
    return uid;
  }

  public async listPendingUsers(churchId?: string): Promise<User[]> {
    const church = this.churchOf(churchId);
    const snap = await getDocs(query(collection(this.db, 'churches', church, 'members'), where('status', '==', 'pending')));
    return snap.docs.map((d) => memberToUser(d.id, church, d.data()));
  }

  public async listAllUsers(churchId?: string): Promise<User[]> {
    const church = this.churchOf(churchId);
    const snap = await getDocs(collection(this.db, 'churches', church, 'members'));
    return snap.docs.map((d) => memberToUser(d.id, church, d.data()));
  }

  public async approveUser(uid: string, assignedRole: UserRole, adminUid: string): Promise<User> {
    if (!isMemberRole(assignedRole)) throw new Error('Escolha um papel para aprovar.');
    if (adminUid !== this.requireUid()) throw new Error('Aprovação só pela conta logada.');
    const church = this.churchOf();
    const ref = doc(this.db, 'churches', church, 'members', uid);
    await updateDoc(ref, { role: assignedRole, status: 'active', approvedBy: adminUid, approvedAt: serverTimestamp() });
    return memberToUser(uid, church, (await getDoc(ref)).data() ?? {});
  }

  public async rejectUser(uid: string): Promise<void> {
    await deleteDoc(doc(this.db, 'churches', this.churchOf(), 'members', uid));
  }

  public async updateUserRole(uid: string, newRole: UserRole, adminUid: string): Promise<User> {
    if (adminUid !== this.requireUid()) throw new Error('Alteração só pela conta logada.');
    const church = this.churchOf();
    const ref = doc(this.db, 'churches', church, 'members', uid);
    const current = (await getDoc(ref)).data();
    if (!current) throw new Error(`Usuário não encontrado: ${uid}`);
    const patch: DocumentData =
      newRole === 'pending'
        ? { status: 'pending' }
        : { role: newRole, status: current.status === 'pending' ? 'active' : current.status };
    if (patch.status === 'active' && current.status === 'pending') {
      patch.approvedBy = adminUid;
      patch.approvedAt = serverTimestamp();
    }
    await updateDoc(ref, patch);
    return memberToUser(uid, church, (await getDoc(ref)).data() ?? {});
  }

  // --- convites ---

  public async createInviteLink(props: CreateInviteProps): Promise<InviteToken> {
    if (!isMemberRole(props.targetRole)) throw new Error('Papel de convite inválido.');
    const uid = this.requireUid();
    const church = this.churchOf(props.adminUser.churchId);
    const token = `${church}.${randomInviteSecret()}`;
    const inviteId = await sha256HexOf(token);
    const lifetimeMs = Math.min((props.expiresHours ?? 24 * 30) * 3600 * 1000, MAX_INVITE_MS);
    const expiresAt = Timestamp.fromMillis(Date.now() + lifetimeMs);
    const maxUses = Math.max(1, Math.min(Number.isFinite(props.maxUses ?? 100) ? (props.maxUses ?? 100) : 100, 100));
    await setDoc(doc(this.db, 'churches', church, 'invites', inviteId), {
      targetRole: props.targetRole,
      expiresAt,
      maxUses,
      usedCount: 0,
      createdBy: uid,
      revoked: false,
      createdAt: serverTimestamp()
    });
    return new InviteToken({
      id: inviteId,
      token,
      targetRole: props.targetRole,
      churchId: church,
      churchBranch: CHURCH_NAMES[church] ?? church,
      expiresAt: expiresAt.toDate().toISOString(),
      maxUses,
      usedCount: 0,
      createdByUid: uid,
      createdByName: props.adminUser.displayName
    });
  }

  /** O link só aparece na criação: o banco guarda apenas o hash dele. */
  public async listInviteTokens(): Promise<InviteToken[]> {
    const church = this.churchOf();
    const snap = await getDocs(collection(this.db, 'churches', church, 'invites'));
    return snap.docs.map((d) => this.inviteFrom(d.id, '', church, d.data()));
  }

  public async revokeInviteToken(tokenId: string): Promise<void> {
    await updateDoc(doc(this.db, 'churches', this.churchOf(), 'invites', tokenId), { revoked: true });
  }

  public async validateInviteToken(tokenString: string): Promise<InviteToken | null> {
    const parsed = parseInviteToken(tokenString);
    if (!parsed) return null;
    this.pendingInvite = parsed.token;
    if (!this.auth.currentUser) return null; // as regras só deixam ler convite logado
    const snap = await getDoc(doc(this.db, 'churches', parsed.churchId, 'invites', await sha256HexOf(parsed.token)));
    if (!snap.exists()) return null;
    const invite = this.inviteFrom(snap.id, parsed.token, parsed.churchId, snap.data());
    return invite.isValid() ? invite : null;
  }

  private inviteFrom(id: string, token: string, churchId: string, data: DocumentData): InviteToken {
    return new InviteToken({
      id,
      token,
      targetRole: isMemberRole(data.targetRole) ? data.targetRole : 'musician',
      churchId,
      churchBranch: CHURCH_NAMES[churchId] ?? churchId,
      createdAt: isoOf(data.createdAt),
      expiresAt: isoOf(data.expiresAt) ?? null,
      maxUses: typeof data.maxUses === 'number' ? data.maxUses : 1,
      usedCount: typeof data.usedCount === 'number' ? data.usedCount : 0,
      createdByUid: typeof data.createdBy === 'string' ? data.createdBy : '',
      createdByName: '',
      isActive: data.revoked !== true
    });
  }

  // --- internos ---

  private async afterSignIn(fbUser: FirebaseUser, instrument?: string): Promise<User> {
    await this.ensureProfile(fbUser);
    if (this.pendingInvite) await this.redeemPendingInvite(fbUser, instrument);
    await this.refresh(fbUser);
    if (!this.currentUser) throw new Error('Não foi possível carregar sua conta.');
    return this.currentUser;
  }

  private async ensureProfile(fbUser: FirebaseUser): Promise<void> {
    const ref = doc(this.db, 'users', fbUser.uid);
    if ((await getDoc(ref)).exists()) return;
    const profile: DocumentData = { primaryChurchId: this.defaultChurchId, createdAt: serverTimestamp() };
    if (fbUser.displayName) profile.displayName = fbUser.displayName.slice(0, 100);
    if (fbUser.photoURL) profile.photoURL = fbUser.photoURL;
    await setDoc(ref, profile);
  }

  /** Entra pelo convite (I1, I3): membro pendente + consumo do convite no mesmo lote. */
  private async redeemPendingInvite(fbUser: FirebaseUser, instrument?: string): Promise<void> {
    const parsed = parseInviteToken(this.pendingInvite ?? '');
    this.pendingInvite = null;
    if (!parsed) return;
    const memberRef = doc(this.db, 'churches', parsed.churchId, 'members', fbUser.uid);
    if ((await getDoc(memberRef)).exists()) return;
    const inviteId = await sha256HexOf(parsed.token);
    const inviteRef = doc(this.db, 'churches', parsed.churchId, 'invites', inviteId);
    const invite = await getDoc(inviteRef);
    if (!invite.exists()) throw new Error('Convite inválido ou expirado.');
    const member: DocumentData = {
      role: invite.data().targetRole,
      status: 'pending',
      inviteId,
      displayName: (fbUser.displayName || 'Sem nome').slice(0, 100),
      createdAt: serverTimestamp()
    };
    if (instrument) member.instrument = instrument;
    const batch = writeBatch(this.db);
    batch.set(memberRef, member);
    batch.update(inviteRef, { usedCount: increment(1) });
    batch.set(doc(this.db, 'users', fbUser.uid), { primaryChurchId: parsed.churchId }, { merge: true });
    try {
      await batch.commit();
    } catch {
      throw new Error('Convite inválido, expirado ou já usado.');
    }
  }

  private async refresh(fbUser: FirebaseUser | null): Promise<void> {
    if (!fbUser) {
      this.currentUser = null;
      this.notify();
      return;
    }
    let church: string;
    let member: DocumentData | undefined;
    try {
      const profile = (await getDoc(doc(this.db, 'users', fbUser.uid))).data();
      church =
        typeof profile?.primaryChurchId === 'string' && CHURCH_ID.test(profile.primaryChurchId)
          ? profile.primaryChurchId
          : this.defaultChurchId;
      member = (await getDoc(doc(this.db, 'churches', church, 'members', fbUser.uid))).data();
      this.remember(fbUser.uid, church, member);
    } catch (err) {
      // Sem rede (palco sem Wi-Fi): reabre com o último papel conhecido desta mesma conta. Só vale para
      // 'unavailable'; negação das regras ou outro erro continuam derrubando o login.
      const remembered = isOfflineError(err) ? this.recall(fbUser.uid) : null;
      if (!remembered) throw err;
      church = remembered.churchId;
      member = { role: remembered.role, status: remembered.status, displayName: remembered.displayName, instrument: remembered.instrument };
    }
    this.currentUser = member
      ? memberToUser(fbUser.uid, church, { displayName: fbUser.displayName, ...member }, fbUser.email ?? '')
      : new User({
          uid: fbUser.uid,
          email: fbUser.email ?? '',
          displayName: fbUser.displayName || 'Sem nome',
          photoURL: fbUser.photoURL ?? undefined,
          role: 'pending',
          status: 'pending',
          churchId: church,
          churchBranch: CHURCH_NAMES[church] ?? church
        });
    this.notify();
  }

  private remember(uid: string, churchId: string, member: DocumentData | undefined): void {
    if (!this.memberStorage) return;
    if (!member) {
      // Saiu da igreja (ou nunca entrou): não pode reabrir offline com o papel antigo.
      try {
        this.memberStorage.removeItem(`${REMEMBERED_PREFIX}${uid}`);
      } catch {
        // armazenamento bloqueado: nada a limpar
      }
      return;
    }
    const entry: RememberedMember = {
      churchId,
      role: String(member.role ?? ''),
      status: String(member.status ?? ''),
      displayName: String(member.displayName ?? ''),
      instrument: typeof member.instrument === 'string' ? member.instrument : undefined
    };
    try {
      this.memberStorage.setItem(`${REMEMBERED_PREFIX}${uid}`, JSON.stringify(entry));
    } catch {
      // armazenamento cheio ou bloqueado: o app só perde a abertura offline
    }
  }

  private recall(uid: string): RememberedMember | null {
    try {
      const raw = this.memberStorage?.getItem(`${REMEMBERED_PREFIX}${uid}`);
      const parsed = raw ? (JSON.parse(raw) as Partial<RememberedMember>) : null;
      if (!parsed || typeof parsed.churchId !== 'string' || !CHURCH_ID.test(parsed.churchId)) return null;
      return {
        churchId: parsed.churchId,
        role: String(parsed.role ?? ''),
        status: String(parsed.status ?? ''),
        displayName: String(parsed.displayName ?? ''),
        instrument: parsed.instrument
      };
    } catch {
      return null;
    }
  }

  private friendlyAuthError(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'auth/operation-not-allowed') return 'Login por e-mail não está habilitado. Use a conta Google.';
    if (code === 'auth/email-already-in-use') return 'Já existe uma conta com este e-mail.';
    if (code === 'auth/weak-password') return 'Senha fraca: use pelo menos 8 caracteres.';
    return 'Credenciais inválidas.';
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb(this.currentUser));
  }
}
