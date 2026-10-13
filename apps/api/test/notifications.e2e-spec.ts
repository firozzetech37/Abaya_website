import { createTestApp, paidOrder, signWebhook, type TestContext, type TestUser, toStitching, userWithRoles, stitchItem, addTailor, approvedItem } from './helpers';

const TOKEN_A = 'ExponentPushToken[customer-phone-aaaaaaaa]';
const TOKEN_M = 'ExponentPushToken[tailor-phone-mmmmmmmm]';

describe('Notifications: outbox, WhatsApp opt-in, push devices (e2e)', () => {
  let ctx: TestContext;
  let pm: TestUser;
  let qc: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    pm = await userWithRoles(ctx, ['PRODUCTION_MANAGER']);
    qc = await userWithRoles(ctx, ['QC']);
    // Earlier test files leave their notifications queued (the worker is off in tests); start clean
    // so each flush below only has this file's messages to send.
    await ctx.db.notification.updateMany({ where: { status: 'QUEUED' }, data: { status: 'SENT' } });
  });
  afterAll(() => ctx.close());

  const rowsFor = (userId: string) => ctx.db.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

  it('order confirmation goes to email + push; WhatsApp only after opt-in with a phone', async () => {
    const shy = await userWithRoles(ctx, ['CUSTOMER']);
    await ctx.http.post('/v1/me/devices').set(shy.auth).send({ token: TOKEN_A, platform: 'ANDROID', app: 'CUSTOMER' }).expect(204);
    await paidOrder(ctx, shy, 'classic-nida-closed');
    expect((await rowsFor(shy.id)).map((r) => r.channel).sort()).toEqual(['EMAIL', 'PUSH']);

    const keen = await userWithRoles(ctx, ['CUSTOMER']);
    await ctx.http.patch('/v1/me').set(keen.auth).send({ name: 'Zainab Ahmed', phone: '9876012345' }).expect(200);
    await ctx.http
      .post('/v1/me/consents')
      .set(keen.auth)
      .send({ version: '2026-10-01', consents: [{ purpose: 'WHATSAPP_UPDATES', granted: true }] })
      .expect(200);
    const order = await paidOrder(ctx, keen, 'butterfly-flow');
    const rows = await rowsFor(keen.id);
    expect(rows.map((r) => r.channel).sort()).toEqual(['EMAIL', 'PUSH', 'WHATSAPP']);
    expect(rows.every((r) => r.status === 'QUEUED')).toBe(true);

    // The worker sends them; nothing is sent twice.
    ctx.channels.whatsapp.sent.length = 0;
    await ctx.flushNotifications();
    await ctx.flushNotifications();
    expect((await rowsFor(keen.id)).every((r) => r.status === 'SENT' && r.sentAt)).toBe(true);
    const wa = ctx.channels.whatsapp.sent.filter((s) => s.userId === keen.id);
    expect(wa).toEqual([
      { userId: keen.id, payload: { phone: '9876012345', template: 'order_confirmed', language: 'en', params: ['Zainab', expect.stringContaining('₹'), order.orderNumber] } },
    ]);
    const push = ctx.channels.push.sent.find((s) => s.userId === shy.id);
    expect(push?.payload).toMatchObject({ app: 'CUSTOMER', title: 'Order confirmed', url: expect.stringMatching(/^abaya:\/\/orders\//) });

    // Opting out stops WhatsApp for later updates.
    await ctx.http
      .post('/v1/me/consents')
      .set(keen.auth)
      .send({ version: '2026-10-01', consents: [{ purpose: 'WHATSAPP_UPDATES', granted: false }] })
      .expect(200);
    await paidOrder(ctx, keen, 'kaftan-lounge');
    expect((await rowsFor(keen.id)).filter((r) => r.channel === 'WHATSAPP')).toHaveLength(1);
  });

  it('a replayed payment webhook never queues the confirmation twice', async () => {
    const customer = await userWithRoles(ctx, ['CUSTOMER']);
    const order = await paidOrder(ctx, customer, 'classic-nida-closed');
    const payment = await ctx.db.payment.findFirstOrThrow({ where: { orderId: order.orderId } });
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: payment.providerPaymentId, order_id: payment.providerOrderId, amount: order.totalInPaise, method: 'card' } } },
    });
    await ctx.http.post('/v1/payments/webhook').set('content-type', 'application/json').set('x-razorpay-signature', signWebhook(body)).send(body).expect(200);
    expect((await rowsFor(customer.id)).filter((r) => r.template === 'order.placed')).toHaveLength(2); // email + push
  });

  it('retries temporary failures with backoff and stops on permanent ones', async () => {
    const customer = await userWithRoles(ctx, ['CUSTOMER']);
    await paidOrder(ctx, customer, 'classic-nida-closed');
    // Clear everyone else's queue, including rows without a user (NOT userId = x skips NULLs in SQL).
    await ctx.db.notification.updateMany({
      where: { status: 'QUEUED', OR: [{ userId: null }, { NOT: { userId: customer.id } }] },
      data: { status: 'SENT' },
    });

    ctx.channels.email.fail = 'temporary';
    ctx.channels.push.fail = 'permanent';
    try {
      await ctx.flushNotifications();
    } finally {
      ctx.channels.email.fail = 'none';
      ctx.channels.push.fail = 'none';
    }
    const [email, push] = ['EMAIL', 'PUSH'].map((c) => ctx.db.notification.findFirstOrThrow({ where: { userId: customer.id, channel: c as 'EMAIL' } }));
    const e = await email!;
    expect(e).toMatchObject({ status: 'QUEUED', attempts: 1, error: 'provider timeout' });
    expect(e.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 50_000); // ~1 minute later
    expect(await push!).toMatchObject({ status: 'FAILED', error: 'invalid number' });

    // When the retry time comes, it goes out.
    await ctx.db.notification.update({ where: { id: e.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await ctx.flushNotifications();
    expect(await ctx.db.notification.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({ status: 'SENT', attempts: 2 });
  });

  it('customers do not hear about QC rework; the retired maker app cannot register', async () => {
    const { tailor, makerId } = await addTailor(ctx, 'Push Tailors', 'push-tailor');
    await ctx.http.post('/v1/me/devices').set(tailor.auth).send({ token: TOKEN_M, platform: 'ANDROID', app: 'MAKER' }).expect(400);

    const customer = await userWithRoles(ctx, ['CUSTOMER']);
    const { itemId } = await approvedItem(ctx, pm, customer, 'classic-nida-closed', { makerId, qc });
    await toStitching(ctx, pm, itemId);
    await stitchItem(ctx, tailor, itemId);
    const customerBefore = (await rowsFor(customer.id)).length;
    await ctx.http
      .post(`/v1/admin/order-items/${itemId}/qc`)
      .set(qc.auth)
      .send({ result: 'FAIL', checklist: [{ item: 'Hem', ok: false }], notes: 'Hem uneven' })
      .expect(201);
    expect((await rowsFor(customer.id)).length).toBe(customerBefore);
    // Tailors see new work and rework in the workshop queue; no pushes are queued for them.
    expect(await rowsFor(tailor.id)).toHaveLength(0);
  });
});
