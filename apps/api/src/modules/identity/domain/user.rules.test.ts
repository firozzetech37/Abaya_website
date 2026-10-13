import { describe, expect, it } from 'vitest';
import { assertRoleChangeAllowed, isStaff, normaliseRoles } from './user.rules';

describe('role changes', () => {
  const base = { actorUserId: 'admin', targetUserId: 'other', superAdminCount: 2 };

  it('allows ordinary role changes', () => {
    expect(() => assertRoleChangeAllowed({ ...base, before: ['CUSTOMER'], after: ['DESIGNER'] })).not.toThrow();
  });

  it('never removes the last SUPER_ADMIN', () => {
    expect(() =>
      assertRoleChangeAllowed({ ...base, before: ['SUPER_ADMIN'], after: ['SUPPORT'], superAdminCount: 1 }),
    ).toThrow(/At least one SUPER_ADMIN/);
  });

  it('stops a super admin demoting themselves', () => {
    expect(() =>
      assertRoleChangeAllowed({ ...base, targetUserId: 'admin', before: ['SUPER_ADMIN'], after: ['CUSTOMER'] }),
    ).toThrow(/your own/);
  });

  it('normalises and classifies roles', () => {
    expect(normaliseRoles(['QC', 'CUSTOMER', 'QC'])).toEqual(['CUSTOMER', 'QC']);
    expect(isStaff(['CUSTOMER'])).toBe(false);
    expect(isStaff(['CUSTOMER', 'SUPPORT'])).toBe(true);
    expect(isStaff(['MAKER'])).toBe(true); // tailors are workshop staff
  });
});

describe('staff invites', () => {
  it('adds the invited roles to what the person already has', async () => {
    const { withInvitedRoles, inviteEmailKey } = await import('./user.rules');
    expect(withInvitedRoles(['CUSTOMER'], ['CUTTER'])).toEqual(['CUSTOMER', 'CUTTER']);
    expect(withInvitedRoles(['CUSTOMER', 'QC'], ['QC', 'FINISHER', 'CUSTOMER'])).toEqual(['CUSTOMER', 'FINISHER', 'QC']);
    expect(inviteEmailKey('  Zainab@Example.COM ')).toBe('zainab@example.com');
  });
});
