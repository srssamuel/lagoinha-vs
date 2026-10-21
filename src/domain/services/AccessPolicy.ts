import { MemberRole, Membership } from '../entities/Membership';

/**
 * Regras de permissão da spec-banco-online (seção 4) como funções puras.
 * O cliente usa para EXIBIR o que a pessoa pode fazer; quem decide é o servidor (firestore.rules, F1).
 */

/** Hierarquia usada para "convidar/promover até": quanto maior, mais poder. */
const ROLE_RANK: Record<MemberRole, number> = {
  musician: 0,
  sound_tech: 1,
  leader: 2,
  admin: 3
};

function isActiveIn(actor: Membership | null | undefined, churchId: string): actor is Membership {
  return !!actor && actor.isActive && actor.churchId === churchId;
}

/** I2: só membro ativo da própria igreja lê biblioteca e setlists dela. */
export function canReadChurch(actor: Membership | null | undefined, churchId: string): boolean {
  return isActiveIn(actor, churchId);
}

export function canUploadToLibrary(actor: Membership | null | undefined, churchId: string): boolean {
  return isActiveIn(actor, churchId) && ROLE_RANK[actor.role] >= ROLE_RANK.sound_tech;
}

export function canEditSetlist(actor: Membership | null | undefined, churchId: string): boolean {
  return isActiveIn(actor, churchId) && ROLE_RANK[actor.role] >= ROLE_RANK.leader;
}

/** Aprovar ou rejeitar quem pediu para entrar: só admin da igreja (tabela da seção 4; líder apenas convida). */
export function canApproveMembers(actor: Membership | null | undefined, churchId: string): boolean {
  return isActiveIn(actor, churchId) && actor.role === 'admin';
}

/** Líder convida até técnico de som; admin convida até líder. Admin só nasce por outro admin, fora de convite. */
export function canInviteWithRole(
  actor: Membership | null | undefined,
  churchId: string,
  targetRole: MemberRole
): boolean {
  if (!isActiveIn(actor, churchId)) return false;
  if (actor.role === 'admin') return ROLE_RANK[targetRole] <= ROLE_RANK.leader;
  if (actor.role === 'leader') return ROLE_RANK[targetRole] <= ROLE_RANK.sound_tech;
  return false;
}

/**
 * I1: ninguém muda o próprio papel. Admin troca papéis de outros na mesma igreja;
 * dar ou tirar o papel de admin também é só de admin.
 */
export function canChangeRole(
  actor: Membership | null | undefined,
  target: Membership,
  newRole: MemberRole
): boolean {
  if (!isActiveIn(actor, target.churchId)) return false;
  if (actor.uid === target.uid) return false;
  return actor.role === 'admin' && newRole in ROLE_RANK;
}

// --- Direitos de distribuição (seção 3, rightsClass) ---

export type RightsClass = 'own' | 'licensed_redistributable' | 'church_purchased' | 'unknown';

export interface LicenseRef {
  holder: string;
  documentId: string;
  scope: string;
  validUntil?: string;
}

/** I4: o catálogo global só aceita material próprio ou licenciado para redistribuição, com documento. */
export function isCatalogEligible(rightsClass: RightsClass, licenseRef: LicenseRef | undefined): boolean {
  if (rightsClass !== 'own' && rightsClass !== 'licensed_redistributable') return false;
  return !!licenseRef && licenseRef.holder.trim() !== '' && licenseRef.documentId.trim() !== '';
}
