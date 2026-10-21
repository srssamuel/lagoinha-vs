import { describe, it, expect } from 'vitest';
import { Membership, MemberRole, MemberStatus } from '../../../src/domain/entities/Membership';
import { User } from '../../../src/domain/entities/User';
import {
  canApproveMembers,
  canChangeRole,
  canEditSetlist,
  canInviteWithRole,
  canReadChurch,
  canUploadToLibrary,
  isCatalogEligible
} from '../../../src/domain/services/AccessPolicy';

const member = (role: MemberRole, status: MemberStatus = 'active', churchId = 'igreja-a', uid = `${role}-uid`) =>
  new Membership({ churchId, uid, role, status });

describe('AccessPolicy (spec-banco-online, seção 4)', () => {
  it('músico não aprova membro, não convida e não edita setlist', () => {
    const musician = member('musician');
    expect(canApproveMembers(musician, 'igreja-a')).toBe(false);
    expect(canInviteWithRole(musician, 'igreja-a', 'musician')).toBe(false);
    expect(canEditSetlist(musician, 'igreja-a')).toBe(false);
    expect(canUploadToLibrary(musician, 'igreja-a')).toBe(false);
    expect(canReadChurch(musician, 'igreja-a')).toBe(true);
  });

  it('só admin ativo aprova membros; líder apenas convida', () => {
    expect(canApproveMembers(member('admin'), 'igreja-a')).toBe(true);
    expect(canApproveMembers(member('leader'), 'igreja-a')).toBe(false);
    expect(canApproveMembers(member('admin', 'pending'), 'igreja-a')).toBe(false);
    expect(canApproveMembers(member('admin', 'suspended'), 'igreja-a')).toBe(false);
  });

  it('I2: papel em uma igreja não vale em outra', () => {
    const adminA = member('admin');
    expect(canReadChurch(adminA, 'igreja-b')).toBe(false);
    expect(canApproveMembers(adminA, 'igreja-b')).toBe(false);
    expect(canEditSetlist(adminA, 'igreja-b')).toBe(false);
    expect(canUploadToLibrary(adminA, 'igreja-b')).toBe(false);
    expect(canReadChurch(null, 'igreja-a')).toBe(false);
  });

  it('convites: líder até técnico de som, admin até líder, ninguém convida admin', () => {
    const leader = member('leader');
    const admin = member('admin');
    expect(canInviteWithRole(leader, 'igreja-a', 'sound_tech')).toBe(true);
    expect(canInviteWithRole(leader, 'igreja-a', 'leader')).toBe(false);
    expect(canInviteWithRole(admin, 'igreja-a', 'leader')).toBe(true);
    expect(canInviteWithRole(admin, 'igreja-a', 'admin')).toBe(false);
  });

  it('I1: ninguém muda o próprio papel; só admin muda o dos outros', () => {
    const admin = member('admin', 'active', 'igreja-a', 'u-admin');
    const leader = member('leader', 'active', 'igreja-a', 'u-leader');
    const musician = member('musician', 'active', 'igreja-a', 'u-music');
    expect(canChangeRole(admin, admin, 'musician')).toBe(false);
    expect(canChangeRole(leader, leader, 'admin')).toBe(false);
    expect(canChangeRole(leader, musician, 'sound_tech')).toBe(false);
    expect(canChangeRole(admin, musician, 'leader')).toBe(true);
    expect(canChangeRole(admin, member('musician', 'active', 'igreja-b', 'u-b'), 'leader')).toBe(false);
  });

  it('upload na biblioteca: técnico de som, líder e admin; setlist: líder e admin', () => {
    expect(canUploadToLibrary(member('sound_tech'), 'igreja-a')).toBe(true);
    expect(canEditSetlist(member('sound_tech'), 'igreja-a')).toBe(false);
    expect(canEditSetlist(member('leader'), 'igreja-a')).toBe(true);
  });

  it('I4: catálogo global só aceita própria/licenciada com documento', () => {
    const license = { holder: 'Lagoinha', documentId: 'CTR-01', scope: 'todas as igrejas' };
    expect(isCatalogEligible('own', license)).toBe(true);
    expect(isCatalogEligible('licensed_redistributable', license)).toBe(true);
    expect(isCatalogEligible('own', undefined)).toBe(false);
    expect(isCatalogEligible('own', { ...license, documentId: '  ' })).toBe(false);
    expect(isCatalogEligible('church_purchased', license)).toBe(false);
    expect(isCatalogEligible('unknown', license)).toBe(false);
  });

  it('ponte do cadastro local: pendente vira membro pendente, nunca ativo', () => {
    const pending = new User({
      uid: 'p1',
      email: 'p@x.com',
      displayName: 'P',
      role: 'pending',
      churchBranch: 'Lagoinha JP',
      churchId: 'igreja-a'
    });
    const m = Membership.fromLegacyUser(pending);
    expect(m.status).toBe('pending');
    expect(m.role).toBe('musician');
    expect(canReadChurch(m, 'igreja-a')).toBe(false);
  });
});
