import sharp from 'sharp';
import { DesignsAdminService } from '../src/modules/catalog/application/designs-admin.service';
import { WatermarkService } from '../src/modules/watermark/application/watermark.service';
import { createTestApp, signWebhook, type TestContext, type TestUser, userWithRoles } from './helpers';

const SLUG = 'classic-nida-closed';

describe('HD design downloads (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let manager: TestUser;
  let designer: TestUser;
  let support: TestUser;
  let buyer: TestUser;
  let stranger: TestUser;
  let designId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRoles(ctx, ['SUPER_ADMIN'], 'dl-admin');
    manager = await userWithRoles(ctx, ['CATALOG_MANAGER'], 'dl-manager');
    designer = await userWithRoles(ctx, ['DESIGNER'], 'dl-designer');
    support = await userWithRoles(ctx, ['SUPPORT'], 'dl-support');
    buyer = await userWithRoles(ctx, ['CUSTOMER'], 'dl-buyer');
    stranger = await userWithRoles(ctx, ['CUSTOMER'], 'dl-stranger');
    designId = (await ctx.http.get(`/v1/designs/${SLUG}`).expect(200)).body.id;
    // Seed photos start in the public bucket, unwatermarked.
    const photo = await sharp({ create: { width: 1600, height: 2000, channels: 3, background: '#1c1a19' } }).jpeg().toBuffer();
    for (const n of [1, 2]) await ctx.storage.put('public', `seed/${SLUG}-${n}.jpg`, photo, 'image/jpeg');
  });
  afterAll(() => ctx.close());

  const pay = async (razorpayOrderId: string, amount: number) => {
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: `pay_${razorpayOrderId.slice(-10)}`, order_id: razorpayOrderId, amount, method: 'upi' } } },
    });
    await ctx.http.post('/v1/payments/webhook').set('content-type', 'application/json').set('x-razorpay-signature', signWebhook(body)).send(body).expect(200);
  };

  it('rebuilds watermarked previews and keeps the original private', async () => {
    await ctx.http.post('/v1/admin/designs/rebuild-previews').set(manager.auth).expect(403);
    const res = await ctx.http.post('/v1/admin/designs/rebuild-previews').set(admin.auth).expect(200);
    expect(res.body.images).toBeGreaterThanOrEqual(2);
    const publicCopy = ctx.storage.files.get(`public/seed/${SLUG}-1.jpg`)!.body;
    const privateCopy = ctx.storage.files.get(`private/seed/${SLUG}-1.jpg`)!.body;
    expect((await sharp(publicCopy).metadata()).width).toBe(1280); // web size: 1600 tall, 4:5
    expect((await sharp(privateCopy).metadata()).width).toBe(1600);
    // The public copy carries the design's invisible watermark; the private original does not.
    expect(await ctx.app.get(WatermarkService).read(publicCopy)).toMatchObject({ kind: 'DESIGN' });
    // The website gets a new image address, so no cache keeps showing the old copy.
    const first = (await ctx.http.get(`/v1/designs/${SLUG}`).expect(200)).body.images[0].url as string;
    expect(first).toMatch(/\?v=\d+$/);
    // Running it again uses the private original, never an earlier preview, and changes the address again.
    await ctx.http.post('/v1/admin/designs/rebuild-previews').set(admin.auth).expect(200);
    const second = (await ctx.http.get(`/v1/designs/${SLUG}`).expect(200)).body.images[0].url as string;
    expect(second).not.toBe(first);
    expect((await sharp(ctx.storage.files.get(`private/seed/${SLUG}-1.jpg`)!.body).metadata()).width).toBe(1600);
  });

  it('is off until the catalog manager turns it on and prices it', async () => {
    expect((await ctx.http.get(`/v1/designs/${SLUG}`).expect(200)).body.download).toBeNull();
    await ctx.http.post('/v1/me/downloads').set(buyer.auth).send({ designId, licenceAccepted: true }).expect(404);

    await ctx.http.patch(`/v1/admin/designs/${designId}`).set(designer.auth).send({ downloadEnabled: true }).expect(404); // not their design
    await ctx.http.patch(`/v1/admin/designs/${designId}`).set(manager.auth).send({ downloadPriceInPaise: 10 }).expect(400);
    const updated = await ctx.http
      .patch(`/v1/admin/designs/${designId}`)
      .set(manager.auth)
      .send({ downloadEnabled: true, downloadPriceInPaise: 49_900 })
      .expect(200);
    expect(updated.body).toMatchObject({ downloadEnabled: true, downloadPriceInPaise: 49_900 });
    const audit = await ctx.db.auditLog.findFirst({ where: { action: 'design.download_changed', entityId: designId } });
    expect(audit?.after).toEqual({ downloadEnabled: true, downloadPriceInPaise: 49_900 });

    const detail = await ctx.http.get(`/v1/designs/${SLUG}`).expect(200);
    expect(detail.body.download).toEqual({ priceInPaise: 49_900, imageCount: 2 });
  });

  it('sells the HD images as its own purchase, never an abaya order', async () => {
    await ctx.http.post('/v1/me/downloads').send({ designId, licenceAccepted: true }).expect(401);
    await ctx.http.post('/v1/me/downloads').set(buyer.auth).send({ designId }).expect(400);
    await ctx.http.post('/v1/me/downloads').set(buyer.auth).send({ designId, licenceAccepted: false }).expect(400);

    const ordersBefore = await ctx.db.order.count({ where: { userId: buyer.id } });
    const started = await ctx.http.post('/v1/me/downloads').set(buyer.auth).send({ designId, licenceAccepted: true, priceInPaise: 1 }).expect(201);
    expect(started.body).toMatchObject({ priceInPaise: 49_900, paymentMode: 'razorpay', razorpay: { amount: 49_900, currency: 'INR' } });
    const id = started.body.downloadId as string;

    // Not paid yet: no files; nobody else can see it; simulate is development-only.
    const early = await ctx.http.post(`/v1/me/downloads/${id}/files/0`).set(buyer.auth).expect(422);
    expect(early.body.error.code).toBe('NOT_PAID');
    await ctx.http.get(`/v1/me/downloads/${id}`).set(stranger.auth).expect(404);
    await ctx.http.post(`/v1/me/downloads/${id}/simulate-payment`).set(buyer.auth).expect(404);
    expect((await ctx.http.get('/v1/me/downloads').set(buyer.auth).expect(200)).body).toEqual([]);

    await pay(started.body.razorpay.orderId, 49_900);
    const paid = await ctx.http.get(`/v1/me/downloads/${id}`).set(buyer.auth).expect(200);
    expect(paid.body).toMatchObject({ status: 'PAID', imageCount: 2, priceInPaise: 49_900, design: { slug: SLUG } });
    expect(paid.body.previewUrl).toContain(`seed/${SLUG}-1.jpg`);
    // A webhook retry does nothing more.
    await pay(started.body.razorpay.orderId, 49_900);
    expect(await ctx.db.auditLog.count({ where: { action: 'download.paid', entityId: id } })).toBe(1);
    expect(await ctx.db.order.count({ where: { userId: buyer.id } })).toBe(ordersBefore);

    const mine = await ctx.http.get('/v1/me/downloads').set(buyer.auth).expect(200);
    expect(mine.body.map((d: { id: string }) => d.id)).toEqual([id]);

    // The HD file: full size, no watermark step, licence code in its metadata.
    const link = await ctx.http.post(`/v1/me/downloads/${id}/files/1`).set(buyer.auth).expect(200);
    expect(link.body).toMatchObject({ fileName: `${SLUG}-2.jpg`, expiresInSeconds: 600 });
    expect(link.body.url).toContain(`private/downloads/${id}/2.jpg`);
    const file = ctx.storage.files.get(`private/downloads/${id}/2.jpg`)!.body;
    const meta = await sharp(file).metadata();
    expect(meta.width).toBe(1600);
    const code = `L-${id.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    expect(meta.exif?.includes(Buffer.from(code))).toBe(true);
    expect(meta.exif?.includes(Buffer.from(buyer.email))).toBe(false);
    await ctx.http.post(`/v1/me/downloads/${id}/files/2`).set(buyer.auth).expect(404);
    await ctx.http.post(`/v1/me/downloads/${id}/files/0`).set(stranger.auth).expect(404);

    // Buying the same design again is refused (re-download from My downloads instead).
    const again = await ctx.http.post('/v1/me/downloads').set(buyer.auth).send({ designId, licenceAccepted: true }).expect(422);
    expect(again.body.error).toMatchObject({ code: 'ALREADY_PURCHASED', details: { downloadId: id } });
  });

  it('shows staff who bought what, without letting customers in', async () => {
    await ctx.http.get('/v1/admin/downloads').set(buyer.auth).expect(403);
    await ctx.http.get('/v1/admin/downloads').set(designer.auth).expect(403);
    const list = await ctx.http.get('/v1/admin/downloads').set(support.auth).expect(200);
    expect(list.body.items[0]).toMatchObject({ status: 'PAID', priceInPaise: 49_900, customer: { email: buyer.email }, design: { slug: SLUG } });
    const summary = await ctx.http.get('/v1/admin/downloads/summary').set(manager.auth).expect(200);
    expect(summary.body).toEqual({ paidCount: 1, revenueInPaise: 49_900, paidToday: 1 });
    const pending = await ctx.http.get('/v1/admin/downloads?status=PENDING_PAYMENT').set(manager.auth).expect(200);
    expect(pending.body.items).toEqual([]);
  });
  it('remakes old website images by itself at start-up, once per photo', async () => {
    const design = await ctx.db.design.findUniqueOrThrow({ where: { slug: 'kaftan-lounge' } });
    const path = 'design-images/2026/10/00000000-0000-4000-8000-0000000000aa.jpg';
    const original = await sharp({ create: { width: 1800, height: 2400, channels: 3, background: '#3a3330' } }).jpeg().toBuffer();
    await ctx.storage.put('private', path, original, 'image/jpeg');
    // An old (e.g. watermarked) public copy made by earlier code: version 0.
    await ctx.storage.put('public', path, Buffer.from('old watermarked copy'), 'image/jpeg');
    const image = await ctx.db.designImage.create({ data: { designId: design.id, storagePath: path, sortOrder: 9 } });

    const service = ctx.app.get(DesignsAdminService);
    expect(await service.refreshStalePreviews()).toBeGreaterThanOrEqual(1);
    const fresh = ctx.storage.files.get(`public/${path}`)!.body;
    expect((await sharp(fresh).metadata()).height).toBe(1600);
    expect((await ctx.db.designImage.findUniqueOrThrow({ where: { id: image.id } })).previewVersion).toBe(1);
    // Nothing left to do the next time the API starts.
    expect(await service.refreshStalePreviews()).toBe(0);
  });
});



describe('HD downloads with test payments (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ testPayments: true });
  });
  afterAll(() => ctx.close());

  it('pays with "Simulate payment" in development', async () => {
    const manager = await userWithRoles(ctx, ['CATALOG_MANAGER'], 'dl2-manager');
    const buyer = await userWithRoles(ctx, ['CUSTOMER'], 'dl2-buyer');
    const design = (await ctx.http.get('/v1/designs/open-front-kimono').expect(200)).body;
    await ctx.http.patch(`/v1/admin/designs/${design.id}`).set(manager.auth).send({ downloadEnabled: true }).expect(200);
    const started = await ctx.http.post('/v1/me/downloads').set(buyer.auth).send({ designId: design.id, licenceAccepted: true }).expect(201);
    expect(started.body).toMatchObject({ paymentMode: 'test', priceInPaise: 29_900 });
    const paid = await ctx.http.post(`/v1/me/downloads/${started.body.downloadId}/simulate-payment`).set(buyer.auth).expect(200);
    expect(paid.body.status).toBe('PAID');
  });
});
