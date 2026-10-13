import { describe, expect, it, vi } from 'vitest';
import type { AuthProviderAdmin } from '../../../common/auth/auth.types';
import { IdentityService } from './identity.service';
import type {
  AddressRepository,
  ConsentRepository,
  StaffInviteRecord,
  StaffInviteRepository,
  UserRecord,
  UserRepository,
} from './ports/identity.repositories';

const record = (over: Partial<UserRecord>): UserRecord => ({
  id: 'u1',
  authUserId: 'user_abc',
  email: null,
  phone: null,
  name: null,
  roles: ['CUSTOMER'],
  isActive: true,
  lastActiveAt: null,
  deletedAt: null,
  createdAt: new Date(),
  ...over,
});

function setup(
  existing: UserRecord | null,
  profile = { email: 'clerk@example.com', phone: '+919876543210' },
  pendingInvite: StaffInviteRecord | null = null,
) {
  let created: UserRecord | null = null;
  const users = {
    findByAuthUserId: vi.fn().mockResolvedValue(existing),
    createCustomer: vi.fn().mockImplementation(async (i: { authUserId: string; email?: string; phone?: string }) => {
      created = record({ authUserId: i.authUserId, email: i.email ?? null, phone: i.phone ?? null });
      return created;
    }),
    // After accepting an invite the service re-reads the user; the fake returns the roles it was given.
    findById: vi.fn().mockImplementation(async () => (created ? { ...created, roles: accepted?.roles ?? created.roles } : null)),
    touchActive: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserRepository;
  let accepted: { roles: string[] } | null = null;
  const invites = {
    findPendingByEmail: vi.fn().mockResolvedValue(pendingInvite),
    accept: vi.fn().mockImplementation(async (_id: string, user: { roles: string[] }) => {
      accepted = user;
    }),
  } as unknown as StaffInviteRepository;
  const clerk: AuthProviderAdmin = { getProfile: vi.fn().mockResolvedValue(profile), deleteUser: vi.fn() };
  const service = new IdentityService(users, {} as AddressRepository, {} as ConsentRepository, clerk, invites);
  return { service, users, clerk, invites };
}

describe('IdentityService.resolve (Clerk login)', () => {
  it('loads an existing user without calling Clerk', async () => {
    const { service, clerk } = setup(record({ email: 'known@example.com' }));
    await expect(service.resolve({ sub: 'user_abc', aal: 'aal1' })).resolves.toMatchObject({ email: 'known@example.com' });
    expect(clerk.getProfile).not.toHaveBeenCalled();
  });

  it('records signed-in activity at most every 10 minutes', async () => {
    const stale = setup(record({ lastActiveAt: new Date(Date.now() - 11 * 60_000) }));
    await stale.service.resolve({ sub: 'user_abc', aal: 'aal1' });
    expect(stale.users.touchActive).toHaveBeenCalledWith('u1', expect.any(Date));

    const recent = setup(record({ lastActiveAt: new Date(Date.now() - 2 * 60_000) }));
    await recent.service.resolve({ sub: 'user_abc', aal: 'aal1' });
    expect(recent.users.touchActive).not.toHaveBeenCalled();
  });

  it('creates a CUSTOMER from Clerk’s profile on first login when the token has no email', async () => {
    const { service, users, clerk } = setup(null);
    const user = await service.resolve({ sub: 'user_new', aal: 'aal1' });
    expect(clerk.getProfile).toHaveBeenCalledWith('user_new');
    expect(users.createCustomer).toHaveBeenCalledWith({ authUserId: 'user_new', email: 'clerk@example.com', phone: '+919876543210' });
    expect(user).toMatchObject({ roles: ['CUSTOMER'] });
  });

  it('uses email/phone claims when the session token carries them', async () => {
    const { service, clerk, users } = setup(null);
    await service.resolve({ sub: 'user_claims', email: 'claim@example.com', aal: 'aal1' });
    expect(clerk.getProfile).not.toHaveBeenCalled();
    expect(users.createCustomer).toHaveBeenCalledWith({ authUserId: 'user_claims', email: 'claim@example.com', phone: undefined });
  });

  it('refuses deleted or blocked accounts', async () => {
    expect(await setup(record({ deletedAt: new Date() })).service.resolve({ sub: 'user_abc', aal: 'aal1' })).toBeNull();
    expect(await setup(record({ isActive: false })).service.resolve({ sub: 'user_abc', aal: 'aal1' })).toBeNull();
  });
});

describe('IdentityService.resolve (staff invited by email)', () => {
  const invite: StaffInviteRecord = {
    id: 'inv1',
    email: 'clerk@example.com',
    name: 'Rehana',
    roles: ['CUTTER'],
    status: 'PENDING',
    invitedBy: { id: 'admin1', name: null, email: 'boss@example.com' },
    acceptedUserId: null,
    createdAt: new Date(),
    acceptedAt: null,
  };

  it('grants the invited roles on the first sign-in with that email', async () => {
    const { service, invites } = setup(null, undefined, invite);
    const user = await service.resolve({ sub: 'user_cutter', aal: 'aal1' });
    expect(invites.findPendingByEmail).toHaveBeenCalledWith('clerk@example.com');
    expect(invites.accept).toHaveBeenCalledWith(
      'inv1',
      expect.objectContaining({ roles: ['CUSTOMER', 'CUTTER'], inviteName: 'Rehana' }),
      expect.objectContaining({ action: 'user.roles_changed' }),
    );
    expect(user).toMatchObject({ roles: ['CUSTOMER', 'CUTTER'] });
  });

  it('never looks for invites on later requests', async () => {
    const { service, invites } = setup(record({ email: 'clerk@example.com' }), undefined, invite);
    await service.resolve({ sub: 'user_abc', aal: 'aal1' });
    expect(invites.findPendingByEmail).not.toHaveBeenCalled();
  });
});
