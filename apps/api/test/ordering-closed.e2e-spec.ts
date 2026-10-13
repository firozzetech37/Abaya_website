import { createTestApp, designChoices, type TestContext, type TestUser, userWithRoles } from './helpers';

/** "Ordering coming soon" (ORDERING_ENABLED off): no bag, checkout or HD downloads; previews still work. */
describe('Ordering coming soon (e2e)', () => {
  let ctx: TestContext;
  let rania: TestUser;

  beforeAll(async () => {
    process.env.ORDERING_ENABLED = 'false';
    try {
      ctx = await createTestApp();
    } finally {
      delete process.env.ORDERING_ENABLED;
    }
    rania = await userWithRoles(ctx, ['CUSTOMER'], 'closed-rania');
  });
  afterAll(() => ctx.close());

  it('says ordering is closed and refuses the bag, checkout and HD downloads', async () => {
    expect((await ctx.http.get('/v1/ordering/status').expect(200)).body).toEqual({ orderingEnabled: false });
    const { design, values, bands } = await designChoices(ctx, 'classic-nida-closed');
    const bag = await ctx.http
      .post('/v1/cart/items')
      .set(rania.auth)
      .send({ designId: design.id, selectedOptionValueIds: [values.crepe, values.navy], sizeBandId: bands.M, quantity: 1 })
      .expect(422);
    expect(bag.body.error).toMatchObject({ code: 'ORDERING_CLOSED', message: expect.stringContaining('Ordering opens soon') });
    const address = await ctx.http
      .post('/v1/me/addresses')
      .set(rania.auth)
      .send({ fullName: 'Rania', phone: '9988776655', line1: '7 Residency Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560025' })
      .expect(201);
    expect((await ctx.http.post('/v1/checkout').set(rania.auth).send({ addressId: address.body.id }).expect(422)).body.error.code).toBe('ORDERING_CLOSED');
    expect((await ctx.http.post('/v1/me/downloads').set(rania.auth).send({ designId: design.id, licenceAccepted: true }).expect(422)).body.error.code).toBe('ORDERING_CLOSED');
  });

  it('still makes AI previews', async () => {
    const { design, values } = await designChoices(ctx, 'classic-nida-closed');
    await ctx.http.post('/v1/me/try-on/previews').set(rania.auth).send({ designId: design.id, selectedOptionValueIds: [values.crepe, values.navy] }).expect(201);
  });

  it('lets her ask to be told when ordering opens, and shows the list to support', async () => {
    expect((await ctx.http.get('/v1/me/ordering-waitlist').set(rania.auth).expect(200)).body).toEqual({ joined: false, joinedAt: null });
    const first = await ctx.http.post('/v1/me/ordering-waitlist').set(rania.auth).expect(200);
    expect(first.body).toEqual({ joined: true, joinedAt: expect.any(String) });
    // Joining twice keeps her first date.
    expect((await ctx.http.post('/v1/me/ordering-waitlist').set(rania.auth).expect(200)).body.joinedAt).toBe(first.body.joinedAt);

    const support = await userWithRoles(ctx, ['SUPPORT'], 'closed-support');
    const list = await ctx.http.get('/v1/admin/ordering-waitlist').set(support.auth).expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(list.body.items).toContainEqual({ userId: rania.id, name: null, email: rania.email, phone: null, joinedAt: first.body.joinedAt });
    await ctx.http.get('/v1/admin/ordering-waitlist').set(rania.auth).expect(403);
    const designer = await userWithRoles(ctx, ['DESIGNER'], 'closed-designer');
    await ctx.http.get('/v1/admin/ordering-waitlist').set(designer.auth).expect(403);
  });
});
