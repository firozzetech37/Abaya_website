import sharp from 'sharp';
import { createTestApp, type TestContext, type TestUser, userWithRoles } from './helpers';

/** A real (tiny) JPEG with GPS-like metadata, like a phone photo. */
const herPhoto = () =>
  sharp({ create: { width: 300, height: 600, channels: 3, background: '#c9b8a6' } })
    .withExif({ IFD0: { Copyright: 'phone' } })
    .jpeg()
    .toBuffer();

type Group = { code: string; values: { id: string; name: string; isDefault: boolean }[] };

/** Website "Preview my design" and "Try it on" (docs/apps/web.md "AI preview and try-on"). */
describe('Website AI preview and try-on (e2e)', () => {
  let ctx: TestContext;
  let ana: TestUser;
  let bea: TestUser;
  let manager: TestUser;
  let designId: string;
  let defaults: string[];
  let custom: string[];
  let crepeName: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    ana = await userWithRoles(ctx, ['CUSTOMER'], 'tryon-ana');
    bea = await userWithRoles(ctx, ['CUSTOMER'], 'tryon-bea');
    manager = await userWithRoles(ctx, ['CATALOG_MANAGER'], 'tryon-manager');
    const detail = await ctx.http.get('/v1/designs/classic-nida-closed').expect(200);
    designId = detail.body.id;
    const groups = detail.body.optionGroups as Group[];
    defaults = groups.flatMap((g) => g.values.filter((v) => v.isDefault).map((v) => v.id));
    const fabric = groups.find((g) => g.code === 'FABRIC')!;
    const other = fabric.values.find((v) => !v.isDefault)!;
    crepeName = other.name;
    const fabricDefault = fabric.values.find((v) => v.isDefault)!.id;
    custom = [...defaults.filter((id) => id !== fabricDefault), other.id];
  });
  afterAll(() => ctx.close());

  const preview = (user: TestUser, ids: string[]) =>
    ctx.http.post('/v1/me/try-on/previews').set(user.auth).send({ designId, selectedOptionValueIds: ids });

  it('makes one shared preview of the chosen options with one 1K fast FASHN edit', async () => {
    const limits = await ctx.http.get('/v1/me/try-on/limits').set(ana.auth).expect(200);
    expect(limits.body).toEqual({ previewsLeft: 5, previewsPerDay: 5, tryOnsLeft: 3, tryOnsPerDay: 3, available: true, live: true, wording: true, keepMinutes: 60 });

    await ctx.http.post('/v1/me/try-on/previews').send({ designId, selectedOptionValueIds: custom }).expect(401);
    const same = await preview(ana, defaults).expect(422);
    expect(same.body.error.code).toBe('NOTHING_TO_PREVIEW');
    const wrong = await preview(ana, [...custom, '00000000-0000-4000-8000-000000000000']).expect(422);
    expect(wrong.body.error.code).toBe('UNKNOWN_OPTION');

    const runsBefore = ctx.fashn.runs.length;
    const made = await preview(ana, custom).expect(201);
    expect(made.body).toMatchObject({ kind: 'PREVIEW', status: 'QUEUED', imageUrl: null });
    await ctx.runTryOn();
    const done = await ctx.http.get(`/v1/me/try-on/${made.body.id}`).set(ana.auth).expect(200);
    expect(done.body).toMatchObject({ status: 'DONE', imageUrl: expect.stringMatching(/signed\/private\/customer-previews\//) });

    expect(ctx.fashn.runs).toHaveLength(runsBefore + 1);
    const run = ctx.fashn.runs.at(-1)!;
    expect(run.endpoint).toBe('edit');
    expect(run.inputs).toMatchObject({ resolution: '1k', generation_mode: 'fast', num_images: 1 });
    expect(run.inputs.prompt).toContain(`look like ${crepeName}`);
    expect(run.inputs.prompt).toContain('Keep every existing embroidery panel'); // the design's own look is protected
    expect(run.inputs.prompt).not.toContain('base fabric colour'); // the photo already shows the default colour

    // Another customer, same choices in another order: the same picture, no FASHN call, no allowance used.
    const shared = await preview(bea, [...custom].reverse()).expect(201);
    expect(shared.body.id).toBe(made.body.id);
    expect(ctx.fashn.runs).toHaveLength(runsBefore + 1);
    expect((await ctx.http.get('/v1/me/try-on/limits').set(bea.auth).expect(200)).body.previewsLeft).toBe(5);
    expect((await ctx.http.get('/v1/me/try-on/limits').set(ana.auth).expect(200)).body.previewsLeft).toBe(4);
  });

  it('makes the picture from her own words alone, leaving out design changes, and keys it by the words', async () => {
    const limits = await ctx.http.get('/v1/me/try-on/limits').set(ana.auth).expect(200);
    expect(limits.body.wording).toBe(true);
    const refused = await ctx.http.post('/v1/me/try-on/previews').set(ana.auth).send({ designId, selectedOptionValueIds: defaults, request: 'remove the lace on the sleeves' }).expect(422);
    expect(refused.body.error.code).toBe('REQUEST_NOT_ALLOWED');
    const wish = await ctx.http
      .post('/v1/me/try-on/previews')
      .set(ana.auth)
      .send({ designId, selectedOptionValueIds: defaults, request: 'Indigo with white embroidery, in the desert at sunset and accessories in the hand' })
      .expect(201);
    expect(wish.body.status).toBe('QUEUED');
    expect(wish.body.fromWords).toBe(true);
    expect(wish.body.leftOut).toEqual(['accessories in the hand']);
    const row = await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: wish.body.id } });
    expect(row.previewKey).toBe(`${designId}:words:indigo with white embroidery, in the desert at sunset`);
    expect(row.steps).toHaveLength(1);
    expect(row.steps[0]).toContain('follow the customer\'s wish exactly: "Indigo with white embroidery, in the desert at sunset"');
    expect(row.steps[0]).toContain('Keep every existing embroidery panel');
    expect(row.choices).toEqual(['In her words: Indigo with white embroidery, in the desert at sunset', 'Left out: accessories in the hand']);
    // Same words with other options and spacing: the shared preview, no new row, nothing left out this time
    const again = await ctx.http
      .post('/v1/me/try-on/previews')
      .set(ana.auth)
      .send({ designId, selectedOptionValueIds: [], request: 'indigo with WHITE embroidery,  in the desert at sunset' })
      .expect(201);
    expect(again.body.id).toBe(wish.body.id);
    expect(again.body.leftOut).toEqual([]);
    // Fetched later, the preview still says what it was made from
    const fetched = await ctx.http.get(`/v1/me/try-on/${wish.body.id}`).set(ana.auth).expect(200);
    expect(fetched.body.fromWords).toBe(true);
    expect(fetched.body.leftOut).toEqual(['accessories in the hand']);
  });

  it('stops at the daily limit; failed pictures do not count', async () => {
    const cleo = await userWithRoles(ctx, ['CUSTOMER'], 'tryon-cleo');
    const row = { userId: cleo.id, kind: 'PREVIEW' as const, designId, sourcePath: 'x.jpg', prompt: 'p', endpoint: 'edit', credits: 1 };
    await ctx.db.customerPreview.createMany({ data: Array.from({ length: 5 }, () => ({ ...row, status: 'DONE' as const })) });
    // A combination nobody has made yet is refused once her limit is reached.
    await ctx.db.customerPreview.updateMany({ where: { previewKey: { not: null } }, data: { hidden: true } });
    const limited = await preview(cleo, custom).expect(422);
    expect(limited.body.error.code).toBe('DAILY_PREVIEW_LIMIT');
    await ctx.db.customerPreview.updateMany({ where: { userId: cleo.id }, data: { status: 'FAILED' } });
    await preview(cleo, custom).expect(201);
    await ctx.runTryOn();
  });

  it('tries the abaya on her own photo: private to her, and deleted after 30 days', async () => {
    const shared = await preview(ana, custom).expect(201);
    await ctx.runTryOn();
    const upload = await ctx.http.post('/v1/me/try-on/uploads').set(ana.auth).send({ contentType: 'image/jpeg' }).expect(201);
    const personPath = upload.body.storagePath as string;
    expect(personPath).toMatch(/^tryon-photos\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    await ctx.storage.put('private', personPath, await herPhoto(), 'image/jpeg');

    const body = { designId, personPath, previewId: shared.body.id };
    await ctx.http.post('/v1/me/try-on/try-ons').set(ana.auth).send(body).expect(400); // no consent
    const notHers = await ctx.http
      .post('/v1/me/try-on/try-ons')
      .set(ana.auth)
      .send({ ...body, personPath: 'design-images/2026/01/00000000-0000-4000-8000-000000000000.jpg', consent: true })
      .expect(422);
    expect(notHers.body.error.code).toBe('INVALID_UPLOAD_PATH');

    const made = await ctx.http.post('/v1/me/try-on/try-ons').set(ana.auth).send({ ...body, consent: true }).expect(201);
    expect(made.body.expiresAt).toEqual(expect.any(String));
    await ctx.runTryOn();
    const run = ctx.fashn.runs.at(-1)!;
    expect(run.endpoint).toBe('tryon-max');
    expect(run.inputs.model_image).toContain(personPath);
    expect(run.inputs.product_image).toContain('customer-previews/'); // she wears her customised preview
    expect(run.inputs.prompt).toContain('Transfer ONLY the abaya');
    expect(run.inputs.prompt).toContain('Keep her face, skin tone, body shape');
    // Checked with three pictures: the abaya, her photo, and the result.
    expect(ctx.checker.shown.at(-1)).toEqual(['Image 1 (the abaya)', 'Image 2 (her photo)', 'Image 3 (try-on result)']);
    expect(ctx.checker.asked.at(-1)).toContain('it must be the same woman');
    const done = await ctx.http.get(`/v1/me/try-on/${made.body.id}`).set(ana.auth).expect(200);
    expect(done.body.status).toBe('DONE');

    // Nobody else sees it, not even the catalog manager's list.
    await ctx.http.get(`/v1/me/try-on/${made.body.id}`).set(bea.auth).expect(404);
    await ctx.http.delete(`/v1/me/try-on/${made.body.id}`).set(bea.auth).expect(404);
    const list = await ctx.http.get('/v1/admin/customer-previews').set(manager.auth).expect(200);
    expect(list.body.items.every((i: { id: string }) => i.id !== made.body.id)).toBe(true);

    // 31 days later her photo and the result are gone.
    const resultPath = (await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: made.body.id } })).resultPath!;
    const swept = await ctx.runTryOn(new Date(Date.now() + 31 * 24 * 60 * 60_000));
    expect(swept.deleted).toBeGreaterThanOrEqual(1);
    expect(await ctx.db.customerPreview.findUnique({ where: { id: made.body.id } })).toBeNull();
    expect(ctx.storage.files.has(`private/${personPath}`)).toBe(false);
    expect(ctx.storage.files.has(`private/${resultPath}`)).toBe(false);

    // She can also delete one straight away; without a preview she wears the design photo.
    const fresh = await ctx.http.post('/v1/me/try-on/uploads').set(ana.auth).send({ contentType: 'image/jpeg' }).expect(201);
    await ctx.storage.put('private', fresh.body.storagePath, await herPhoto(), 'image/jpeg');
    const second = await ctx.http
      .post('/v1/me/try-on/try-ons')
      .set(ana.auth)
      .send({ designId, personPath: fresh.body.storagePath, consent: true })
      .expect(201);
    await ctx.http.delete(`/v1/me/try-on/${second.body.id}`).set(ana.auth).expect(204);
    await ctx.http.get(`/v1/me/try-on/${second.body.id}`).set(ana.auth).expect(404);
  });

  it('makes colour and fabric first, then the details, checks the result, and remakes it once', async () => {
    const detail = await ctx.http.get('/v1/designs/classic-nida-closed').expect(200);
    const groups = detail.body.optionGroups as Group[];
    const pick = (code: string) => groups.find((g) => g.code === code)!.values.find((v) => !v.isDefault)!;
    const colour = pick('COLOUR');
    const addOn = pick('ADD_ON');
    const colourDefault = groups.find((g) => g.code === 'COLOUR')!.values.find((v) => v.isDefault)!.id;
    const choice = [...defaults.filter((id) => id !== colourDefault), colour.id, addOn.id];

    ctx.checker.failNext = 1; // the first result loses the embroidery
    const runsBefore = ctx.fashn.runs.length;
    const dana = await userWithRoles(ctx, ['CUSTOMER'], 'tryon-dana');
    const made = await preview(dana, choice).expect(201);
    const row = await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: made.body.id } });
    expect(row.steps).toHaveLength(2);
    expect(row.credits).toBe(2);
    await ctx.storage.put('private', row.sourcePath, Buffer.from('original photo'), 'image/jpeg'); // the checker compares with it
    await ctx.runTryOn();

    const runs = ctx.fashn.runs.slice(runsBefore);
    expect(runs).toHaveLength(4); // 2 steps, checked, remade once (2 steps)
    expect(runs[0]!.inputs.prompt).toContain(`base fabric colour to ${colour.name}`);
    expect(runs[1]!.inputs.image).toContain('customer-previews/'); // step 2 starts from step 1's result
    expect(runs[2]!.inputs.prompt).toContain('the previous attempt was wrong');
    expect(runs[2]!.inputs.prompt).toContain('the gold embroidery panels are missing');
    expect(ctx.checker.asked.at(-1)).toContain('Be strict about embroidery');
    const done = await ctx.http.get(`/v1/me/try-on/${made.body.id}`).set(dana.auth).expect(200);
    expect(done.body.status).toBe('DONE');
    const after = await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: made.body.id } });
    expect(after).toMatchObject({ retries: 1, credits: 4, checkNotes: 'Checked' });

    // Fails twice: no wrong picture is shown, and the combination is not tried again for the next customer.
    const other = [...choice.filter((id) => id !== addOn.id)];
    ctx.checker.failNext = 2;
    const bad = await preview(dana, other).expect(201);
    const badRow = await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: bad.body.id } });
    await ctx.storage.put('private', badRow.sourcePath, Buffer.from('original photo'), 'image/jpeg');
    await ctx.runTryOn();
    const refused = await ctx.http.get(`/v1/me/try-on/${bad.body.id}`).set(dana.auth).expect(200);
    expect(refused.body).toMatchObject({ status: 'FAILED', imageUrl: null, error: expect.stringContaining('accurate preview') });
    const runsNow = ctx.fashn.runs.length;
    const again = await preview(bea, other).expect(201);
    expect(again.body).toMatchObject({ id: bad.body.id, status: 'FAILED' });
    expect(ctx.fashn.runs).toHaveLength(runsNow);
    // Failed pictures do not use her allowance (she made one good preview).
    expect((await ctx.http.get('/v1/me/try-on/limits').set(dana.auth).expect(200)).body.previewsLeft).toBe(4);
  });

  it('checks her photo before spending a credit, cleans it, and remakes a wrong try-on once', async () => {
    const eva = await userWithRoles(ctx, ['CUSTOMER'], 'tryon-eva');
    const upload = async () => {
      const res = await ctx.http.post('/v1/me/try-on/uploads').set(eva.auth).send({ contentType: 'image/jpeg' }).expect(201);
      await ctx.storage.put('private', res.body.storagePath, await herPhoto(), 'image/jpeg');
      return res.body.storagePath as string;
    };

    // Not uploaded: refused. Unsuitable photo: a tip, no FASHN call, nothing counted, photo deleted.
    const missing = 'tryon-photos/2026/10/00000000-0000-4000-8000-000000000009.jpg';
    expect((await ctx.http.post('/v1/me/try-on/try-ons').set(eva.auth).send({ designId, personPath: missing, consent: true }).expect(422)).body.error.code).toBe('PHOTO_MISSING');
    const runsBefore = ctx.fashn.runs.length;
    ctx.checker.photoVerdict = { ok: false, reason: 'not_full_body' };
    const halfBody = await upload();
    const refused = await ctx.http.post('/v1/me/try-on/try-ons').set(eva.auth).send({ designId, personPath: halfBody, consent: true }).expect(422);
    expect(refused.body.error).toMatchObject({ code: 'PHOTO_NOT_SUITABLE', message: expect.stringContaining('whole body is visible') });
    expect(ctx.storage.files.has(`private/${halfBody}`)).toBe(false);
    expect(ctx.fashn.runs).toHaveLength(runsBefore);
    expect((await ctx.http.get('/v1/me/try-on/limits').set(eva.auth).expect(200)).body.tryOnsLeft).toBe(3);

    // A good photo: cleaned first (location data removed), then a wrong result is remade once.
    ctx.checker.photoVerdict = { ok: true, reason: 'ok' };
    const good = await upload();
    const shared = await preview(eva, custom).expect(201);
    await ctx.runTryOn();
    ctx.checker.failNext = 1;
    const made = await ctx.http
      .post('/v1/me/try-on/try-ons')
      .set(eva.auth)
      .send({ designId, personPath: good, previewId: shared.body.id, consent: true })
      .expect(201);
    expect((await sharp(ctx.storage.files.get(`private/${good}`)!.body).metadata()).exif).toBeUndefined();
    await ctx.runTryOn();
    const row = await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: made.body.id } });
    expect(row).toMatchObject({ status: 'DONE', retries: 1, credits: 2, checkNotes: 'Checked' });
    expect(ctx.fashn.runs.at(-1)!.inputs.prompt).toContain('the previous attempt was wrong');

    // Wrong twice: an honest message, and it does not use one of her 3 try-ons.
    ctx.checker.failNext = 2;
    const again = await ctx.http
      .post('/v1/me/try-on/try-ons')
      .set(eva.auth)
      .send({ designId, personPath: good, previewId: shared.body.id, consent: true })
      .expect(201);
    await ctx.runTryOn();
    const failed = await ctx.http.get(`/v1/me/try-on/${again.body.id}`).set(eva.auth).expect(200);
    expect(failed.body).toMatchObject({ status: 'FAILED', imageUrl: null, error: expect.stringContaining('try a different photo') });
    expect((await ctx.http.get('/v1/me/try-on/limits').set(eva.auth).expect(200)).body.tryOnsLeft).toBe(2);
  });

  it('tries the abaya on a model with her build, and on her photo made to her measurements', async () => {
    const fay = await userWithRoles(ctx, ['CUSTOMER'], 'tryon-fay');
    // Her own device (rate limits are per visitor address; earlier tests used up this minute's try-ons).
    const as = { ...fay.auth, 'X-Forwarded-For': '203.0.113.21' };
    // "A model like me": no photo, her height (and optional weight) only.
    await ctx.http.post('/v1/me/try-on/try-ons').set(as).send({ designId, mode: 'MODEL', consent: true }).expect(400);
    const runsBefore = ctx.fashn.runs.length;
    const model = await ctx.http
      .post('/v1/me/try-on/try-ons')
      .set(as)
      .send({ designId, mode: 'MODEL', body: { heightCm: 158, weightKg: 66, waistCm: 74, hipCm: 98 }, consent: true })
      .expect(201);
    await ctx.runTryOn();
    const [create, dress] = ctx.fashn.runs.slice(runsBefore);
    expect(create).toMatchObject({ endpoint: 'model-create' });
    expect(create!.inputs.prompt).toContain('about 158 cm tall');
    expect(create!.inputs.prompt).toContain('a full, curvy build');
    expect(dress).toMatchObject({ endpoint: 'tryon-max' });
    // The model the first step made wears the abaya.
    expect(dress!.inputs.model_image).toContain('customer-previews/');
    expect(dress!.inputs.product_image).toEqual(expect.stringContaining('/'));
    const done = await ctx.http.get(`/v1/me/try-on/${model.body.id}`).set(as).expect(200);
    expect(done.body).toMatchObject({ status: 'DONE', kind: 'TRYON', imageUrl: expect.any(String) });
    const row = await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: model.body.id } });
    expect(row).toMatchObject({ credits: 2, personPath: null, stepEndpoints: ['model-create', 'tryon-max'], choices: ['Try-on: a model like me'] });
    // Her weight is never written down.
    expect(JSON.stringify(row)).not.toMatch(/\b66\b/);

    // Her photo, made to her measurements: try-on, then the length and sleeves.
    const upload = await ctx.http.post('/v1/me/try-on/uploads').set(as).send({ contentType: 'image/jpeg' }).expect(201);
    await ctx.storage.put('private', upload.body.storagePath, await herPhoto(), 'image/jpeg');
    const runsMid = ctx.fashn.runs.length;
    const fitted = await ctx.http
      .post('/v1/me/try-on/try-ons')
      .set(as)
      .send({ designId, personPath: upload.body.storagePath, body: { heightCm: 150, sleeveLengthCm: 55, fullLengthCm: 122 }, consent: true })
      .expect(201);
    await ctx.runTryOn();
    const [onHer, fit] = ctx.fashn.runs.slice(runsMid);
    expect(onHer).toMatchObject({ endpoint: 'tryon-max' });
    expect(onHer!.inputs.model_image).toContain(upload.body.storagePath);
    expect(fit).toMatchObject({ endpoint: 'edit' });
    expect(fit!.inputs.prompt).toContain('sleeves end exactly at her wrists');
    expect(fit!.inputs.prompt).toContain('no extra fabric pooling');
    expect((await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: fitted.body.id } })).credits).toBe(2);
  });

  it('lets the catalog manager see today’s previews and credits, and hide a bad one', async () => {
    await ctx.http.get('/v1/admin/customer-previews').set(ana.auth).expect(403);
    const summary = await ctx.http.get('/v1/admin/customer-previews/summary').set(manager.auth).expect(200);
    expect(summary.body).toMatchObject({ dailyCreditLimit: 200, live: true });
    expect(summary.body.previewsToday).toBeGreaterThanOrEqual(1);
    expect(summary.body.creditsToday).toBeGreaterThanOrEqual(2);

    const list = await ctx.http.get('/v1/admin/customer-previews').set(manager.auth).expect(200);
    const item = list.body.items.find(
      (i: { hidden: boolean; status: string; choices: string[] }) => !i.hidden && i.status === 'DONE' && i.choices.includes(`Fabric: ${crepeName}`),
    );
    expect(item).toMatchObject({ design: { name: expect.any(String) }, checkNotes: expect.any(String), retries: 0 });
    expect(item.imageUrl).toEqual(expect.any(String));

    // One customer's previews only (from the "Credits by customer" table)
    const owner = (await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: item.id } })).userId;
    const mine = await ctx.http.get('/v1/admin/customer-previews').query({ userId: owner }).set(manager.auth).expect(200);
    expect(mine.body.items.length).toBeGreaterThan(0);
    const owners = await ctx.db.customerPreview.findMany({ where: { id: { in: mine.body.items.map((i: { id: string }) => i.id) } }, select: { userId: true } });
    expect(new Set(owners.map((o) => o.userId))).toEqual(new Set([owner]));
    await ctx.http.get('/v1/admin/customer-previews').query({ userId: 'not-a-uuid' }).set(manager.auth).expect(400);

    await ctx.http.patch(`/v1/admin/customer-previews/${item.id}`).set(manager.auth).send({ hidden: true }).expect(204);
    await ctx.http.get(`/v1/me/try-on/${item.id}`).set(bea.auth).expect(404);
    // The next request for those options makes a fresh picture.
    const fresh = await preview(bea, custom).expect(201);
    expect(fresh.body.id).not.toBe(item.id);
  });
  // Runs last: it moves the clock past every earlier picture's hour.
  it('keeps her recent pictures for an hour each, then deletes them; a shared preview lasts for each customer', async () => {
    const dana = await userWithRoles(ctx, ['CUSTOMER'], 'tryon-dana');
    const eve = await userWithRoles(ctx, ['CUSTOMER'], 'tryon-eve');
    const t0 = Date.now();
    // Dana makes a preview; Eve asks for the same choices 40 minutes later and shares it.
    const own = await ctx.http.post('/v1/me/try-on/previews').set(dana.auth).send({ designId, selectedOptionValueIds: custom, request: 'in a moonlit courtyard' }).expect(201);
    await ctx.runTryOn();
    expect(Date.parse(own.body.expiresAt) - t0).toBeGreaterThan(59 * 60_000);
    const shared = await ctx.http.post('/v1/me/try-on/previews').set(eve.auth).send({ designId, selectedOptionValueIds: custom, request: 'in a moonlit courtyard' }).expect(201);
    expect(shared.body.id).toBe(own.body.id);
    await ctx.db.customerPreviewAccess.update({
      where: { previewId_userId: { previewId: own.body.id, userId: eve.id } },
      data: { receivedAt: new Date(t0 + 40 * 60_000), expiresAt: new Date(t0 + 100 * 60_000) },
    });
    // A second, older picture of Dana's that is still hers.
    const older = await ctx.http.post('/v1/me/try-on/previews').set(dana.auth).send({ designId, selectedOptionValueIds: custom, request: 'in soft morning light' }).expect(201);
    await ctx.runTryOn();

    // Both are listed for Dana, newest first, each with its own hour.
    const recent = await ctx.http.get('/v1/me/try-on/recent').query({ designId }).set(dana.auth).expect(200);
    expect(recent.body.items.map((i: { id: string }) => i.id)).toEqual([older.body.id, own.body.id]);
    expect(recent.body.items[0].expiresAt).toEqual(expect.any(String));
    // Nothing for someone who never got them.
    const stranger = await userWithRoles(ctx, ['CUSTOMER'], 'tryon-stranger');
    expect((await ctx.http.get('/v1/me/try-on/recent').query({ designId }).set(stranger.auth).expect(200)).body.items).toEqual([]);
    await ctx.http.get(`/v1/me/try-on/${own.body.id}`).set(stranger.auth).expect(404);

    // 70 minutes on: Dana's hour is over, Eve still has 30 minutes on the shared preview.
    const row = await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: own.body.id } });
    await ctx.db.customerPreview.updateMany({ where: { id: { in: [own.body.id, older.body.id] } }, data: { createdAt: new Date(t0 - 5 * 60_000) } });
    await ctx.db.customerPreviewAccess.updateMany({ where: { userId: dana.id }, data: { expiresAt: new Date(t0 + 60 * 60_000) } });
    const later = new Date(t0 + 70 * 60_000);
    await ctx.runTryOn(later);
    expect((await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: own.body.id } })).purgedAt).toBeNull();
    expect(await ctx.storage.get('private', row.resultPath!)).not.toBeNull();
    const olderRow = await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: older.body.id } });
    expect(olderRow.purgedAt).toEqual(expect.any(Date));
    expect(olderRow.resultPath).toBeNull();

    // 101 minutes on: Eve's hour is over too; the shared picture is deleted, its credits stay.
    await ctx.runTryOn(new Date(t0 + 101 * 60_000));
    const gone = await ctx.db.customerPreview.findUniqueOrThrow({ where: { id: own.body.id } });
    expect(gone.resultPath).toBeNull();
    expect(gone.credits).toBeGreaterThan(0);
    expect(gone.purgedAt).toEqual(expect.any(Date));
    expect(await ctx.storage.get('private', row.resultPath!)).toBeNull();
    await ctx.http.get(`/v1/me/try-on/${own.body.id}`).set(eve.auth).expect(404);
    const list = await ctx.http.get('/v1/admin/customer-previews').query({ userId: dana.id }).set(manager.auth).expect(200);
    expect(list.body.items.find((i: { id: string }) => i.id === own.body.id)).toMatchObject({ imageUrl: null, purgedAt: expect.any(String) });
  });
  it('lists all her pictures on her profile with the abaya and the time left; nobody else sees them', async () => {
    const gia = await userWithRoles(ctx, ['CUSTOMER'], 'tryon-gia');
    const made = await ctx.http.post('/v1/me/try-on/previews').set(gia.auth).send({ designId, selectedOptionValueIds: custom, request: 'by the sea at sunset' }).expect(201);
    await ctx.runTryOn();
    const design = await ctx.db.design.findUniqueOrThrow({ where: { id: designId }, select: { name: true, slug: true } });

    const mine = await ctx.http.get('/v1/me/try-on/mine').set(gia.auth).expect(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({
      id: made.body.id,
      kind: 'PREVIEW',
      status: 'DONE',
      imageUrl: expect.any(String),
      expiresAt: expect.any(String),
      design: { name: design.name, slug: design.slug },
    });
    expect(Date.parse(mine.body.items[0].expiresAt)).toBeGreaterThan(Date.now() + 55 * 60_000);

    // Nobody else sees them, and signed-out visitors cannot ask.
    const stranger = await userWithRoles(ctx, ['CUSTOMER'], 'tryon-stranger-2');
    expect((await ctx.http.get('/v1/me/try-on/mine').set(stranger.auth).expect(200)).body.items).toEqual([]);
    await ctx.http.get('/v1/me/try-on/mine').expect(401);

    // Once her hour is over it is gone from the list.
    await ctx.db.customerPreviewAccess.updateMany({ where: { userId: gia.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await ctx.http.get('/v1/me/try-on/mine').set(gia.auth).expect(200)).body.items).toEqual([]);
  });
});
