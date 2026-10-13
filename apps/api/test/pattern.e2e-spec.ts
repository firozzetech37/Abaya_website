import {
  advance,
  approvedItem,
  createTestApp,
  savePattern,
  type TestContext,
  type TestUser,
  toStitching,
  userWithRoles, stitchItem } from './helpers';

describe('Pattern station: measurements + ease, pieces, fabric, files, versions (e2e)', () => {
  let ctx: TestContext;
  let pm: TestUser;
  let technician: TestUser;
  let cutter: TestUser;
  let qc: TestUser;
  let customer: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    pm = await userWithRoles(ctx, ['PRODUCTION_MANAGER']);
    technician = await userWithRoles(ctx, ['PATTERN_TECHNICIAN']);
    cutter = await userWithRoles(ctx, ['CUTTER']);
    qc = await userWithRoles(ctx, ['QC']);
    customer = await userWithRoles(ctx, ['CUSTOMER']);
  });
  afterAll(() => ctx.close());

  const station = (user: TestUser, itemId: string) => ctx.http.get(`/v1/workshop/items/${itemId}/pattern`).set(user.auth);

  it('prefills from the tech pack, saves drafts, and confirms only a complete pattern', async () => {
    const { itemId } = await approvedItem(ctx, pm, customer, undefined, { pattern: technician, cutting: cutter, qc });

    // Before starting: a prefill, but no editing yet.
    const before = await station(technician, itemId).expect(200);
    expect(before.body).toMatchObject({ current: null, editable: false, missing: ['measurements', 'pieces', 'fabric', 'files'] });
    expect(before.body.suggestion.style).toBe('CLOSED');
    expect(before.body.suggestion.measurements.find((m: { key: string }) => m.key === 'bustCm')).toMatchObject({ bodyCm: 94, easeCm: 12, finishedCm: 106 });
    expect(before.body.suggestion.pieces.map((p: { name: string }) => p.name)).toEqual(expect.arrayContaining(['Front', 'Back', 'Sleeve']));
    await savePattern(ctx, technician, itemId, {}, 422);

    await advance(ctx, technician, itemId, { to: 'PATTERN' }).expect(200);
    // A draft may be incomplete; it cannot go to cutting until it is not.
    const partial = await savePattern(ctx, technician, itemId, { files: [], fabricLengthCm: null }, 200);
    expect(partial.body).toMatchObject({ editable: true, missing: ['fabric', 'files'], current: { version: 1, status: 'DRAFT' } });
    const refused = await advance(ctx, technician, itemId, { to: 'CUTTING' }).expect(422);
    expect(refused.body.error).toMatchObject({ code: 'PATTERN_INCOMPLETE', details: { missing: ['fabric', 'files'] } });

    // Only pattern files from the pattern upload; cutters cannot upload them or edit the pattern.
    await ctx.http.post('/v1/workshop/uploads').set(cutter.auth).send({ contentType: 'application/pdf', purpose: 'PATTERN_FILE' }).expect(403);
    await ctx.http.post('/v1/workshop/uploads').set(technician.auth).send({ contentType: 'application/pdf', purpose: 'STAGE_PHOTO' }).expect(400);
    const wrongFile = await savePattern(ctx, technician, itemId, {
      files: [{ path: 'stage-photos/2026/09/0b8f6a3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b.jpg', name: 'x.jpg', contentType: 'image/jpeg' }],
    }, 422);
    expect(wrongFile.body.error.code).toBe('INVALID_UPLOAD_PATH');

    const saved = await savePattern(ctx, technician, itemId, {}, 200);
    expect(saved.body.missing).toEqual([]);
    expect(saved.body.current).toMatchObject({ version: 1, status: 'DRAFT', fabricLengthCm: 360 });
    expect(saved.body.current.measurements.find((m: { key: string }) => m.key === 'bustCm')).toMatchObject({ finishedCm: 106 });
    expect(saved.body.current.files[0].url).toMatch(/^https:\/\/storage\.test\/signed\/private\/pattern-files\//);

    // The queue card shows what the job needs and how far the pattern is.
    const queue = await ctx.http.get('/v1/workshop/stations/pattern/items').set(technician.auth).expect(200);
    const queued = queue.body.find((i: { id: string }) => i.id === itemId);
    expect(queued.brief.pattern).toEqual({ version: 1, status: 'DRAFT', missing: [] });
    expect(queued.brief.options.length).toBeGreaterThan(0);
    const empty = await ctx.http.get('/v1/workshop/stations/pattern/done').set(technician.auth).expect(200);
    expect(empty.body.map((d: { id: string }) => d.id)).not.toContain(itemId);

    await advance(ctx, technician, itemId, { to: 'CUTTING' }).expect(200);
    // Done tab: the job the technician sent on, where it is now; others' done lists stay theirs.
    const done = await ctx.http.get('/v1/workshop/stations/pattern/done').set(technician.auth).expect(200);
    expect(done.body.find((d: { id: string }) => d.id === itemId)).toMatchObject({
      stage: 'CUTTING',
      toStage: 'CUTTING',
      doneBy: { id: technician.id },
      canOpen: false,
    });
    const managerView = await ctx.http.get('/v1/workshop/stations/pattern/done').set(pm.auth).expect(200);
    expect(managerView.body.find((d: { id: string }) => d.id === itemId)).toMatchObject({ canOpen: true });
    await ctx.http.get('/v1/workshop/stations/pattern/done').set(cutter.auth).expect(403);
    const audit = await ctx.db.auditLog.findFirstOrThrow({ where: { entityId: itemId, action: 'pattern.confirmed' } });
    expect(audit.after).toMatchObject({ version: 1, files: 1 });

    // The cutter works from the confirmed pattern (read-only).
    const card = await ctx.http.get(`/v1/workshop/items/${itemId}`).set(cutter.auth).expect(200);
    expect(card.body.pattern).toMatchObject({ version: 1, status: 'CONFIRMED', pieces: expect.any(Array), confirmedBy: { id: technician.id } });
    const view = await station(cutter, itemId).expect(200);
    expect(view.body.editable).toBe(false);
    await ctx.http.put(`/v1/workshop/items/${itemId}/pattern`).set(cutter.auth).send({}).expect(403);
  });

  it('starts version 2 when QC sends the item back to pattern, keeping version 1', async () => {
    const { itemId } = await approvedItem(ctx, pm, customer, undefined, { pattern: technician, cutting: cutter, qc });
    await toStitching(ctx, pm, itemId);
    await stitchItem(ctx, pm, itemId);
    await ctx.http
      .post(`/v1/admin/order-items/${itemId}/qc`)
      .set(qc.auth)
      .send({ result: 'FAIL', checklist: [{ item: 'Fit', ok: false }], notes: 'Shoulder too narrow: redraft', sendBackTo: 'PATTERN' })
      .expect(201);

    await ctx.http.post(`/v1/workshop/items/${itemId}/claim`).set(technician.auth).expect(200);
    const v2 = await savePattern(ctx, technician, itemId, { notes: 'Shoulder +2 cm' }, 200);
    expect(v2.body.current).toMatchObject({ version: 2, status: 'DRAFT', notes: 'Shoulder +2 cm' });
    expect(v2.body.previous.map((p: { version: number; status: string }) => [p.version, p.status])).toEqual([[1, 'CONFIRMED']]);
    await advance(ctx, technician, itemId, { to: 'CUTTING' }).expect(200);

    // The admin order page shows the latest version.
    const order = await ctx.db.orderItem.findUniqueOrThrow({ where: { id: itemId } });
    const detail = await ctx.http.get(`/v1/admin/orders/${order.orderId}`).set(pm.auth).expect(200);
    expect(detail.body.items[0].pattern).toMatchObject({ version: 2, status: 'CONFIRMED' });
  });
});
