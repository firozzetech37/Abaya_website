import sharp from 'sharp';
import { createTestApp, type TestContext, type TestUser, userWithRoles } from './helpers';

const PIN = 'https://www.pinterest.com/pin/1234567890/';

describe('Designer Studio (e2e)', () => {
  let ctx: TestContext;
  let designer: TestUser;
  let other: TestUser;
  let manager: TestUser;
  let pm: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    designer = await userWithRoles(ctx, ['DESIGNER'], 'studio-designer');
    other = await userWithRoles(ctx, ['DESIGNER'], 'studio-other');
    manager = await userWithRoles(ctx, ['CATALOG_MANAGER'], 'studio-manager');
    pm = await userWithRoles(ctx, ['PRODUCTION_MANAGER'], 'studio-pm');
  });
  afterAll(() => ctx.close());

  const generate = (user: TestUser, body: Record<string, unknown>) => ctx.http.post('/v1/studio/generations').set(user.auth).send(body);

  it('is for designers and the catalog manager only', async () => {
    await ctx.http.get('/v1/studio/limits').set(pm.auth).expect(403);
    await ctx.http.get('/v1/studio/limits').expect(401);
    const limits = await ctx.http.get('/v1/studio/limits').set(manager.auth).expect(200);
    expect(limits.body).toMatchObject({ mode: 'test', dailyLimit: 20, imagesPerGeneration: 4, usedToday: 0 });
  });

  it('refuses prompts that name brands, people, copying or links', async () => {
    const res = await generate(designer, { style: 'OPEN_FRONT', prompt: 'An exact copy of the Gucci abaya worn by a celebrity' }).expect(422);
    expect(res.body.error.code).toBe('PROMPT_NOT_ALLOWED');
    expect(res.body.error.details.problems).toEqual(expect.arrayContaining(['brand', 'person', 'copy']));
    const link = await generate(designer, { style: 'OPEN_FRONT', prompt: 'Something like www.example.com/abaya please' }).expect(422);
    expect(link.body.error.details.problems).toEqual(['link']);
    await generate(designer, { style: 'OPEN_FRONT', prompt: 'Flowing everyday abaya', inspirationUrl: 'https://example.com/pin/1' }).expect(422);
  });

  it('makes four test images in the background, with the sketch cleaned of EXIF', async () => {
    const upload = await ctx.http.post('/v1/admin/uploads').set(designer.auth).send({ purpose: 'DESIGN_SKETCH', contentType: 'image/jpeg', fileName: 'sketch.jpg' }).expect(201);
    const sketchPath = upload.body.storagePath as string;
    expect(sketchPath).toMatch(/^design-sketches\//);
    const withGps = await sharp({ create: { width: 64, height: 80, channels: 3, background: '#fff' } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-location' } } })
      .toBuffer();
    expect(withGps.includes(Buffer.from('secret-location'))).toBe(true);
    await ctx.storage.put('private', sketchPath, withGps, 'image/jpeg');

    const queued = await generate(designer, {
      style: 'BUTTERFLY',
      colour: 'Emerald',
      sleeve: 'Bell',
      embroidery: 'Pearl work',
      prompt: 'Light Eid abaya with soft pearl detail on the cuffs',
      sketchPath,
      inspirationUrl: PIN,
    }).expect(201);
    expect(queued.body).toMatchObject({ status: 'QUEUED', mode: 'test', images: [], inspirationUrl: PIN });
    expect(queued.body.options).toEqual({ style: 'BUTTERFLY', colour: 'Emerald', sleeve: 'Bell', embroidery: 'Pearl work' });
    expect(ctx.storage.files.get(`private/${sketchPath}`)!.body.includes(Buffer.from('secret-location'))).toBe(false);

    expect(await ctx.runStudio()).toBe(1);
    const done = await ctx.http.get(`/v1/studio/generations/${queued.body.id}`).set(designer.auth).expect(200);
    expect(done.body.status).toBe('DONE');
    expect(done.body.images).toHaveLength(4);
    for (const image of done.body.images) {
      const path = image.url.replace('https://storage.test/signed/', '');
      expect(ctx.storage.files.get(path)?.contentType).toBe('image/png');
    }
    // Another designer cannot see it.
    await ctx.http.get(`/v1/studio/generations/${queued.body.id}`).set(other.auth).expect(404);
    const audit = await ctx.db.auditLog.findFirst({ where: { action: 'studio.generation_requested', entityId: queued.body.id } });
    expect(audit?.actorUserId).toBe(designer.id);

    const fav = await ctx.http.patch(`/v1/studio/images/${done.body.images[1].id}`).set(designer.auth).send({ favourite: true }).expect(200);
    expect(fav.body.images[1].favourite).toBe(true);
    await ctx.http.patch(`/v1/studio/images/${done.body.images[1].id}`).set(other.auth).send({ favourite: true }).expect(404);

    // A chosen variation becomes a draft design (source AI_GENERATED) for the normal review.
    const design = await ctx.http
      .post(`/v1/studio/images/${done.body.images[1].id}/design`)
      .set(designer.auth)
      .send({ name: 'Pearl Cuff Butterfly', style: 'BUTTERFLY' })
      .expect(201);
    expect(design.body).toMatchObject({
      status: 'DRAFT',
      source: 'AI_GENERATED',
      inspirationUrl: PIN,
      aiGeneration: { generationId: queued.body.id, model: 'test-placeholder' },
    });
    expect(design.body.images).toHaveLength(1);
    await ctx.http.post(`/v1/studio/images/${done.body.images[1].id}/design`).set(designer.auth).send({ name: 'Again', style: 'BUTTERFLY' }).expect(422);
    await ctx.http.post(`/v1/admin/designs/${design.body.id}/transition`).set(designer.auth).send({ to: 'IN_REVIEW' }).expect(422);

    const list = await ctx.http.get('/v1/studio/generations').set(designer.auth).expect(200);
    expect(list.body[0].images[1].designId).toBe(design.body.id);
  });

  it('stops at the daily limit', async () => {
    await ctx.db.designGeneration.createMany({
      data: Array.from({ length: 20 }, () => ({ designerId: other.id, prompt: 'x', options: { style: 'CLOSED' }, provider: 'test', model: 'test', status: 'DONE' as const })),
    });
    const res = await generate(other, { style: 'CLOSED', prompt: 'Simple daily abaya in crepe' }).expect(422);
    expect(res.body.error.code).toBe('DAILY_LIMIT_REACHED');
    const limits = await ctx.http.get('/v1/studio/limits').set(other.auth).expect(200);
    expect(limits.body.usedToday).toBe(20);
  });

  it('picks up a generation whose worker died, but not one still being worked on', async () => {
    const queued = await generate(designer, { style: 'CLOSED', prompt: 'Plain navy work abaya with pockets' }).expect(201);
    await ctx.db.designGeneration.update({ where: { id: queued.body.id }, data: { status: 'RUNNING', attempts: 3, leasedUntil: new Date(Date.now() + 60_000) } });
    expect(await ctx.runStudio()).toBe(0);
    // The lease ran out: the worker that held it is gone.
    await ctx.db.designGeneration.update({ where: { id: queued.body.id }, data: { leasedUntil: new Date(Date.now() - 1000) } });
    expect(await ctx.runStudio()).toBe(1);
    const row = await ctx.db.designGeneration.findUniqueOrThrow({ where: { id: queued.body.id } });
    expect(row.status).toBe('DONE');
    expect(row.attempts).toBe(4);
  });

  it('shows Pinterest pins by link and saves only the link, never the image', async () => {
    await ctx.http.post('/v1/studio/pinterest/preview').set(designer.auth).send({ url: 'https://example.com/pin/1' }).expect(422);
    const preview = await ctx.http.post('/v1/studio/pinterest/preview').set(designer.auth).send({ url: 'https://pin.it/abc123' }).expect(200);
    expect(preview.body).toMatchObject({ url: PIN, title: 'Emerald satin abaya', author: 'Studio Board', imageUrl: expect.stringContaining('pinimg.com') });
    await ctx.http.post('/v1/studio/pinterest/preview').set(designer.auth).send({ url: 'https://www.pinterest.com/pin/999/' }).expect(422);

    const filesBefore = ctx.storage.files.size;
    const saved = await ctx.http.post('/v1/studio/pinterest/save').set(designer.auth).send({ url: PIN, note: 'sleeve idea' }).expect(201);
    expect(saved.body).toMatchObject({ status: 'NEEDS_DESIGN', source: 'PINTEREST' });
    expect(ctx.storage.files.size).toBe(filesBefore);
    const again = await ctx.http.post('/v1/studio/pinterest/save').set(designer.auth).send({ url: PIN }).expect(201);
    expect(again.body.id).toBe(saved.body.id);

    // Pins are never fed to the AI similarity index.
    expect(await ctx.db.aiImage.count({ where: { subjectId: saved.body.id } })).toBe(0);

    const boards = await ctx.http.get('/v1/studio/pinterest/boards').set(designer.auth).expect(200);
    expect(boards.body).toEqual({ connected: false, boards: [] });
    ctx.pinterest.connected = true;
    const connected = await ctx.http.get('/v1/studio/pinterest/boards').set(designer.auth).expect(200);
    expect(connected.body.boards[0].name).toBe('Eid 2027');
    const pins = await ctx.http.get('/v1/studio/pinterest/boards/b1/pins').set(designer.auth).expect(200);
    expect(pins.body[0].url).toBe(PIN);
  });

  it('summarises the designer’s own work', async () => {
    const res = await ctx.http.get('/v1/studio/summary').set(designer.auth).expect(200);
    expect(res.body).toMatchObject({ orders: 0, revenueInPaise: 0, assignedReferences: 1 });
    expect(res.body.byStatus.DRAFT).toBe(1);
    expect(res.body.aiGenerationsToday).toBe(2);
  });
});
