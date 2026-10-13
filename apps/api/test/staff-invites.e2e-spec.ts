import { randomUUID } from 'node:crypto';
import { createTestApp, type TestContext, type TestUser, tokenFor, userWithRoles } from './helpers';

/** First sign-in of a brand-new person with this email (what Clerk does after the email code). */
async function firstSignIn(ctx: TestContext, email: string) {
  const token = await tokenFor(`user_${randomUUID().replace(/-/g, '')}`, email);
  const auth = { Authorization: `Bearer ${token}` };
  const me = await ctx.http.get('/v1/me').set(auth).expect(200);
  return { auth, me: me.body as { id: string; roles: string[]; name: string | null; isStaff: boolean } };
}

describe('Staff added by email: roles on first sign-in (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let pm: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRoles(ctx, ['SUPER_ADMIN']);
    pm = await userWithRoles(ctx, ['PRODUCTION_MANAGER']);
  });
  afterAll(() => ctx.close());

  const email = (label: string) => `${label}-${randomUUID().slice(0, 8)}@example.com`;

  it('grants the invited station on the first sign-in with that email', async () => {
    const address = email('cutter');
    const invited = await ctx.http
      .post('/v1/admin/staff-invites')
      .set(admin.auth)
      .send({ email: address.toUpperCase(), name: 'Rehana Cutter', roles: ['CUTTER'] })
      .expect(201);
    expect(invited.body).toMatchObject({ user: null, invite: { email: address, roles: ['CUTTER'], status: 'PENDING' } });

    const list = await ctx.http.get('/v1/admin/staff-invites').set(admin.auth).expect(200);
    expect(list.body.map((i: { email: string }) => i.email)).toContain(address);

    const { auth, me } = await firstSignIn(ctx, address);
    expect(me.roles).toEqual(['CUSTOMER', 'CUTTER']);
    expect(me).toMatchObject({ name: 'Rehana Cutter', isStaff: true });
    // Straight into their station.
    await ctx.http.get('/v1/workshop/stations/cutting/items').set(auth).expect(200);
    await ctx.http.get('/v1/workshop/stations/pattern/items').set(auth).expect(403);

    const after = await ctx.db.staffInvite.findFirstOrThrow({ where: { email: address } });
    expect(after).toMatchObject({ status: 'ACCEPTED', acceptedUserId: me.id });
    const audit = await ctx.db.auditLog.findFirstOrThrow({ where: { entityId: me.id, action: 'user.roles_changed' } });
    expect(audit.after).toMatchObject({ via: 'staff_invite', roles: ['CUSTOMER', 'CUTTER'] });
  });

  it('adds a tailor like any other staff: tailor record now, login linked on the first visit', async () => {
    const address = email('tailor');
    const noDetails = await ctx.http.post('/v1/admin/staff-invites').set(admin.auth).send({ email: address, roles: ['MAKER'] }).expect(400);
    expect(JSON.stringify(noDetails.body.error)).toContain('tailor');
    // Only the city is needed; a phone number is not asked for.
    await ctx.http.post('/v1/admin/staff-invites').set(admin.auth).send({ email: address, roles: ['MAKER'], tailor: {} }).expect(400);

    await ctx.http
      .post('/v1/admin/staff-invites')
      .set(admin.auth)
      .send({ email: address, name: 'Salma Tailor', roles: ['MAKER'], tailor: { city: 'Lucknow' } })
      .expect(201);
    const record = await ctx.db.maker.findUniqueOrThrow({ where: { email: address } });
    expect(record).toMatchObject({ name: 'Salma Tailor', phone: null, city: 'Lucknow', userId: null, isActive: true });
    const created = await ctx.db.auditLog.findFirstOrThrow({ where: { entityId: record.id, action: 'maker.created' } });
    expect(created.actorUserId).toBe(admin.id);

    // The production manager sees the new tailor for assigning work (not signed in yet).
    const tailors = await ctx.http.get('/v1/admin/makers').set(pm.auth).expect(200);
    expect(tailors.body.find((m: { id: string }) => m.id === record.id)).toMatchObject({ hasLogin: false });

    const { auth, me } = await firstSignIn(ctx, address);
    expect(me.roles).toEqual(['CUSTOMER', 'MAKER']);
    await ctx.http.get('/v1/workshop/stations/stitching/items').set(auth).expect(200);
    await ctx.http.get('/v1/workshop/earnings').set(auth).expect(200);
    expect((await ctx.db.maker.findUniqueOrThrow({ where: { id: record.id } })).userId).toBe(me.id);

    // Adding the same email again updates the details; there is still one tailor record.
    await ctx.http
      .post('/v1/admin/staff-invites')
      .set(admin.auth)
      .send({ email: address, roles: ['MAKER'], tailor: { city: 'Kanpur' } })
      .expect(201);
    expect(await ctx.db.maker.findMany({ where: { email: address } })).toMatchObject([{ city: 'Kanpur', userId: me.id }]);
    // Tailors are no longer created on the Tailors page.
    await ctx.http.post('/v1/admin/makers').set(pm.auth).send({ name: 'X', city: 'Y' }).expect(404);
    // A phone number can be added later on the Tailors page.
    const edited = await ctx.http.patch(`/v1/admin/makers/${record.id}`).set(pm.auth).send({ phone: '9876512399' }).expect(200);
    expect(edited.body.phone).toBe('9876512399');
  });

  it('applies the roles straight away when the person already has an account', async () => {
    const existing = await userWithRoles(ctx, ['CUSTOMER'], 'packer');
    const res = await ctx.http.post('/v1/admin/staff-invites').set(admin.auth).send({ email: existing.email, roles: ['FINISHER', 'LOGISTICS'] }).expect(201);
    expect(res.body.invite).toBeNull();
    expect(res.body.user.roles).toEqual(['CUSTOMER', 'FINISHER', 'LOGISTICS']);
    await ctx.http.get('/v1/workshop/stations/finishing/items').set(existing.auth).expect(200);
  });

  it('keeps one pending invite per email, and a cancelled invite grants nothing', async () => {
    const address = email('changed');
    await ctx.http.post('/v1/admin/staff-invites').set(admin.auth).send({ email: address, roles: ['CUTTER'] }).expect(201);
    const updated = await ctx.http.post('/v1/admin/staff-invites').set(admin.auth).send({ email: address, roles: ['QC'] }).expect(201);
    expect(updated.body.invite.roles).toEqual(['QC']);
    expect(await ctx.db.staffInvite.count({ where: { email: address, status: 'PENDING' } })).toBe(1);

    await ctx.http.delete(`/v1/admin/staff-invites/${updated.body.invite.id}`).set(admin.auth).expect(200);
    await ctx.http.delete(`/v1/admin/staff-invites/${updated.body.invite.id}`).set(admin.auth).expect(404);
    const { me } = await firstSignIn(ctx, address);
    expect(me.roles).toEqual(['CUSTOMER']);
  });

  it('only a super admin invites, never as a customer, and someone else’s email grants nothing', async () => {
    await ctx.http.post('/v1/admin/staff-invites').set(pm.auth).send({ email: email('x'), roles: ['CUTTER'] }).expect(403);
    await ctx.http.get('/v1/admin/staff-invites').set(pm.auth).expect(403);
    await ctx.http.post('/v1/admin/staff-invites').set(admin.auth).send({ email: email('x'), roles: ['CUSTOMER'] }).expect(400);
    await ctx.http.post('/v1/admin/staff-invites').set(admin.auth).send({ email: 'not-an-email', roles: ['CUTTER'] }).expect(400);

    await ctx.http.post('/v1/admin/staff-invites').set(admin.auth).send({ email: email('target'), roles: ['LOGISTICS'] }).expect(201);
    const { me } = await firstSignIn(ctx, email('stranger'));
    expect(me.roles).toEqual(['CUSTOMER']);
  });
});
