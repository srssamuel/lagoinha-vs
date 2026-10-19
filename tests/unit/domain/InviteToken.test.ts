import { describe, it, expect } from 'vitest';
import { InviteToken } from '../../../src/domain/entities/InviteToken';

describe('InviteToken Logic', () => {
  it('validates a fresh, active single-use token', () => {
    const token = new InviteToken({
      id: 'inv-1',
      token: 'tok-test-1',
      targetRole: 'musician',
      churchBranch: 'Lagoinha João Pessoa',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), // expira em 1 hora
      maxUses: 1,
      usedCount: 0,
      createdByUid: 'admin-leandro',
      createdByName: 'Leandro Machado'
    });

    expect(token.isValid()).toBe(true);
    expect(token.inviteUrl).toContain('?invite=tok-test-1');

    // Consome o token
    const success = token.consume();
    expect(success).toBe(true);
    expect(token.usedCount).toBe(1);
    expect(token.isActive).toBe(false);

    // Tentativa de reusar deve falhar
    expect(token.isValid()).toBe(false);
    expect(token.consume()).toBe(false);
  });

  it('rejects an expired token even if not used', () => {
    const expiredToken = new InviteToken({
      id: 'inv-2',
      token: 'tok-exp-2',
      targetRole: 'sound_tech',
      churchBranch: 'Lagoinha João Pessoa',
      expiresAt: new Date(Date.now() - 1000).toISOString(), // expirou há 1 segundo
      maxUses: 1,
      usedCount: 0,
      createdByUid: 'admin-leandro',
      createdByName: 'Leandro Machado'
    });

    expect(expiredToken.isValid()).toBe(false);
    expect(expiredToken.consume()).toBe(false);
  });

  it('supports multi-use token for band groups (e.g. maxUses = 10)', () => {
    const groupToken = new InviteToken({
      id: 'inv-3',
      token: 'tok-grp-3',
      targetRole: 'musician',
      churchBranch: 'Lagoinha João Pessoa',
      expiresAt: null, // sem expiração
      maxUses: 3,
      usedCount: 0,
      createdByUid: 'admin-leandro',
      createdByName: 'Leandro Machado'
    });

    expect(groupToken.consume()).toBe(true);
    expect(groupToken.consume()).toBe(true);
    expect(groupToken.isValid()).toBe(true);

    // 3o uso atinge o limite
    expect(groupToken.consume()).toBe(true);
    expect(groupToken.isValid()).toBe(false);
    expect(groupToken.consume()).toBe(false);
  });

  it('allows manual revocation by the administrator', () => {
    const token = new InviteToken({
      id: 'inv-4',
      token: 'tok-rev-4',
      targetRole: 'leader',
      churchBranch: 'Lagoinha João Pessoa',
      expiresAt: null,
      maxUses: 1,
      usedCount: 0,
      createdByUid: 'admin-leandro',
      createdByName: 'Leandro Machado'
    });

    expect(token.isValid()).toBe(true);
    token.revoke();
    expect(token.isValid()).toBe(false);
    expect(token.consume()).toBe(false);
  });
});
