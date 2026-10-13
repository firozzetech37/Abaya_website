import {
  advance,
  approvedItem,
  createTestApp,
  cutItem,
  savePattern,
  type TestContext,
  type TestUser,
  userWithRoles, stitchItem } from './helpers';

describe('Cutting station: lot, metres against the estimate, pieces, re-cuts (e2e)', () => {
  let ctx: TestContext;
  let pm: TestUser;
  let cutter: TestUser;
  let qc: TestUser;
  let customer: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    pm = await userWithRoles(ctx, ['PRODUCTION_MANAGER']);
    cutter = await userWithRoles(ctx, ['CUTTER']);
    qc = await userWithRoles(ctx, ['QC']);
    customer = await userWithRoles(ctx, ['CUSTOMER']);
  });
  afterAll(() => ctx.close());

  /** An item waiting at cutting, cut from the helper pattern (estimate 3.6 m). */
  async function atCutting() {
    const { itemId, orderId } = await approvedItem(ctx, pm, customer, undefined, { cutting: cutter, qc });
    await advance(ctx, pm, itemId, { to: 'PATTERN' }).expect(200);
    await savePattern(ctx, pm, itemId);
    await advance(ctx, pm, itemId, { to: 'CUTTING' }).expect(200);
    await ctx.http.post(`/v1/workshop/items/${itemId}/claim`).set(cutter.auth).expect(200);
    return { itemId, orderId };
  }

  it('records the cut, checks it against the pattern, and shows it to the next stations', async () => {
    const { itemId, orderId } = await atCutting();

    // Every pattern piece must be ticked, with lot, colour and metres.
    const incomplete = await cutItem(
      ctx,
      cutter,
      itemId,
      { fabricLot: 'L-1', colourConfirmed: false, pieces: [{ name: 'Front', count: 1, cut: true }] },
      422,
    );
    expect(incomplete.body.error).toMatchObject({ code: 'CUTTING_INCOMPLETE', details: { missing: ['colour', 'pieces'] } });
    // Far over the 3.6 m estimate (+25%): a note is required.
    const overuse = await cutItem(ctx, cutter, itemId, { fabricUsedCm: 450 }, 422);
    expect(overuse.body.error.details.missing).toEqual(['overuseNote']);
    // The photo must come from the workshop upload.
    const badPhoto = await cutItem(ctx, cutter, itemId, { photoPath: 'qc-photos/2026/09/0b8f6a3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b.jpg' }, 422);
    expect(badPhoto.body.error.code).toBe('INVALID_UPLOAD_PATH');

    const done = await cutItem(ctx, cutter, itemId, { fabricUsedCm: 450, notes: 'Flaw in roll: front recut' });
    expect(done.body.item).toBeNull(); // on to stitching
    expect((await ctx.db.orderItem.findUniqueOrThrow({ where: { id: itemId } })).stage).toBe('STITCHING');

    const card = await ctx.http.get(`/v1/workshop/items/${itemId}`).set(pm.auth).expect(200);
    expect(card.body.cuttings).toEqual([
      expect.objectContaining({
        attempt: 1,
        fabricLot: 'CR-NAVY-0925-03',
        fabricUsedCm: 450,
        estimateCm: 360,
        variancePercent: 25,
        notes: 'Flaw in roll: front recut',
        cutBy: expect.objectContaining({ id: cutter.id }),
      }),
    ]);
    expect(card.body.cuttings[0].photoUrl).toMatch(/signed\/private\/stage-photos\//);
    const admin = await ctx.http.get(`/v1/admin/orders/${orderId}`).set(pm.auth).expect(200);
    expect(admin.body.items[0].cuttings[0]).toMatchObject({ attempt: 1, variancePercent: 25 });
    const audit = await ctx.db.auditLog.findFirstOrThrow({ where: { entityId: itemId, action: 'cutting.recorded' } });
    expect(audit.after).toMatchObject({ attempt: 1, fabricLot: 'CR-NAVY-0925-03', variancePercent: 25 });
  });

  it('adds a re-cut when QC sends the item back to cutting', async () => {
    const { itemId } = await atCutting();
    await cutItem(ctx, cutter, itemId);
    await stitchItem(ctx, pm, itemId);
    await ctx.http
      .post(`/v1/admin/order-items/${itemId}/qc`)
      .set(qc.auth)
      .send({ result: 'FAIL', checklist: [{ item: 'Grain', ok: false }], notes: 'Off-grain front', sendBackTo: 'CUTTING' })
      .expect(201);

    await ctx.http.post(`/v1/workshop/items/${itemId}/claim`).set(cutter.auth).expect(200);
    await cutItem(ctx, cutter, itemId, { fabricLot: 'CR-NAVY-0925-04', fabricUsedCm: 200 });
    const card = await ctx.http.get(`/v1/workshop/items/${itemId}`).set(pm.auth).expect(200);
    expect(card.body.cuttings.map((c: { attempt: number; fabricLot: string }) => [c.attempt, c.fabricLot])).toEqual([
      [2, 'CR-NAVY-0925-04'],
      [1, 'CR-NAVY-0925-03'],
    ]);
  });

  it('keeps the admin shortcut from skipping the cutting record', async () => {
    const { itemId } = await atCutting();
    const photo = await ctx.http.post('/v1/workshop/uploads').set(pm.auth).send({ contentType: 'image/jpeg' }).expect(201);
    const res = await ctx.http
      .post(`/v1/admin/order-items/${itemId}/stage`)
      .set(pm.auth)
      .send({ to: 'STITCHING', photoPath: photo.body.storagePath })
      .expect(422);
    expect(res.body.error.code).toBe('USE_CUTTING_FORM');
  });
});
