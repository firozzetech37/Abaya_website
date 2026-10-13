import { createTestApp, designChoices, type TestContext, type TestUser, userWithRoles } from './helpers';

async function pendingOrder(ctx: TestContext, customer: TestUser) {
  const address = await ctx.http
    .post('/v1/me/addresses')
    .set(customer.auth)
    .send({ fullName: 'Test Buyer', phone: '9000011111', line1: '1 Test Lane', city: 'Pune', state: 'Maharashtra', pincode: '411001' })
    .expect(201);
  const { design, values, bands } = await designChoices(ctx, 'classic-nida-closed');
  await ctx.http
    .post('/v1/cart/items')
    .set(customer.auth)
    .send({ designId: design.id, selectedOptionValueIds: [values.nida, values.black, values.straight, values.buttons], sizeBandId: bands.M })
    .expect(201);
  return (await ctx.http.post('/v1/checkout').set(customer.auth).send({ addressId: address.body.id }).expect(201)).body;
}

describe('Development test payments (PAYMENT_PROVIDER=fake)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp({ testPayments: true });
  });
  afterAll(() => ctx.close());

  it('checkout pages can ask for the payment mode without logging in', async () => {
    expect((await ctx.http.get('/v1/payments/config').expect(200)).body).toEqual({ mode: 'test' });
  });

  it('checkout says test mode, and Simulate payment marks the order PAID like a real payment', async () => {
    const customer = await userWithRoles(ctx, ['CUSTOMER']);
    const checkout = await pendingOrder(ctx, customer);
    expect(checkout).toMatchObject({ paymentMode: 'test', razorpay: { keyId: 'test_mode' } });

    const stranger = await userWithRoles(ctx, ['CUSTOMER']);
    await ctx.http.post(`/v1/orders/${checkout.orderNumber}/simulate-payment`).set(stranger.auth).expect(404);

    const paid = await ctx.http.post(`/v1/orders/${checkout.orderNumber}/simulate-payment`).set(customer.auth).expect(200);
    expect(paid.body).toMatchObject({ status: 'PAID', items: [expect.objectContaining({ stage: 'PLACED' })] });
    const payment = await ctx.db.payment.findFirstOrThrow({ where: { orderId: checkout.orderId } });
    expect(payment).toMatchObject({ status: 'CAPTURED', method: 'test' });
    expect((await ctx.http.get('/v1/cart').set(customer.auth).expect(200)).body.items).toHaveLength(0);

    const again = await ctx.http.post(`/v1/orders/${checkout.orderNumber}/simulate-payment`).set(customer.auth).expect(422);
    expect(again.body.error.code).toBe('ALREADY_PAID');
  });
});

describe('Simulate payment with the real Razorpay gateway', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('does not exist (404) and the checkout says razorpay', async () => {
    expect((await ctx.http.get('/v1/payments/config').expect(200)).body).toEqual({ mode: 'razorpay' });
    const customer = await userWithRoles(ctx, ['CUSTOMER']);
    const checkout = await pendingOrder(ctx, customer);
    expect(checkout.paymentMode).toBe('razorpay');
    await ctx.http.post(`/v1/orders/${checkout.orderNumber}/simulate-payment`).set(customer.auth).expect(404);
    expect((await ctx.db.order.findUniqueOrThrow({ where: { id: checkout.orderId } })).status).toBe('PENDING_PAYMENT');
  });
});
