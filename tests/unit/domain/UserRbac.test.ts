import { describe, it, expect } from 'vitest';
import { User } from '../../../src/domain/entities/User';

describe('User RBAC & Membership Logic', () => {
  it('gives Admin (Leandro Machado) full permissions to manage, approve users, and configure storage', () => {
    const admin = new User({
      uid: 'admin-leandro',
      email: 'leandro@lagoinhajp.com.br',
      displayName: 'Leandro Machado',
      role: 'admin',
      churchBranch: 'Lagoinha João Pessoa',
      status: 'active'
    });

    expect(admin.isAdmin).toBe(true);
    expect(admin.canApproveUsers).toBe(true);
    expect(admin.canGenerateInviteLinks).toBe(true);
    expect(admin.canConfigureStorage).toBe(true);
    expect(admin.canUploadVS).toBe(true);
    expect(admin.canEditSetlist).toBe(true);
    expect(admin.isActive).toBe(true);
    expect(admin.isPending).toBe(false);
  });

  it('allows Leader to upload and edit setlist, but NOT approve users or configure cloud storage', () => {
    const leader = new User({
      uid: 'leader-1',
      email: 'ministro@lagoinhajp.com.br',
      displayName: 'Ministro de Louvor',
      role: 'leader',
      churchBranch: 'Lagoinha João Pessoa',
      status: 'active'
    });

    expect(leader.isAdmin).toBe(false);
    expect(leader.canApproveUsers).toBe(false);
    expect(leader.canGenerateInviteLinks).toBe(true);
    expect(leader.canConfigureStorage).toBe(false);
    expect(leader.canUploadVS).toBe(true);
    expect(leader.canEditSetlist).toBe(true);
  });

  it('allows Sound Tech to upload VS and manage mixer, but NOT approve users or edit setlist', () => {
    const soundTech = new User({
      uid: 'tech-1',
      email: 'audio@lagoinhajp.com.br',
      displayName: 'Técnico de Som FOH',
      role: 'sound_tech',
      churchBranch: 'Lagoinha João Pessoa',
      status: 'active'
    });

    expect(soundTech.isAdmin).toBe(false);
    expect(soundTech.canApproveUsers).toBe(false);
    expect(soundTech.canUploadVS).toBe(true);
    expect(soundTech.canEditSetlist).toBe(false);
  });

  it('limits Musician to read-only access (no upload, no setlist editing, no user management)', () => {
    const musician = new User({
      uid: 'musician-1',
      email: 'batera@lagoinhajp.com.br',
      displayName: 'Baterista',
      role: 'musician',
      churchBranch: 'Lagoinha João Pessoa',
      status: 'active'
    });

    expect(musician.isAdmin).toBe(false);
    expect(musician.canApproveUsers).toBe(false);
    expect(musician.canUploadVS).toBe(false);
    expect(musician.canEditSetlist).toBe(false);
    expect(musician.isActive).toBe(true);
  });

  it('blocks all actions for Pending user until approved by Admin', () => {
    const pendingUser = new User({
      uid: 'pending-1',
      email: 'novato@lagoinhajp.com.br',
      displayName: 'Novo Integrante',
      role: 'pending',
      churchBranch: 'Lagoinha João Pessoa',
      status: 'pending',
      instrumentOrMinistry: 'Guitarra'
    });

    expect(pendingUser.isPending).toBe(true);
    expect(pendingUser.isActive).toBe(false);
    expect(pendingUser.canUploadVS).toBe(false);
    expect(pendingUser.canEditSetlist).toBe(false);

    // Admin aprova o usuário como Músico
    pendingUser.approve('admin-leandro', 'musician');

    expect(pendingUser.isPending).toBe(false);
    expect(pendingUser.isActive).toBe(true);
    expect(pendingUser.role).toBe('musician');
    expect(pendingUser.approvedBy).toBe('admin-leandro');
    expect(pendingUser.approvedAt).toBeDefined();
  });
});
