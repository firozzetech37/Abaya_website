import {
  advance,
  approvedItem,
  createTestApp,
  cutItem,
  paidOrder,
  savePattern,
  stationPhoto,
  type TestContext,
  type TestUser,
  userWithRoles, stitchItem, addTailor } from './helpers';

describe('Production workflow, refunds, privacy and audit (e2e)', () => {
  let ctx: TestContext;
  let pm: TestUser;
  let qc: TestUser;
  let support: TestUser;
  let designer: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    pm = await userWithRoles(ctx, ['PRODUCTION_MANAGER']);
    qc = await userWithRoles(ctx, ['QC']);
    support = await userWithRoles(ctx, ['SUPPORT']);
    designer = await userWithRoles(ctx, ['DESIGNER']);
    admin = await userWithRoles(ctx, ['SUPER_ADMIN']);
    await ctx.db.design.updateMany({ data: { makingCostInPaise: 90000 } });
  });
  afterAll(() => ctx.close());

  it('moves one abaya through all six workshop stations, each station doing only its own step', async () => {
    const technician = await userWithRoles(ctx, ['PATTERN_TECHNICIAN']);
    const cutter = await userWithRoles(ctx, ['CUTTER']);
    const finisher = await userWithRoles(ctx, ['FINISHER']);
    const logistics = await userWithRoles(ctx, ['LOGISTICS']);
    // The tailor is added in Staff & roles like every other station.
    const { tailor, makerId } = await addTailor(ctx, 'Station Tailors');

    const customer = await userWithRoles(ctx, ['CUSTOMER']);
    const { itemId, orderId, orderNumber } = await approvedItem(ctx, pm, customer, 'pleated-front-closed', {
      pattern: technician,
      cutting: cutter,
      qc,
      finishing: finisher,
      makerId,
    });
    const view = (user: TestUser) => ctx.http.get(`/v1/workshop/items/${itemId}`).set(user.auth);
    const kinds = (actions: { kind: string; to: string | null }[]) => actions.map((a) => (a.to ? `${a.kind}:${a.to}` : a.kind));
    const seen: unknown[] = []; // everything non-dispatch staff receive, checked for customer data at the end

    // 1. Pattern: waiting in the technician's queue; other stations cannot even see it.
    const queue = await ctx.http.get('/v1/workshop/stations/pattern/items').set(technician.auth).expect(200);
    expect(queue.body.map((i: { id: string }) => i.id)).toContain(itemId);
    const card = await view(technician).expect(200);
    expect(card.body).toMatchObject({ stage: 'SPEC_APPROVED', station: 'pattern', customer: null, shippingAddress: null });
    expect(kinds(card.body.actions)).toEqual(['advance:PATTERN', 'hold:ON_HOLD']);
    seen.push(queue.body, card.body);
    await view(cutter).expect(404);
    const notYours = await ctx.http.get('/v1/workshop/stations/pattern/items').set(cutter.auth).expect(403);
    expect(notYours.body.error.code).toBe('NOT_YOUR_STATION');

    // A question puts it on hold (reason required) and it resumes where it stopped.
    await ctx.http.post(`/v1/workshop/items/${itemId}/hold`).set(technician.auth).send({ reason: '' }).expect(400);
    const held = await ctx.http.post(`/v1/workshop/items/${itemId}/hold`).set(technician.auth).send({ reason: 'Bust 30 cm less than waist?' }).expect(200);
    expect(held.body).toMatchObject({ stage: 'ON_HOLD', heldFromStage: 'SPEC_APPROVED', holdReason: 'Bust 30 cm less than waist?' });
    const onHold = await ctx.http.get('/v1/workshop/stations/pattern/items?view=on-hold').set(technician.auth).expect(200);
    expect(onHold.body.map((i: { id: string }) => i.id)).toContain(itemId);
    await ctx.http.post(`/v1/workshop/items/${itemId}/resume`).set(technician.auth).send({ note: 'Customer confirmed' }).expect(200);

    // Starting the pattern takes the job; confirming it sends the item to cutting.
    const started = await advance(ctx, technician, itemId, { to: 'PATTERN' }).expect(200);
    expect(started.body.item).toMatchObject({ stage: 'PATTERN', claimedBy: { id: technician.id } });
    await advance(ctx, technician, itemId, { to: 'STITCHING' }).expect(422);
    const noPattern = await advance(ctx, technician, itemId, { to: 'CUTTING' }).expect(422);
    expect(noPattern.body.error.code).toBe('PATTERN_MISSING');
    await savePattern(ctx, technician, itemId, {}, 200);
    const confirmed = await advance(ctx, technician, itemId, { to: 'CUTTING', note: 'Pattern v1' }).expect(200);
    expect(confirmed.body.item).toBeNull(); // it has left the pattern station

    // 2. Cutting: straight to the assigned cutter, who starts it; other cutters never see it.
    const other = await userWithRoles(ctx, ['CUTTER']);
    await ctx.http.post(`/v1/workshop/items/${itemId}/claim`).set(other.auth).expect(404);
    await cutItem(ctx, other, itemId, {}, 404);
    const cutterJobs = await ctx.http.get('/v1/workshop/stations/cutting/items?view=mine').set(cutter.auth).expect(200);
    expect(cutterJobs.body.map((i: { id: string; assignedTo: { id: string } }) => [i.id, i.assignedTo.id])).toContainEqual([itemId, cutter.id]);
    await ctx.http.post(`/v1/workshop/items/${itemId}/claim`).set(cutter.auth).expect(200);
    // The cut is recorded through "Cutting done" (lot, metres, pieces, photo), not a bare step.
    const bare = await advance(ctx, cutter, itemId, { to: 'STITCHING', photoPath: await stationPhoto(ctx, cutter) }).expect(422);
    expect(bare.body.error.code).toBe('USE_CUTTING_FORM');
    await cutItem(ctx, cutter, itemId);

    // 3. Stitching: only the assigned tailor sees it.
    const mine = await ctx.http.get('/v1/workshop/stations/stitching/items').set(tailor.auth).expect(200);
    expect(mine.body.map((i: { id: string }) => i.id)).toEqual([itemId]);
    seen.push(mine.body, (await view(tailor).expect(200)).body);
    await stitchItem(ctx, tailor, itemId);

    // 4. QC: a fail goes back to the station that caused it (here: cutting), a pass on to finishing.
    const checklist = [{ item: 'Pleats even', ok: false }];
    await ctx.http
      .post(`/v1/admin/order-items/${itemId}/qc`)
      .set(qc.auth)
      .send({ result: 'FAIL', checklist, notes: 'Front panel cut off-grain', sendBackTo: 'CUTTING' })
      .expect(201);
    expect((await ctx.db.orderItem.findUniqueOrThrow({ where: { id: itemId } })).stage).toBe('CUTTING');
    await cutItem(ctx, cutter, itemId); // re-cut #2
    await stitchItem(ctx, tailor, itemId);
    await ctx.http.post(`/v1/admin/order-items/${itemId}/qc`).set(qc.auth).send({ result: 'PASS', checklist: [{ item: 'Pleats even', ok: true }] }).expect(201);
    expect((await ctx.db.orderItem.findUniqueOrThrow({ where: { id: itemId } })).stage).toBe('FINISHING');
    const twice = await ctx.http.post(`/v1/admin/order-items/${itemId}/qc`).set(qc.auth).send({ result: 'PASS', checklist: [{ item: 'x', ok: true }] }).expect(422);
    expect(twice.body.error.code).toBe('NOT_IN_QC');
    const payouts = await ctx.http.get(`/v1/admin/makers/${makerId}/payouts`).set(pm.auth).expect(200);
    expect(payouts.body).toHaveLength(1); // exactly one tailor payout, at the pass

    // 5. Finishing & packing: photo of the packed parcel.
    await advance(ctx, finisher, itemId, { to: 'PACKED' }).expect(422);
    seen.push((await view(finisher).expect(200)).body);
    await advance(ctx, finisher, itemId, { to: 'PACKED', photoPath: await stationPhoto(ctx, finisher) }).expect(200);

    // 6. Logistics: the only station that sees who and where; ships and records delivery.
    const dispatch = await view(logistics).expect(200);
    expect(dispatch.body.customer).toMatchObject({ phone: '9988776655' });
    expect(dispatch.body.shippingAddress).toMatchObject({ line1: '7 Residency Road', pincode: '560025' });
    expect(kinds(dispatch.body.actions)).toEqual(['claim', 'ship:SHIPPED']);
    await ctx.http
      .post(`/v1/admin/orders/${orderId}/ship`)
      .set(logistics.auth)
      .send({ orderItemIds: [itemId], carrier: 'Delhivery', trackingNumber: 'DL999' })
      .expect(201);
    await advance(ctx, logistics, itemId, { to: 'DELIVERED' }).expect(200);
    expect((await ctx.db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('COMPLETED');

    // Nobody but dispatch received the customer's name, email, phone or address.
    const text = JSON.stringify(seen);
    for (const secret of [customer.email, 'Sana Ali', '9988776655', 'Residency Road', '560025']) expect(text).not.toContain(secret);

    // The customer's timeline shows every step with photos; the audit trail has every change.
    const timeline = await ctx.http.get(`/v1/orders/${orderNumber}`).set(customer.auth).expect(200);
    // Workshop notes (hold question, QC finding) stay internal; the tracking number is shown.
    const notes = JSON.stringify(timeline.body.items[0].stageEvents.map((e: { note: string | null }) => e.note));
    expect(notes).not.toContain('Bust 30 cm');
    expect(notes).not.toContain('off-grain');
    expect(notes).toContain('DL999');
    expect(timeline.body.items[0].stageEvents.map((e: { toStage: string }) => e.toStage)).toEqual([
      'PLACED', 'SPEC_APPROVED', 'ON_HOLD', 'SPEC_APPROVED', 'PATTERN', 'CUTTING', 'STITCHING', 'QC', 'CUTTING', 'STITCHING', 'QC',
      'FINISHING', 'PACKED', 'SHIPPED', 'DELIVERED',
    ]);
    const audit = await ctx.http.get(`/v1/admin/audit-logs?entityType=OrderItem&entityId=${itemId}&limit=50`).set(admin.auth).expect(200);
    expect(audit.body.items.map((a: { action: string }) => a.action)).toEqual(
      expect.arrayContaining(['order.stage_changed', 'order.maker_assigned', 'tech_pack.approved', 'qc.recorded']),
    );
  });

  it('shows each person only their stations, with counts', async () => {
    const both = await userWithRoles(ctx, ['QC', 'FINISHER']);
    const summary = await ctx.http.get('/v1/workshop/summary').set(both.auth).expect(200);
    expect(summary.body.map((s: { station: string }) => s.station)).toEqual(['qc', 'finishing']);
    expect((await ctx.http.get('/v1/workshop/summary').set(pm.auth).expect(200)).body).toHaveLength(6);
    await ctx.http.get('/v1/workshop/summary').set(designer.auth).expect(403);
    await ctx.http.get('/v1/workshop/summary').set(support.auth).expect(403);
    // Workshop-only roles stay out of admin-panel data.
    const cutter = await userWithRoles(ctx, ['CUTTER']);
    await ctx.http.get('/v1/admin/orders').set(cutter.auth).expect(403);
    await ctx.http.get('/v1/admin/designs').set(cutter.auth).expect(403);
    await ctx.http.get('/v1/admin/dashboard').set(cutter.auth).expect(403);
  });

  it('gates customer contact details by role and keeps designers out of orders', async () => {
    const customer = await userWithRoles(ctx, ['CUSTOMER']);
    const order = await paidOrder(ctx, customer, 'classic-nida-closed');
    const asQc = await ctx.http.get(`/v1/admin/orders/${order.orderId}`).set(qc.auth).expect(200);
    expect(asQc.body.customer).toBeNull();
    expect(asQc.body.shippingAddress).toBeNull();
    const asSupport = await ctx.http.get(`/v1/admin/orders/${order.orderId}`).set(support.auth).expect(200);
    expect(asSupport.body.customer.email).toBe(customer.email);
    expect(asSupport.body.shippingAddress.line1).toBe('7 Residency Road');
    await ctx.http.get('/v1/admin/orders').set(designer.auth).expect(403);
    await ctx.http.get('/v1/admin/audit-logs').set(support.auth).expect(403);
    await ctx.http.get('/v1/admin/audit-logs').set(admin.auth).expect(200);

    const list = await ctx.http.get(`/v1/admin/orders?q=${encodeURIComponent(customer.email)}`).set(support.auth).expect(200);
    expect(list.body.items.map((o: { id: string }) => o.id)).toContain(order.orderId);
    const dashboard = await ctx.http.get('/v1/admin/dashboard').set(qc.auth).expect(200);
    expect(dashboard.body.itemsByStage.PLACED).toBeGreaterThan(0);
  });

  it('lists customers with order totals for SUPPORT, and their orders by customer', async () => {
    const buyer = await userWithRoles(ctx, ['CUSTOMER'], 'buyer');
    const browser = await userWithRoles(ctx, ['CUSTOMER'], 'browser');
    const order = await paidOrder(ctx, buyer, 'classic-nida-closed');

    await ctx.http.get('/v1/admin/customers').set(qc.auth).expect(403);
    await ctx.http.get('/v1/admin/customers').set(pm.auth).expect(403);

    const found = await ctx.http.get(`/v1/admin/customers?q=${encodeURIComponent(buyer.email)}`).set(support.auth).expect(200);
    expect(found.body.items).toHaveLength(1);
    expect(found.body.items[0]).toMatchObject({
      id: buyer.id,
      email: buyer.email,
      isStaff: false,
      orderCount: 1,
      totalSpentInPaise: order.totalInPaise,
    });
    expect(found.body.items[0].lastOrderAt).not.toBeNull();

    // Customers without orders are listed too; staff-only accounts are not customers.
    const quiet = await ctx.http.get(`/v1/admin/customers?q=${encodeURIComponent(browser.email)}`).set(admin.auth).expect(200);
    expect(quiet.body.items[0]).toMatchObject({ id: browser.id, orderCount: 0, totalSpentInPaise: 0, lastOrderAt: null });
    const staff = await ctx.http.get(`/v1/admin/customers?q=${encodeURIComponent(support.email)}`).set(admin.auth).expect(200);
    expect(staff.body.items).toHaveLength(0);

    // A checkout that was never paid (closed) is not an order: the count stays at one.
    await ctx.db.order.create({
      data: {
        orderNumber: `AB-2026-9${String(Date.now()).slice(-5)}`,
        userId: buyer.id,
        status: 'CANCELLED',
        subtotalInPaise: 100000,
        totalInPaise: 100000,
        shippingAddress: {},
      },
    });
    const still = await ctx.http.get(`/v1/admin/customers?q=${encodeURIComponent(buyer.email)}`).set(support.auth).expect(200);
    expect(still.body.items[0].orderCount).toBe(1);

    // Real staff sign in as customers first and keep CUSTOMER: still not counted as customers.
    const shopper = await userWithRoles(ctx, ['CUSTOMER', 'CUTTER'], 'staff-shopper');
    const hidden = await ctx.http.get(`/v1/admin/customers?q=${encodeURIComponent(shopper.email)}`).set(admin.auth).expect(200);
    expect(hidden.body.items).toHaveLength(0);
    const asStaff = await ctx.http.get(`/v1/admin/customers?audience=staff&q=${encodeURIComponent(shopper.email)}`).set(admin.auth).expect(200);
    expect(asStaff.body.items[0]).toMatchObject({ id: shopper.id, isStaff: true });
    const everyone = await ctx.http.get(`/v1/admin/customers?audience=all&q=${encodeURIComponent(shopper.email)}`).set(admin.auth).expect(200);
    expect(everyone.body.items).toHaveLength(1);

    // Analysis: the buyer counts as a customer with revenue; staff are counted apart.
    const analytics = await ctx.http.get('/v1/admin/customers/analytics').set(support.auth).expect(200);
    expect(analytics.body).toMatchObject({ accounts: expect.any(Number), buyers: expect.any(Number), newThisMonth: expect.any(Number) });
    expect(analytics.body.revenueInPaise).toBeGreaterThanOrEqual(order.totalInPaise);
    expect(analytics.body.topCustomers.map((t: { id: string }) => t.id)).toContain(buyer.id);
    const staffAnalytics = await ctx.http.get('/v1/admin/customers/analytics?audience=staff').set(support.auth).expect(200);
    expect(staffAnalytics.body.topCustomers.map((t: { id: string }) => t.id)).not.toContain(buyer.id);
    await ctx.http.get('/v1/admin/customers/analytics').set(pm.auth).expect(403);

    // The admin still sees the closed checkout (labelled "Payment not completed": no placedAt).
    const orders = await ctx.http.get(`/v1/admin/orders?customerId=${buyer.id}`).set(support.auth).expect(200);
    expect(orders.body.items.map((o: { id: string }) => o.id)).toContain(order.orderId);
    const unpaid = orders.body.items.filter((o: { id: string }) => o.id !== order.orderId);
    expect(unpaid).toEqual([expect.objectContaining({ status: 'CANCELLED', placedAt: null })]);
  });

  it('cancels with a refund: SUPPORT up to ₹5,000, larger refunds need SUPER_ADMIN', async () => {
    const customer = await userWithRoles(ctx, ['CUSTOMER']);
    const order = await paidOrder(ctx, customer, 'eid-lace-butterfly', 2); // ₹5,499 base → over the support limit
    const items = (await ctx.http.get(`/v1/admin/orders/${order.orderId}`).set(support.auth).expect(200)).body.items;

    await ctx.http.post(`/v1/admin/order-items/${items[0].id}/cancel`).set(pm.auth).send({ reason: 'Customer asked' }).expect(403);
    const denied = await ctx.http.post(`/v1/admin/order-items/${items[0].id}/cancel`).set(support.auth).send({ reason: 'Customer asked' }).expect(403);
    expect(denied.body.error.code).toBe('REFUND_LIMIT_EXCEEDED');
    expect((await ctx.db.orderItem.findUniqueOrThrow({ where: { id: items[0].id } })).stage).toBe('PLACED');

    await ctx.http.post(`/v1/admin/order-items/${items[0].id}/cancel`).set(admin.auth).send({ reason: 'Customer asked' }).expect(200);
    await ctx.http.post(`/v1/admin/order-items/${items[1].id}/cancel`).set(admin.auth).send({ reason: 'Customer asked' }).expect(200);
    expect(ctx.razorpay.refunds.slice(-2).map((r) => r.amountInPaise)).toEqual([items[0].unitPriceInPaise, items[1].unitPriceInPaise]);

    const after = await ctx.db.order.findUniqueOrThrow({ where: { id: order.orderId }, include: { payments: { include: { refunds: true } } } });
    expect(after.status).toBe('REFUNDED');
    expect(after.payments[0]!.status).toBe('REFUNDED');
    expect(after.payments[0]!.refunds).toHaveLength(2);

    // A small partial refund by support is within the limit.
    const small = await paidOrder(ctx, customer, 'classic-nida-closed');
    const refund = await ctx.http.post(`/v1/admin/orders/${small.orderId}/refunds`).set(support.auth).send({ amountInPaise: 20000, reason: 'Delayed delivery goodwill' }).expect(201);
    expect(refund.body).toMatchObject({ status: 'PARTIALLY_REFUNDED', refundedInPaise: 20000 });
  });

  it('exports and deletes a customer account, keeping anonymised orders', async () => {
    const customer = await userWithRoles(ctx, ['CUSTOMER']);
    const order = await paidOrder(ctx, customer, 'kaftan-lounge');
    const exported = await ctx.http.post('/v1/me/data-export').set(customer.auth).expect(200);
    expect(exported.body.profile.email).toBe(customer.email);
    expect(exported.body.orders).toHaveLength(1);

    // Blocked while the abaya is being made.
    const blocked = await ctx.http.delete('/v1/me').set(customer.auth).send({ confirm: 'DELETE' }).expect(422);
    expect(blocked.body.error.code).toBe('ACTIVE_ORDERS');
    const itemId = (await ctx.db.orderItem.findFirstOrThrow({ where: { orderId: order.orderId } })).id;
    await ctx.http.post(`/v1/admin/order-items/${itemId}/cancel`).set(admin.auth).send({ reason: 'Customer closing account' }).expect(200);

    await ctx.http.delete('/v1/me').set(customer.auth).send({}).expect(400);
    await ctx.http.delete('/v1/me').set(customer.auth).send({ confirm: 'DELETE' }).expect(204);
    const user = await ctx.db.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(user).toMatchObject({ email: null, name: null, phone: null, isActive: false });
    expect(await ctx.db.address.count({ where: { userId: customer.id } })).toBe(0);
    const kept = await ctx.db.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(kept.shippingAddress).toMatchObject({ fullName: '[deleted]', city: 'Bengaluru' });
    // The old token no longer works.
    await ctx.http.get('/v1/me').set(customer.auth).expect(401);
  });
});
