import { generateKeyPairSync } from 'node:crypto';
import { createTestApp, type TestContext, tokenFor, userWithRoles } from './helpers';

describe('Auth, roles and identity (e2e)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('GET /v1/health is public', async () => {
    const res = await ctx.http.get('/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('401 without a token, with a bad token, a forged token, or one from another website', async () => {
    await ctx.http.get('/v1/me').expect(401);
    const bad = await ctx.http.get('/v1/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    expect(bad.body.error.code).toBe('UNAUTHENTICATED');

    // Signed with a different key than Clerk's (CLERK_JWT_KEY).
    const original = process.env.E2E_CLERK_PRIVATE_KEY;
    process.env.E2E_CLERK_PRIVATE_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    const forged = await tokenFor('user_forged', 'x@example.com');
    process.env.E2E_CLERK_PRIVATE_KEY = original;
    await ctx.http.get('/v1/me').set('Authorization', `Bearer ${forged}`).expect(401);

    // Browser sessions carry azp; only our own web origins are accepted.
    const foreign = await tokenFor('user_foreign', 'y@example.com', 'aal1', { azp: 'https://evil.example' });
    await ctx.http.get('/v1/me').set('Authorization', `Bearer ${foreign}`).expect(401);
    const ours = await tokenFor('user_ours_web', 'z@example.com', 'aal1', { azp: 'http://localhost:3000' });
    await ctx.http.get('/v1/me').set('Authorization', `Bearer ${ours}`).expect(200);
  });

  it('creates a CUSTOMER on first login and returns the profile', async () => {
    const user = await userWithRoles(ctx, ['CUSTOMER']);
    const res = await ctx.http.get('/v1/me').set(user.auth).expect(200);
    expect(res.body).toMatchObject({ email: user.email, roles: ['CUSTOMER'], isStaff: false });
  });

  it('validates input with the contracts schemas (400)', async () => {
    const user = await userWithRoles(ctx, ['CUSTOMER']);
    const res = await ctx.http.patch('/v1/me').set(user.auth).send({ phone: '12345' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('manages addresses and keeps other users out (404)', async () => {
    const a = await userWithRoles(ctx, ['CUSTOMER']);
    const b = await userWithRoles(ctx, ['CUSTOMER']);
    const created = await ctx.http
      .post('/v1/me/addresses')
      .set(a.auth)
      .send({ fullName: 'Ayesha Khan', phone: '9876543210', line1: '4 Park Street', city: 'Kolkata', state: 'West Bengal', pincode: '700016' })
      .expect(201);
    expect(created.body.isDefault).toBe(true);
    await ctx.http.patch(`/v1/me/addresses/${created.body.id}`).set(b.auth).send({ city: 'Pune' }).expect(404);
    await ctx.http.delete(`/v1/me/addresses/${created.body.id}`).set(b.auth).expect(404);
    await ctx.http.delete(`/v1/me/addresses/${created.body.id}`).set(a.auth).expect(204);
  });

  it('records consent', async () => {
    const user = await userWithRoles(ctx, ['CUSTOMER']);
    const res = await ctx.http
      .post('/v1/me/consents')
      .set(user.auth)
      .send({ version: '2026-10-01', consents: [{ purpose: 'TERMS', granted: true }, { purpose: 'MARKETING', granted: false }] })
      .expect(200);
    expect(res.body.consents).toHaveLength(2);
  });

  it('403 for customers on admin routes; SUPER_ADMIN can change roles', async () => {
    const customer = await userWithRoles(ctx, ['CUSTOMER']);
    const admin = await userWithRoles(ctx, ['SUPER_ADMIN']);
    await ctx.http.get('/v1/admin/users').set(customer.auth).expect(403);
    await ctx.http.get('/v1/admin/designs').set(customer.auth).expect(403);
    await ctx.http.put(`/v1/admin/users/${customer.id}/roles`).set(customer.auth).send({ roles: ['SUPER_ADMIN'] }).expect(403);

    const res = await ctx.http.put(`/v1/admin/users/${customer.id}/roles`).set(admin.auth).send({ roles: ['CUSTOMER', 'SUPPORT'] }).expect(200);
    expect(res.body.roles).toEqual(['CUSTOMER', 'SUPPORT']);
    const log = await ctx.db.auditLog.findFirst({ where: { entityId: customer.id, action: 'user.roles_changed' } });
    expect(log?.after).toEqual({ roles: ['CUSTOMER', 'SUPPORT'] });
  });

  it('a super admin cannot remove their own SUPER_ADMIN role', async () => {
    const admin = await userWithRoles(ctx, ['SUPER_ADMIN']);
    const res = await ctx.http.put(`/v1/admin/users/${admin.id}/roles`).set(admin.auth).send({ roles: ['CUSTOMER'] }).expect(403);
    expect(res.body.error.code).toBe('CANNOT_DEMOTE_SELF');
  });

  it('staff roles need MFA when STAFF_MFA_REQUIRED is on', async () => {
    const manager = await userWithRoles(ctx, ['CATALOG_MANAGER']);
    ctx.config.STAFF_MFA_REQUIRED = true;
    try {
      const res = await ctx.http.get('/v1/admin/designs').set(manager.auth).expect(403);
      expect(res.body.error.code).toBe('MFA_REQUIRED');
      const aal2 = await tokenFor((await ctx.db.user.findUniqueOrThrow({ where: { id: manager.id } })).authUserId, manager.email, 'aal2');
      await ctx.http.get('/v1/admin/designs').set('Authorization', `Bearer ${aal2}`).expect(200);
    } finally {
      ctx.config.STAFF_MFA_REQUIRED = false;
    }
  });
});
