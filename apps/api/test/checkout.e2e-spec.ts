import {
  createTestApp,
  designChoices,
  signPayment,
  signWebhook,
  type TestContext,
  type TestUser,
  userWithRoles,
} from './helpers';

const address = {
  fullName: 'Mariam Siddiqui',
  phone: '9123456780',
  line1: '21 Charminar Road',
  city: 'Hyderabad',
  state: 'Telangana',
  pincode: '500002',
};

const measurements = {
  name: 'Me',
  heightCm: 162,
  bustCm: 92,
  waistCm: 78,
  hipCm: 100,
  shoulderCm: 38,
  sleeveLengthCm: 58,
  fullLengthCm: 138,
};

function capturedWebhook(providerOrderId: string, paymentId: string, amount: number): string {
  return JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: paymentId, order_id: providerOrderId, amount, method: 'upi', status: 'captured' } } },
  });
}

describe('Cart, checkout and payments (e2e)', () => {
  let ctx: TestContext;
  let customer: TestUser;
  let addressId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    customer = await userWithRoles(ctx, ['CUSTOMER']);
    addressId = (await ctx.http.post('/v1/me/addresses').set(customer.auth).send(address).expect(201)).body.id;
  });
  afterAll(() => ctx.close());

  it('bag → checkout → signed webhook → order PAID; tampered client prices are ignored', async () => {
    const { design, values, bands } = await designChoices(ctx, 'butterfly-flow');
    const profile = await ctx.http.post('/v1/me/measurements').set(customer.auth).send(measurements).expect(201);

    // Standard size, quantity 2, with an attempt to set our own price (Zod drops unknown keys).
    await ctx.http
      .post('/v1/cart/items')
      .set(customer.auth)
      .send({
        designId: design.id,
        selectedOptionValueIds: [values.satin, values.maroon, values.bell, values.zip, values.hijab],
        sizeBandId: bands.L,
        quantity: 2,
        unitPriceInPaise: 100,
        totalInPaise: 100,
      })
      .expect(201);
    // Made to measure.
    await ctx.http
      .post('/v1/cart/items')
      .set(customer.auth)
      .send({ designId: design.id, selectedOptionValueIds: [values.nida, values.black, values.straight, values.open], measurementProfileId: profile.body.id })
      .expect(201);

    const cart = await ctx.http.get('/v1/cart').set(customer.auth).expect(200);
    // 3,299 + satin 600 + bell 200 + zip 200 + hijab 499 = 4,798 × 2; and 3,299 + custom 300 = 3,599
    expect(cart.body.items.map((i: { price: { totalInPaise: number } }) => i.price.totalInPaise)).toEqual([959600, 359900]);
    expect(cart.body).toMatchObject({ subtotalInPaise: 1319500, canCheckout: true });

    const checkout = await ctx.http
      .post('/v1/checkout')
      .set(customer.auth)
      .send({ addressId, customerNote: 'Please pack carefully', totalInPaise: 1 })
      .expect(201);
    expect(checkout.body.totalInPaise).toBe(1319500);
    expect(checkout.body.orderNumber).toMatch(/^AB-\d{4}-\d{6}$/);
    expect(checkout.body.razorpay).toMatchObject({ keyId: 'rzp_test_e2e', amount: 1319500, currency: 'INR' });

    // One OrderItem per abaya (2 + 1), each with snapshots.
    const order = await ctx.db.order.findUniqueOrThrow({ where: { id: checkout.body.orderId }, include: { items: true } });
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.items).toHaveLength(3);
    expect(order.items.map((i) => i.unitPriceInPaise).sort()).toEqual([359900, 479800, 479800]);
    const custom = order.items.find((i) => i.sizeBandCode === 'CUSTOM')!;
    expect(custom.measurementsSnapshot).toMatchObject({ bustCm: 92, fullLengthCm: 138, profileName: 'Me' });
    expect(custom.designSnapshot).toMatchObject({ slug: 'butterfly-flow' });

    // Editing the profile later never changes the order.
    await ctx.http.patch(`/v1/me/measurements/${profile.body.id}`).set(customer.auth).send({ bustCm: 99 }).expect(200);

    // Webhook with a wrong signature is rejected and changes nothing.
    const providerOrderId = checkout.body.razorpay.orderId as string;
    const body = capturedWebhook(providerOrderId, 'pay_e2e_001', 1319500);
    await ctx.http
      .post('/v1/payments/webhook')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', signWebhook(body, 'wrong-secret'))
      .send(body)
      .expect(400);
    expect((await ctx.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');

    // A valid webhook marks it PAID; a replay changes nothing.
    for (let i = 0; i < 2; i += 1) {
      await ctx.http
        .post('/v1/payments/webhook')
        .set('content-type', 'application/json')
        .set('x-razorpay-signature', signWebhook(body))
        .send(body)
        .expect(200);
    }
    const paid = await ctx.db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: { include: { stageEvents: true } } } });
    expect(paid.status).toBe('PAID');
    expect(paid.placedAt).not.toBeNull();
    expect(paid.items.every((i) => i.stage === 'PLACED' && i.stageEvents.length === 1)).toBe(true);
    const payment = await ctx.db.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment).toMatchObject({ status: 'CAPTURED', providerPaymentId: 'pay_e2e_001', method: 'upi' });
    expect((await ctx.db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } })).items.find((i) => i.sizeBandCode === 'CUSTOM')!.measurementsSnapshot).toMatchObject({ bustCm: 92 });

    // The bag is emptied; the order shows up for the customer and only for them.
    expect((await ctx.http.get('/v1/cart').set(customer.auth).expect(200)).body.items).toHaveLength(0);
    const list = await ctx.http.get('/v1/orders').set(customer.auth).expect(200);
    expect(list.body.items[0]).toMatchObject({ orderNumber: checkout.body.orderNumber, status: 'PAID', headlineStage: 'PLACED', itemCount: 3 });
    const detail = await ctx.http.get(`/v1/orders/${checkout.body.orderNumber}`).set(customer.auth).expect(200);
    expect(detail.body.items[0].stageEvents[0]).toMatchObject({ toStage: 'PLACED' });

    const stranger = await userWithRoles(ctx, ['CUSTOMER']);
    await ctx.http.get(`/v1/orders/${checkout.body.orderNumber}`).set(stranger.auth).expect(404);
  });

  it('client-side verify: bad signature 400, good signature captures once', async () => {
    const { design, values, bands } = await designChoices(ctx, 'classic-nida-closed');
    await ctx.http
      .post('/v1/cart/items')
      .set(customer.auth)
      .send({ designId: design.id, selectedOptionValueIds: [values.nida, values.black, values.straight, values.buttons], sizeBandId: bands.S })
      .expect(201);
    const checkout = await ctx.http.post('/v1/checkout').set(customer.auth).send({ addressId }).expect(201);
    const providerOrderId = checkout.body.razorpay.orderId as string;

    await ctx.http
      .post('/v1/payments/verify')
      .set(customer.auth)
      .send({ razorpayOrderId: providerOrderId, razorpayPaymentId: 'pay_e2e_002', razorpaySignature: 'forged' })
      .expect(400);
    const ok = await ctx.http
      .post('/v1/payments/verify')
      .set(customer.auth)
      .send({ razorpayOrderId: providerOrderId, razorpayPaymentId: 'pay_e2e_002', razorpaySignature: signPayment(providerOrderId, 'pay_e2e_002') })
      .expect(200);
    expect(ok.body.status).toBe('CAPTURED');

    // The webhook arriving afterwards is harmless.
    const body = capturedWebhook(providerOrderId, 'pay_e2e_002', checkout.body.totalInPaise);
    await ctx.http.post('/v1/payments/webhook').set('content-type', 'application/json').set('x-razorpay-signature', signWebhook(body)).send(body).expect(200);
    const events = await ctx.db.orderStageEvent.count({ where: { orderItem: { orderId: checkout.body.orderId } } });
    expect(events).toBe(1);
    expect((await ctx.db.order.findUniqueOrThrow({ where: { id: checkout.body.orderId } })).status).toBe('PAID');
  });

  it('closes a checkout unpaid after 24 hours: hidden from the customer, not counted, revived by a late payment', async () => {
    const { design, values, bands } = await designChoices(ctx, 'classic-nida-closed');
    const addToBag = () =>
      ctx.http
        .post('/v1/cart/items')
        .set(customer.auth)
        .send({ designId: design.id, selectedOptionValueIds: [values.nida, values.black, values.straight, values.buttons], sizeBandId: bands.S })
        .expect(201);
    await addToBag();
    const abandoned = await ctx.http.post('/v1/checkout').set(customer.auth).send({ addressId }).expect(201);
    await addToBag();
    const late = await ctx.http.post('/v1/checkout').set(customer.auth).send({ addressId }).expect(201);

    // Not yet: a checkout has 24 hours.
    expect(await ctx.expireCheckouts(new Date(Date.now() + 23 * 3_600_000))).toBe(0);
    const closed = await ctx.expireCheckouts(new Date(Date.now() + 25 * 3_600_000));
    expect(closed).toBeGreaterThanOrEqual(2);
    const order = await ctx.db.order.findUniqueOrThrow({ where: { id: abandoned.body.orderId } });
    expect(order).toMatchObject({ status: 'CANCELLED', placedAt: null });
    const audit = await ctx.db.auditLog.findFirstOrThrow({ where: { entityId: abandoned.body.orderId, action: 'order.cancelled' } });
    expect(audit.after).toMatchObject({ reason: 'payment not completed within 24 hours' });

    // The customer never placed it: not in their orders.
    const mine = await ctx.http.get('/v1/orders').set(customer.auth).expect(200);
    expect(mine.body.items.map((o: { id: string }) => o.id)).not.toContain(abandoned.body.orderId);

    // A payment that still arrives is accepted: the order is placed after all.
    const body = capturedWebhook(late.body.razorpay.orderId, 'pay_e2e_late', late.body.totalInPaise);
    await ctx.http.post('/v1/payments/webhook').set('content-type', 'application/json').set('x-razorpay-signature', signWebhook(body)).send(body).expect(200);
    const revived = await ctx.db.order.findUniqueOrThrow({ where: { id: late.body.orderId } });
    expect(revived.status).toBe('PAID');
    expect(revived.placedAt).not.toBeNull();
    const after = await ctx.http.get('/v1/orders').set(customer.auth).expect(200);
    expect(after.body.items.map((o: { id: string }) => o.id)).toContain(late.body.orderId);
  });

  it('never marks an order paid for the wrong amount', async () => {
    const { design, values, bands } = await designChoices(ctx, 'kaftan-lounge');
    await ctx.http
      .post('/v1/cart/items')
      .set(customer.auth)
      .send({ designId: design.id, selectedOptionValueIds: [values.nida, values.black, values.straight, values.buttons], sizeBandId: bands.M })
      .expect(201);
    const checkout = await ctx.http.post('/v1/checkout').set(customer.auth).send({ addressId }).expect(201);
    const body = capturedWebhook(checkout.body.razorpay.orderId, 'pay_e2e_003', 100);
    await ctx.http.post('/v1/payments/webhook').set('content-type', 'application/json').set('x-razorpay-signature', signWebhook(body)).send(body).expect(422);
    expect((await ctx.db.order.findUniqueOrThrow({ where: { id: checkout.body.orderId } })).status).toBe('PENDING_PAYMENT');
  });

  it('refuses checkout for an empty bag, someone else’s address, or an unpublished design', async () => {
    const other = await userWithRoles(ctx, ['CUSTOMER']);
    await ctx.http.post('/v1/checkout').set(other.auth).send({ addressId }).expect(404);
    const otherAddress = (await ctx.http.post('/v1/me/addresses').set(other.auth).send(address).expect(201)).body.id;
    const empty = await ctx.http.post('/v1/checkout').set(other.auth).send({ addressId: otherAddress }).expect(422);
    expect(empty.body.error.code).toBe('CART_EMPTY');

    const { design, values, bands } = await designChoices(ctx, 'everyday-open-front');
    await ctx.http
      .post('/v1/cart/items')
      .set(other.auth)
      .send({ designId: design.id, selectedOptionValueIds: [values.nida, values.black, values.straight, values.buttons], sizeBandId: bands.M })
      .expect(201);
    await ctx.db.design.update({ where: { id: design.id }, data: { status: 'ARCHIVED' } });
    try {
      const cart = await ctx.http.get('/v1/cart').set(other.auth).expect(200);
      expect(cart.body.canCheckout).toBe(false);
      expect(cart.body.items[0].problem).toMatch(/not available/);
      const blocked = await ctx.http.post('/v1/checkout').set(other.auth).send({ addressId: otherAddress }).expect(422);
      expect(blocked.body.error.code).toBe('CART_NOT_READY');
    } finally {
      await ctx.db.design.update({ where: { id: design.id }, data: { status: 'PUBLISHED' } });
    }
  });
});
