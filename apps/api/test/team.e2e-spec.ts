import {
  addTailor,
  advance,
  assignTeam,
  createTestApp,
  cutItem,
  paidOrder,
  savePattern,
  type TestContext,
  type TestUser,
  userWithRoles,
} from './helpers';

describe('Workshop team: one person per station, hand-over in order (e2e)', () => {
  let ctx: TestContext;
  let pm: TestUser;
  let customer: TestUser;
  let technician: TestUser;
  let otherTechnician: TestUser;
  let cutter: TestUser;
  let cutter2: TestUser;
  let qc: TestUser;
  let otherQc: TestUser;
  let finisher: TestUser;
  let makerId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    pm = await userWithRoles(ctx, ['PRODUCTION_MANAGER']);
    customer = await userWithRoles(ctx, ['CUSTOMER']);
    technician = await userWithRoles(ctx, ['PATTERN_TECHNICIAN'], 'rehana');
    otherTechnician = await userWithRoles(ctx, ['PATTERN_TECHNICIAN']);
    cutter = await userWithRoles(ctx, ['CUTTER'], 'imran');
    cutter2 = await userWithRoles(ctx, ['CUTTER'], 'zaid');
    qc = await userWithRoles(ctx, ['QC'], 'ayesha');
    otherQc = await userWithRoles(ctx, ['QC']);
    finisher = await userWithRoles(ctx, ['FINISHER'], 'faiz');
    ({ makerId } = await addTailor(ctx, 'Salma Tailors', 'salma'));
  });
  afterAll(() => ctx.close());

  const team = { pattern: null, cutting: null, qc: null, finishing: null, makerId: null, dueDate: null };
  async function placedItem() {
    const order = await paidOrder(ctx, customer, 'classic-nida-closed');
    const itemId = (await ctx.db.orderItem.findFirstOrThrow({ where: { orderId: order.orderId } })).id;
    return { itemId, orderId: order.orderId };
  }
  const approve = async (itemId: string, status = 200) => {
    const pack = await ctx.http.get(`/v1/admin/order-items/${itemId}/tech-pack`).set(pm.auth).expect(200);
    return ctx.http.put(`/v1/admin/order-items/${itemId}/tech-pack`).set(pm.auth).send({ content: pack.body.draft, approve: true }).expect(status);
  };
  const queue = (user: TestUser, station: string, view = 'all') =>
    ctx.http.get(`/v1/workshop/stations/${station}/items?view=${view}`).set(user.auth).expect(200);
  const ids = (res: { body: { id: string }[] }) => res.body.map((i) => i.id);

  it('needs the whole team before the tech pack is approved, and only the right people', async () => {
    const { itemId, orderId } = await placedItem();
    const refused = await approve(itemId, 422);
    expect(refused.body.error).toMatchObject({ code: 'TEAM_INCOMPLETE', details: { missing: ['pattern', 'cutting', 'stitching', 'qc', 'finishing'] } });

    // A cutter cannot be the pattern technician; the tailor needs a due date.
    const wrongRole = await ctx.http
      .put(`/v1/admin/order-items/${itemId}/team`)
      .set(pm.auth)
      .send({ ...team, pattern: cutter.id })
      .expect(422);
    expect(wrongRole.body.error).toMatchObject({ code: 'NOT_A_STATION_MEMBER', details: { station: 'pattern' } });
    await ctx.http.put(`/v1/admin/order-items/${itemId}/team`).set(pm.auth).send({ ...team, makerId }).expect(400);
    await ctx.http.put(`/v1/admin/order-items/${itemId}/team`).set(qc.auth).send(team).expect(403);

    const partial = await ctx.http.put(`/v1/admin/order-items/${itemId}/team`).set(pm.auth).send({ ...team, pattern: technician.id }).expect(200);
    expect(partial.body).toMatchObject({ pattern: { id: technician.id }, cutting: null, stitching: null });
    expect((await approve(itemId, 422)).body.error.details.missing).toEqual(['cutting', 'stitching', 'qc', 'finishing']);

    await assignTeam(ctx, pm, itemId, { pattern: technician, cutting: cutter, qc, finishing: finisher, makerId });
    await approve(itemId);
    const audit = await ctx.db.auditLog.findMany({ where: { entityId: itemId, action: 'workshop.team_assigned' } });
    expect(audit.length).toBeGreaterThanOrEqual(2);

    // The admin sees the team and who has the job now.
    const detail = await ctx.http.get(`/v1/admin/orders/${orderId}`).set(pm.auth).expect(200);
    expect(detail.body.items[0].team).toMatchObject({
      pattern: { id: technician.id },
      cutting: { id: cutter.id },
      stitching: { id: makerId, name: 'Salma Tailors' },
      qc: { id: qc.id },
      finishing: { id: finisher.id },
    });
    const list = await ctx.http.get(`/v1/admin/orders?q=${detail.body.orderNumber}`).set(pm.auth).expect(200);
    const row = list.body.items.find((o: { id: string }) => o.id === orderId).items[0];
    expect(row).toMatchObject({ teamComplete: true, withName: expect.any(String) });

    // Pickers list people per station with their open jobs.
    const options = await ctx.http.get('/v1/admin/team-options').set(pm.auth).expect(200);
    expect(options.body.pattern.find((p: { id: string }) => p.id === technician.id).activeJobs).toBeGreaterThanOrEqual(1);
    expect(options.body.stitching.map((t: { id: string }) => t.id)).toContain(makerId);
    expect(options.body.cutting.map((c: { id: string }) => c.id)).not.toContain(technician.id);
  });

  it('hands the job to the assigned person at each station; nobody else sees it', async () => {
    const { itemId } = await placedItem();
    await assignTeam(ctx, pm, itemId, { pattern: technician, cutting: cutter, qc, finishing: finisher, makerId });
    await approve(itemId);

    // Pattern: only Rehana.
    expect(ids(await queue(technician, 'pattern', 'mine'))).toContain(itemId);
    expect(ids(await queue(otherTechnician, 'pattern'))).not.toContain(itemId);
    await ctx.http.get(`/v1/workshop/items/${itemId}`).set(otherTechnician.auth).expect(404);
    await advance(ctx, otherTechnician, itemId, { to: 'PATTERN' }).expect(404);
    const card = await ctx.http.get(`/v1/workshop/items/${itemId}`).set(technician.auth).expect(200);
    expect(card.body).toMatchObject({ assignedTo: { id: technician.id }, team: { cutting: { id: cutter.id }, qc: { id: qc.id } } });
    await advance(ctx, technician, itemId, { to: 'PATTERN' }).expect(200);
    await savePattern(ctx, technician, itemId);
    await advance(ctx, technician, itemId, { to: 'CUTTING' }).expect(200);

    // Cutting: straight to Imran, who starts it and cannot hand it back to a queue.
    expect(ids(await queue(cutter, 'cutting', 'mine'))).toContain(itemId);
    expect(ids(await queue(cutter2, 'cutting'))).not.toContain(itemId);
    const started = await ctx.http.post(`/v1/workshop/items/${itemId}/claim`).set(cutter.auth).expect(200);
    expect(started.body.actions.map((a: { kind: string }) => a.kind)).not.toContain('release');
    await ctx.http.post(`/v1/workshop/items/${itemId}/release`).set(cutter.auth).expect(422);

    // Imran is off sick: the manager moves cutting to Zaid; the started job goes to Zaid unstarted.
    await assignTeam(ctx, pm, itemId, { pattern: technician, cutting: cutter2, qc, finishing: finisher, makerId });
    expect((await ctx.db.orderItem.findUniqueOrThrow({ where: { id: itemId } })).claimedById).toBeNull();
    await ctx.http.get(`/v1/workshop/items/${itemId}`).set(cutter.auth).expect(404);
    await ctx.http.post(`/v1/workshop/items/${itemId}/claim`).set(cutter2.auth).expect(200);
    await cutItem(ctx, cutter2, itemId);

    // QC: only Ayesha may record it (the manager may too).
    await ctx.db.orderItem.update({ where: { id: itemId }, data: { stage: 'QC', claimedById: null } });
    const notYours = await ctx.http
      .post(`/v1/admin/order-items/${itemId}/qc`)
      .set(otherQc.auth)
      .send({ result: 'PASS', checklist: [{ item: 'Hem', ok: true }] })
      .expect(403);
    expect(notYours.body.error.code).toBe('NOT_ASSIGNED');
    expect(ids(await queue(otherQc, 'qc'))).not.toContain(itemId);
    await ctx.http.post(`/v1/admin/order-items/${itemId}/qc`).set(qc.auth).send({ result: 'PASS', checklist: [{ item: 'Hem', ok: true }] }).expect(201);

    // Finishing: Faiz.
    expect(ids(await queue(finisher, 'finishing', 'mine'))).toContain(itemId);
  });

  it('shows managers who is working on what, who is idle and what needs attention', async () => {
    const { itemId } = await placedItem(); // no team yet
    const assigned = await placedItem();
    await assignTeam(ctx, pm, assigned.itemId, { pattern: technician, cutting: cutter, qc, finishing: finisher, makerId });
    await approve(assigned.itemId);
    await advance(ctx, technician, assigned.itemId, { to: 'PATTERN' }).expect(200); // started

    await ctx.http.get('/v1/workshop/overview').set(cutter.auth).expect(403);
    const res = await ctx.http.get('/v1/workshop/overview').set(pm.auth).expect(200);
    const person = (id: string, station: string) =>
      res.body.people.find((p: { id: string; station: string }) => p.id === id && p.station === station);
    const stateOf = (id: string, station: string) =>
      person(id, station)?.jobs.find((j: { id: string }) => j.id === assigned.itemId)?.state;

    expect(stateOf(technician.id, 'pattern')).toBe('started');
    expect(person(technician.id, 'pattern').jobs.find((j: { id: string }) => j.id === assigned.itemId)).toMatchObject({
      startedBy: { id: technician.id },
      startedAt: expect.any(String),
      station: 'pattern',
    });
    expect(stateOf(cutter.id, 'cutting')).toBe('upcoming');
    expect(stateOf(makerId, 'stitching')).toBe('upcoming');
    expect(person(makerId, 'stitching')).toMatchObject({ kind: 'tailor', name: 'Salma Tailors' });
    expect(res.body.idle.map((p: { id: string }) => p.id)).toContain(otherTechnician.id);
    expect(res.body.teamMissing.map((j: { id: string }) => j.id)).toContain(itemId);
    expect(res.body.teamMissing.find((j: { id: string }) => j.id === itemId).missing).toEqual(['pattern', 'cutting', 'stitching', 'qc', 'finishing']);
    expect(res.body.inProgress).toBeGreaterThanOrEqual(1);
  });

  it('keeps older items without a team in the open queue', async () => {
    const { itemId } = await placedItem();
    await assignTeam(ctx, pm, itemId, { pattern: technician, cutting: cutter, qc, finishing: finisher, makerId });
    await approve(itemId);
    await ctx.db.workshopAssignment.deleteMany({ where: { orderItemId: itemId } });
    expect(ids(await queue(otherTechnician, 'pattern'))).toContain(itemId);
    await advance(ctx, otherTechnician, itemId, { to: 'PATTERN' }).expect(200);
  });
});
