import {
  addTailor,
  advance,
  approvedItem,
  createTestApp,
  cutItem,
  stationPhoto,
  stitchItem,
  type TestContext,
  type TestUser,
  toStitching,
  userWithRoles,
} from './helpers';

describe('Stitching station: start, checklist, self-check, problems, earnings (e2e)', () => {
  let ctx: TestContext;
  let pm: TestUser;
  let qc: TestUser;
  let tailor: TestUser;
  let customer: TestUser;
  let makerId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    pm = await userWithRoles(ctx, ['PRODUCTION_MANAGER']);
    qc = await userWithRoles(ctx, ['QC']);
    customer = await userWithRoles(ctx, ['CUSTOMER']);
    await ctx.db.design.updateMany({ data: { makingCostInPaise: 90000 } });
    ({ tailor, makerId } = await addTailor(ctx, 'Needle House', 'stitching-tailor'));
  });
  afterAll(() => ctx.close());

  /** An item cut and waiting with our tailor. */
  async function atStitching() {
    const { itemId, orderId } = await approvedItem(ctx, pm, customer, undefined, { makerId, qc });
    await toStitching(ctx, pm, itemId);
    return { itemId, orderId };
  }
  const post = (user: TestUser, itemId: string, body: Record<string, unknown>) =>
    ctx.http.post(`/v1/workshop/items/${itemId}/stitching`).set(user.auth).send(body);

  it('needs "Start stitching", every line ticked, the measurements and a photo', async () => {
    const { itemId, orderId } = await atStitching();
    const card = await ctx.http.get(`/v1/workshop/items/${itemId}`).set(tailor.auth).expect(200);
    expect(card.body.makingChargeInPaise).toBe(90000); // "This job pays ₹900"
    const photoPath = await stationPhoto(ctx, tailor);

    const notStarted = await post(tailor, itemId, { checklist: [], measurements: [], notes: '', photoPath }).expect(422);
    expect(notStarted.body.error.code).toBe('STITCHING_NOT_STARTED');
    const started = await ctx.http.post(`/v1/workshop/items/${itemId}/claim`).set(tailor.auth).expect(200);
    expect(started.body.claimedAt).toEqual(expect.any(String));

    const incomplete = await post(tailor, itemId, { checklist: [{ key: 'assembly', done: true }], measurements: [], notes: '', photoPath }).expect(422);
    expect(incomplete.body.error).toMatchObject({ code: 'STITCHING_INCOMPLETE', details: { missing: ['checklist', 'measurements'] } });
    // A bare step is refused: the form is the only way to QC.
    const bare = await advance(ctx, tailor, itemId, { to: 'QC', photoPath }).expect(422);
    expect(bare.body.error.code).toBe('USE_STITCHING_FORM');
    const adminStep = await ctx.http.post(`/v1/admin/order-items/${itemId}/stage`).set(pm.auth).send({ to: 'QC', photoPath }).expect(422);
    expect(adminStep.body.error.code).toBe('USE_STITCHING_FORM');

    // 4 cm short of the pattern's 140 cm: a note is required.
    const short = [
      { key: 'fullLengthCm', measuredCm: 136 },
      { key: 'bustCm', measuredCm: 106 },
    ];
    const off = await stitchItem(ctx, tailor, itemId, { measurements: short }, 422);
    expect(off.body.error.details.missing).toEqual(['offNote']);
    const done = await stitchItem(ctx, tailor, itemId, { measurements: short, notes: 'Customer asked for ankle length' });
    expect(done.body.item).toBeNull(); // on to QC
    expect((await ctx.db.orderItem.findUniqueOrThrow({ where: { id: itemId } })).stage).toBe('QC');

    // QC sees what the tailor recorded, with the target and the difference.
    const atQc = await ctx.http.get(`/v1/workshop/items/${itemId}`).set(qc.auth).expect(200);
    expect(atQc.body.stitchings).toHaveLength(1);
    expect(atQc.body.stitchings[0]).toMatchObject({
      attempt: 1,
      notes: 'Customer asked for ankle length',
      makerName: 'Needle House',
      stitchedBy: { id: tailor.id },
      photoUrl: expect.any(String),
      startedAt: expect.any(String),
    });
    expect(atQc.body.stitchings[0].checklist.every((l: { done: boolean }) => l.done)).toBe(true);
    expect(atQc.body.stitchings[0].measurements).toContainEqual({ key: 'fullLengthCm', measuredCm: 136, targetCm: 140, diffCm: -4, level: 'off' });
    expect(atQc.body.makingChargeInPaise).toBeNull(); // pay is for the tailor and managers only

    // QC fail back to stitching: a second attempt; the pass pays the tailor.
    await ctx.http
      .post(`/v1/admin/order-items/${itemId}/qc`)
      .set(qc.auth)
      .send({ result: 'FAIL', checklist: [{ item: 'Hem even', ok: false }], notes: 'Hem uneven', sendBackTo: 'STITCHING' })
      .expect(201);
    await stitchItem(ctx, tailor, itemId);
    await ctx.http.post(`/v1/admin/order-items/${itemId}/qc`).set(qc.auth).send({ result: 'PASS', checklist: [{ item: 'Hem even', ok: true }] }).expect(201);

    const order = await ctx.http.get(`/v1/admin/orders/${orderId}`).set(pm.auth).expect(200);
    expect(order.body.items[0].stitchings.map((s: { attempt: number }) => s.attempt)).toEqual([2, 1]);

    const earnings = await ctx.http.get('/v1/workshop/earnings').set(tailor.auth).expect(200);
    expect(earnings.body).toMatchObject({ pendingInPaise: 90000, paidTotalInPaise: 0 });
    expect(earnings.body.recent[0]).toMatchObject({ amountInPaise: 90000, status: 'PENDING' });
    const notTailor = await ctx.http.get('/v1/workshop/earnings').set(pm.auth).expect(403);
    expect(notTailor.body.error.code).toBe('FORBIDDEN');
  });

  it('reports a problem with the kit; the production manager resumes or sends it for a re-cut', async () => {
    const { itemId } = await atStitching();
    await ctx.http.post(`/v1/workshop/items/${itemId}/claim`).set(tailor.auth).expect(200);
    const photoPath = await stationPhoto(ctx, tailor);
    const held = await ctx.http
      .post(`/v1/workshop/items/${itemId}/hold`)
      .set(tailor.auth)
      .send({ reason: 'Only one sleeve in the bundle', problemType: 'MISSING_PIECE', photoPath })
      .expect(200);
    expect(held.body).toMatchObject({ stage: 'ON_HOLD', heldFromStage: 'STITCHING', holdReason: 'Missing piece: Only one sleeve in the bundle' });
    expect(held.body.actions).toEqual([]); // the tailor waits for the decision
    await ctx.http.post(`/v1/workshop/items/${itemId}/resume`).set(tailor.auth).send({}).expect(422);

    const decide = await ctx.http.get(`/v1/workshop/items/${itemId}`).set(pm.auth).expect(200);
    expect(decide.body.actions.map((a: { to: string }) => a.to)).toEqual(['STITCHING', 'CUTTING']);
    const recut = await ctx.http.post(`/v1/workshop/items/${itemId}/resume`).set(pm.auth).send({ to: 'CUTTING' }).expect(200);
    expect(recut.body.stage).toBe('CUTTING');
    expect(recut.body.events.at(-1)).toMatchObject({ toStage: 'CUTTING', note: 'Sent back for a re-cut' });

    // Re-cut, then the tailor carries on; problem types belong to stitching only.
    const wrongStation = await ctx.http
      .post(`/v1/workshop/items/${itemId}/hold`)
      .set(pm.auth)
      .send({ reason: 'Roll looks faded', problemType: 'OTHER' })
      .expect(422);
    expect(wrongStation.body.error.code).toBe('PROBLEM_ONLY_AT_STITCHING');
    await cutItem(ctx, pm, itemId);
    await ctx.http.post(`/v1/workshop/items/${itemId}/claim`).set(tailor.auth).expect(200);
    await ctx.http.post(`/v1/workshop/items/${itemId}/hold`).set(tailor.auth).send({ reason: 'Lining colour looks off', problemType: 'FABRIC_FLAW' }).expect(200);
    const carryOn = await ctx.http.post(`/v1/workshop/items/${itemId}/resume`).set(pm.auth).send({ note: 'Colour is as ordered' }).expect(200);
    expect(carryOn.body.stage).toBe('STITCHING');
    await stitchItem(ctx, tailor, itemId);
    expect((await ctx.db.orderItem.findUniqueOrThrow({ where: { id: itemId } })).stage).toBe('QC');
  });
});
