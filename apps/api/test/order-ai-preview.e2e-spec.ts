import { CheckoutExpiryService } from '../src/modules/orders/application/checkout-expiry.service';
import { createTestApp, designChoices, paidOrder, type TestContext, type TestUser, userWithRoles } from './helpers';

/**
 * Her website AI preview goes with her order to the admin and workshop (a private copy that
 * outlives her one-hour copy); never a try-on; deleted 90 days after delivery.
 */
describe('AI preview kept with the order (e2e)', () => {
  let ctx: TestContext;
  let sana: TestUser;
  let pm: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    sana = await userWithRoles(ctx, ['CUSTOMER'], 'order-ai-sana');
    pm = await userWithRoles(ctx, ['PRODUCTION_MANAGER'], 'order-ai-pm');
  });
  afterAll(() => ctx.close());

  it('copies her matching preview into the order for staff only, and keeps it after her hour', async () => {
    // She previews exactly the choices she then orders (paidOrder: crepe, navy, cuffed sleeves, snaps).
    const { design, values } = await designChoices(ctx, 'classic-nida-closed');
    const choices = [values.crepe, values.navy, values.cuffed, values.snaps];
    const preview = await ctx.http.post('/v1/me/try-on/previews').set(sana.auth).send({ designId: design.id, selectedOptionValueIds: choices }).expect(201);
    await ctx.runTryOn();
    const own = await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: preview.body.id } });
    expect(own.resultPath).toEqual(expect.any(String));

    const order = await paidOrder(ctx, sana, 'classic-nida-closed');
    const [item] = await ctx.db.orderItem.findMany({ where: { orderId: order.orderId } });
    expect(item!.aiPreviewPath).toMatch(/^order-ai-previews\//);
    expect(item!.aiPreviewInspiration).toBe(false);
    expect(await ctx.storage.get('private', item!.aiPreviewPath!)).not.toBeNull();
    // The bag's copy went with the bag once she paid.
    expect([...ctx.storage.files.keys()].filter((k) => k.startsWith('private/order-ai-previews/'))).toEqual([`private/${item!.aiPreviewPath}`]);

    // Staff see it next to the design photo; she does not (hers is gone after the hour).
    const admin = await ctx.http.get(`/v1/admin/orders/${order.orderId}`).set(pm.auth).expect(200);
    expect(admin.body.items[0].aiPreview).toEqual({ url: expect.stringContaining(item!.aiPreviewPath!), inspirationOnly: false });
    expect(admin.body.items[0].design.primaryImageUrl).toEqual(expect.any(String));
    const mine = await ctx.http.get(`/v1/orders/${order.orderNumber}`).set(sana.auth).expect(200);
    expect(mine.body.items[0].aiPreview ?? null).toBeNull();
    const card = await ctx.http.get(`/v1/workshop/items/${item!.id}`).set(pm.auth).expect(200);
    expect(card.body.aiPreview).toEqual({ url: expect.any(String), inspirationOnly: false });

    // Two hours on: her own copy is deleted, the order's stays.
    await ctx.runTryOn(new Date(Date.now() + 2 * 3_600_000));
    expect((await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: preview.body.id } })).purgedAt).toEqual(expect.any(Date));
    expect(await ctx.storage.get('private', item!.aiPreviewPath!)).not.toBeNull();

    // Delivered 91 days ago: the order's copy is deleted too.
    await ctx.db.orderItem.update({ where: { id: item!.id }, data: { stage: 'DELIVERED' } });
    await ctx.db.orderStageEvent.create({
      data: { orderItemId: item!.id, fromStage: 'SHIPPED', toStage: 'DELIVERED', createdAt: new Date(Date.now() - 91 * 86_400_000) },
    });
    expect(await ctx.app.get(CheckoutExpiryService).deleteOldAiPreviews()).toBe(1);
    expect((await ctx.db.orderItem.findUniqueOrThrow({ where: { id: item!.id } })).aiPreviewPath).toBeNull();
    expect(await ctx.storage.get('private', item!.aiPreviewPath!)).toBeNull();
  });

  it('never keeps a try-on, and orders without a preview have none', async () => {
    const lina = await userWithRoles(ctx, ['CUSTOMER'], 'order-ai-lina');
    const { design } = await designChoices(ctx, 'classic-nida-closed');
    // A try-on ("a model like me") of this design: not attached to her order.
    await ctx.http
      .post('/v1/me/try-on/try-ons')
      .set({ ...lina.auth, 'X-Forwarded-For': '203.0.113.44' })
      .send({ designId: design.id, mode: 'MODEL', body: { heightCm: 160 }, consent: true })
      .expect(201);
    await ctx.runTryOn();
    const order = await paidOrder(ctx, lina, 'classic-nida-closed');
    const [item] = await ctx.db.orderItem.findMany({ where: { orderId: order.orderId } });
    expect(item!.aiPreviewPath).toBeNull();
    const admin = await ctx.http.get(`/v1/admin/orders/${order.orderId}`).set(pm.auth).expect(200);
    expect(admin.body.items[0].aiPreview).toBeNull();
  });
});
