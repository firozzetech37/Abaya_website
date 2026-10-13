import sharp from 'sharp';
import { createTestApp, FashnRequestError, type TestContext, type TestUser, userWithRoles, designChoices } from './helpers';

describe('AI Catalog with FASHN (e2e)', () => {
  let ctx: TestContext;
  let designer: TestUser;
  let other: TestUser;
  let manager: TestUser;
  let pm: TestUser;
  let abayaPath: string;
  let backPath: string;
  let modelProfileId: string;
  let masterImageId: string;

  const upload = async (user: TestUser) => {
    const res = await ctx.http
      .post('/v1/admin/uploads')
      .set(user.auth)
      .send({ purpose: 'CATALOG_INPUT', contentType: 'image/jpeg', fileName: 'photo.jpg' })
      .expect(201);
    const photo = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#222' } }).jpeg().toBuffer();
    await ctx.storage.put('private', res.body.storagePath, photo, 'image/jpeg');
    return res.body.storagePath as string;
  };
  const job = (id: string, user = designer) => ctx.http.get(`/v1/studio/catalog/jobs/${id}`).set(user.auth).expect(200);
  const lastRun = () => ctx.fashn.runs[ctx.fashn.runs.length - 1]!;

  beforeAll(async () => {
    ctx = await createTestApp();
    designer = await userWithRoles(ctx, ['DESIGNER'], 'cat-designer');
    other = await userWithRoles(ctx, ['DESIGNER'], 'cat-other');
    manager = await userWithRoles(ctx, ['CATALOG_MANAGER'], 'cat-manager');
    pm = await userWithRoles(ctx, ['PRODUCTION_MANAGER'], 'cat-pm');
  });
  afterAll(() => ctx.close());

  it('is for designers and the catalog manager, and shows credits', async () => {
    await ctx.http.get('/v1/studio/catalog/limits').set(pm.auth).expect(403);
    const limits = await ctx.http.get('/v1/studio/catalog/limits').set(designer.auth).expect(200);
    expect(limits.body).toEqual({ mode: 'live', balance: 120, usedToday: 0, dailyLimit: 40 });
  });

  it('saves a personal model only with consent', async () => {
    const imagePath = await upload(designer);
    await ctx.http.post('/v1/studio/catalog/models/personal').set(designer.auth).send({ name: 'Sara', imagePath }).expect(400);
    const res = await ctx.http
      .post('/v1/studio/catalog/models/personal')
      .set(designer.auth)
      .send({ name: 'Sara', imagePath, consent: true })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'Sara', type: 'PERSONAL' });
    const audit = await ctx.db.auditLog.findFirst({ where: { action: 'catalog.model_created', entityId: res.body.id } });
    expect(audit?.after).toMatchObject({ consent: true });
  });

  it('creates an AI model with model-create and keeps the chosen one as "Model 002"', async () => {
    const created = await ctx.http
      .post('/v1/studio/catalog/models/ai')
      .set(designer.auth)
      .send({ attributes: { age: 27, hijab: 'beige chiffon hijab' }, backgroundId: 'soft-beige-studio', resolution: '1k', mode: 'fast', numImages: 2 })
      .expect(201);
    expect(created.body).toMatchObject({ status: 'QUEUED', endpoint: 'model-create', credits: 2, stage: 'Waiting for a free slot…' });

    await ctx.runCatalog();
    expect(lastRun().endpoint).toBe('model-create');
    expect(lastRun().inputs).toMatchObject({ aspect_ratio: '4:5', resolution: '1k', generation_mode: 'fast', num_images: 2 });
    expect(String(lastRun().inputs.prompt)).toContain('wearing a beige chiffon hijab');

    const done = await job(created.body.id);
    expect(done.body.status).toBe('DONE');
    expect(done.body.images).toHaveLength(2);
    // Results are copied into our own storage (FASHN deletes its copies after 3 days).
    const stored = [...ctx.storage.files.keys()].filter((k) => k.startsWith('private/catalog-images/'));
    expect(stored).toHaveLength(2);

    const saved = await ctx.http.post('/v1/studio/catalog/models/from-image').set(designer.auth).send({ imageId: done.body.images[1].id }).expect(201);
    expect(saved.body).toMatchObject({ name: 'Model 002', type: 'AI' });
    expect(saved.body.description).toContain('beige chiffon hijab');
    modelProfileId = saved.body.id;
    const models = await ctx.http.get('/v1/studio/catalog/models').set(other.auth).expect(200);
    expect(models.body.map((m: { name: string }) => m.name)).toEqual(['Model 002', 'Sara']);
  });

  it('makes the master with tryon-max from the abaya and the saved model', async () => {
    abayaPath = await upload(designer);
    backPath = await upload(designer);
    const res = await ctx.http
      .post('/v1/studio/catalog/masters')
      .set(designer.auth)
      .send({ abayaPath, modelProfileId, garmentDescription: 'black crepe, silver vine on the chest' })
      .expect(201);
    expect(res.body).toMatchObject({ view: 'MASTER', endpoint: 'tryon-max', resolution: '2k', mode: 'balanced', credits: 3 });
    expect(res.body.prompt).toContain('The abaya: black crepe, silver vine on the chest.');

    await ctx.runCatalog();
    const run = lastRun();
    expect(run.endpoint).toBe('tryon-max');
    expect(run.inputs.product_image).toBe(`https://storage.test/signed/private/${abayaPath}`);
    expect(String(run.inputs.model_image)).toMatch(/^https:\/\/storage\.test\/signed\/private\/catalog-images\//);
    const done = await job(res.body.id);
    expect(done.body.status).toBe('DONE');
    masterImageId = done.body.images[0].id;

    // Other designers cannot see it; the catalog manager can.
    await ctx.http.get(`/v1/studio/catalog/jobs/${res.body.id}`).set(other.auth).expect(404);
    await job(res.body.id, manager);
  });

  it('starts an edit and a reframe from a design’s Images tab, remembered against the design', async () => {
    const { design } = await designChoices(ctx, 'classic-nida-closed');
    // The seed design's photo must exist in storage for the copy; put one there.
    const photo = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#333' } }).jpeg().toBuffer();
    const detail = await ctx.http.get(`/v1/admin/designs/${design.id}`).set(manager.auth).expect(200);
    await ctx.storage.put('private', detail.body.images[0].storagePath, photo, 'image/jpeg');
    const edit = await ctx.http
      .post(`/v1/studio/catalog/designs/${design.id}/edits`)
      .set(manager.auth)
      .send({ instruction: 'Make the cuffs silver' })
      .expect(201);
    expect(edit.body).toMatchObject({ view: 'EDIT', designId: design.id });
    expect(String(edit.body.inputs.sourceUrl)).toMatch(/catalog-input/);
    const reframe = await ctx.http.post(`/v1/studio/catalog/designs/${design.id}/reframe`).set(manager.auth).send({ aspectRatio: '16:9' }).expect(201);
    expect(reframe.body).toMatchObject({ view: 'REFRAME', designId: design.id });
    const mine = await ctx.http.get(`/v1/studio/catalog/jobs?designId=${design.id}`).set(manager.auth).expect(200);
    expect(mine.body.items.map((j: { id: string }) => j.id).sort()).toEqual([edit.body.id, reframe.body.id].sort());
    await ctx.http.post(`/v1/studio/catalog/designs/00000000-0000-4000-8000-000000000000/reframe`).set(manager.auth).send({ aspectRatio: '1:1' }).expect(404);
  });

  it('needs an approved master for poses, and reasons to reject', async () => {
    const early = await ctx.http.post(`/v1/studio/catalog/images/${masterImageId}/poses`).set(designer.auth).send({ poses: ['SIDE'] }).expect(422);
    expect(early.body.error.code).toBe('MASTER_NOT_APPROVED');
    await ctx.http.patch(`/v1/studio/catalog/images/${masterImageId}`).set(designer.auth).send({ review: 'REJECTED' }).expect(400);

    const approved = await ctx.http
      .patch(`/v1/studio/catalog/images/${masterImageId}`)
      .set(designer.auth)
      .send({ review: 'APPROVED', scores: { garmentFidelity: 9, embroideryFidelity: 8 } })
      .expect(200);
    expect(approved.body.images[0]).toMatchObject({ review: 'APPROVED', scores: { garmentFidelity: 9, embroideryFidelity: 8, overall: 8.5 } });
  });

  it('makes poses from the approved master with edit, flagging a back view without a back photo', async () => {
    const res = await ctx.http
      .post(`/v1/studio/catalog/images/${masterImageId}/poses`)
      .set(designer.auth)
      .send({ poses: ['SIDE', 'BACK'], resolution: '1k', mode: 'fast' })
      .expect(201);
    expect(res.body.map((j: { view: string }) => j.view)).toEqual(['SIDE', 'BACK']);
    await ctx.runCatalog();
    const runs = ctx.fashn.runs.slice(-2);
    expect(runs.every((r) => r.endpoint === 'edit')).toBe(true);
    expect(runs.every((r) => String(r.inputs.image).includes('catalog-images/'))).toBe(true);
    expect(String(runs[0]!.inputs.prompt)).toContain('Change ONLY the pose');
    expect(runs[1]!.inputs).not.toHaveProperty('image_context');
    const back = await job(res.body[1].id);
    expect(back.body.images[0].flags).toEqual(['BACK_CONSTRUCTION_UNVERIFIED']);

    // With the real back photo, FASHN gets it as the reference image and nothing is flagged.
    const withBack = await ctx.http
      .post(`/v1/studio/catalog/images/${masterImageId}/poses`)
      .set(designer.auth)
      .send({ poses: ['BACK'], backPath, resolution: '1k', mode: 'fast' })
      .expect(201);
    await ctx.runCatalog();
    expect(lastRun().inputs.image_context).toBe(`https://storage.test/signed/private/${backPath}`);
    expect((await job(withBack.body[0].id)).body.images[0].flags).toEqual([]);
  });

  it('applies a controlled edit, then retries a rejected result with a stricter prompt (twice at most)', async () => {
    const maskPath = await upload(designer);
    const edit = await ctx.http
      .post(`/v1/studio/catalog/images/${masterImageId}/edits`)
      .set(designer.auth)
      .send({ instruction: 'Add silver sequins around the chest embroidery', maskPath, resolution: '1k', mode: 'fast' })
      .expect(201);
    expect(edit.body).toMatchObject({ editType: 'EMBELLISHMENT', endpoint: 'edit' });
    expect(edit.body.prompt).toContain('Change ONLY that');
    await ctx.runCatalog();
    expect(lastRun().inputs.mask).toBe(`https://storage.test/signed/private/${maskPath}`);

    let imageId = (await job(edit.body.id)).body.images[0].id as string;
    await ctx.http.post(`/v1/studio/catalog/images/${imageId}/retry`).set(designer.auth).expect(422); // not rejected yet
    for (let attempt = 1; attempt <= 2; attempt++) {
      await ctx.http
        .patch(`/v1/studio/catalog/images/${imageId}`)
        .set(designer.auth)
        .send({ review: 'REJECTED', reasons: ['EMBROIDERY_CHANGED'], note: 'cuff vine disappeared' })
        .expect(200);
      const retry = await ctx.http.post(`/v1/studio/catalog/images/${imageId}/retry`).set(designer.auth).expect(201);
      expect(retry.body.prompt).toContain('Preserve the existing embroidery exactly');
      expect(retry.body.retryOfImageId).toBe(imageId);
      expect(retry.body.seed).toBe(edit.body.seed + attempt);
      await ctx.runCatalog();
      imageId = (await job(retry.body.id)).body.images[0].id;
    }
    await ctx.http.patch(`/v1/studio/catalog/images/${imageId}`).set(designer.auth).send({ review: 'REJECTED', reasons: ['OTHER'] }).expect(200);
    const limit = await ctx.http.post(`/v1/studio/catalog/images/${imageId}/retry`).set(designer.auth).expect(422);
    expect(limit.body.error.code).toBe('RETRY_LIMIT');
  });

  it('removes the background of an abaya photo and makes a master from the cleaned photo', async () => {
    const cleanup = await ctx.http.post('/v1/studio/catalog/cleanups').set(designer.auth).send({ imagePath: abayaPath }).expect(201);
    expect(cleanup.body).toMatchObject({ endpoint: 'background-remove', credits: 1, view: 'CLEANUP' });
    await ctx.runCatalog();
    expect(lastRun().inputs).toEqual({ image: `https://storage.test/signed/private/${abayaPath}` });
    const cleaned = (await job(cleanup.body.id)).body.images[0].id;
    const master = await ctx.http
      .post('/v1/studio/catalog/masters')
      .set(designer.auth)
      .send({ abayaImageId: cleaned, modelProfileId, resolution: '1k', mode: 'fast' })
      .expect(201);
    await ctx.runCatalog();
    expect(String(lastRun().inputs.product_image)).toContain('catalog-images/');
    expect((await job(master.body.id)).body.status).toBe('DONE');
    // Only cleaned photos: a master image is not a product photo.
    await ctx.http.post('/v1/studio/catalog/masters').set(designer.auth).send({ abayaImageId: masterImageId, modelProfileId }).expect(422);
    await ctx.http.post('/v1/studio/catalog/masters').set(designer.auth).send({ abayaPath, abayaImageId: cleaned, modelProfileId }).expect(400);
  });

  it('makes the 4K final of an approved image with the same seed', async () => {
    const master = (await ctx.db.catalogImage.findUniqueOrThrow({ where: { id: masterImageId }, include: { job: true } })).job;
    const final = await ctx.http.post(`/v1/studio/catalog/images/${masterImageId}/final`).set(designer.auth).expect(201);
    expect(final.body).toMatchObject({ resolution: '4k', mode: 'quality', credits: 5, seed: master.seed, view: 'MASTER', prompt: master.prompt });
    await ctx.runCatalog();
    expect(lastRun().inputs).toMatchObject({ resolution: '4k', generation_mode: 'quality', seed: master.seed });
    const finalImage = (await job(final.body.id)).body.images[0].id;
    await ctx.http.patch(`/v1/studio/catalog/images/${finalImage}`).set(designer.auth).send({ review: 'APPROVED' }).expect(200);
    const again = await ctx.http.post(`/v1/studio/catalog/images/${finalImage}/final`).set(designer.auth).expect(422);
    expect(again.body.error.code).toBe('ALREADY_FINAL');
  });

  it('adds an approved image to a design as a photo', async () => {
    const design = await ctx.http
      .post('/v1/admin/designs')
      .set(designer.auth)
      .send({ name: 'Catalog Test Abaya', style: 'CLOSED', tags: [], leadTimeDays: 12 })
      .expect(201);
    const res = await ctx.http.post(`/v1/studio/catalog/images/${masterImageId}/design`).set(designer.auth).send({ designId: design.body.id }).expect(200);
    expect(res.body.images).toHaveLength(1);
    expect(res.body.images[0].storagePath).toMatch(/^design-images\//);
  });

  it('turns FASHN failures into clear messages, retries temporary ones, and charges nothing for them', async () => {
    const usedBefore = (await ctx.http.get('/v1/studio/catalog/limits').set(designer.auth).expect(200)).body.usedToday;

    ctx.fashn.failNext = 'ContentModerationError';
    const blocked = await ctx.http.post('/v1/studio/catalog/masters').set(designer.auth).send({ abayaPath, modelProfileId, resolution: '1k', mode: 'fast' }).expect(201);
    await ctx.runCatalog();
    const failed = await job(blocked.body.id);
    expect(failed.body.status).toBe('FAILED');
    expect(failed.body.error).toMatch(/content rules/);
    expect(JSON.stringify(failed.body)).not.toContain('raw provider text');

    ctx.fashn.failNext = 'UnavailableError';
    const flaky = await ctx.http.post('/v1/studio/catalog/masters').set(designer.auth).send({ abayaPath, modelProfileId, resolution: '1k', mode: 'fast' }).expect(201);
    await ctx.runCatalog();
    expect((await job(flaky.body.id)).body.status).toBe('DONE');

    ctx.fashn.rejectRun = new FashnRequestError('auth', 'UnauthorizedAccess');
    const badKey = await ctx.http.post('/v1/studio/catalog/masters').set(designer.auth).send({ abayaPath, modelProfileId, resolution: '1k', mode: 'fast' }).expect(201);
    await ctx.runCatalog();
    expect((await job(badKey.body.id)).body.error).toMatch(/API key is not valid/);

    const usedAfter = (await ctx.http.get('/v1/studio/catalog/limits').set(designer.auth).expect(200)).body.usedToday;
    expect(usedAfter - usedBefore).toBe(1); // only the one that succeeded
  });

  it('stops at the daily credit limit before anything is sent', async () => {
    // 19 credits used so far today; 4 images in 4K quality cost 20.
    const big = { abayaPath, modelProfileId, resolution: '4k', mode: 'quality', numImages: 4 };
    await ctx.http.post('/v1/studio/catalog/masters').set(designer.auth).send(big).expect(201);
    await ctx.runCatalog();
    const runsBefore = ctx.fashn.runs.length;
    const res = await ctx.http.post('/v1/studio/catalog/masters').set(designer.auth).send(big).expect(422);
    expect(res.body.error).toMatchObject({ code: 'DAILY_CREDIT_LIMIT', details: { cost: 20, used: 39, limit: 40 } });
    await ctx.runCatalog();
    expect(ctx.fashn.runs.length).toBe(runsBefore);
  });

  it('never runs more than 6 FASHN jobs at once', async () => {
    ctx.fashn.instant = false;
    const runsBefore = ctx.fashn.runs.length;
    for (let i = 0; i < 7; i++) {
      await ctx.http.post('/v1/studio/catalog/models/ai').set(manager.auth).send({ attributes: {}, resolution: '1k', mode: 'fast' }).expect(201);
    }
    await ctx.runCatalog();
    expect(ctx.fashn.runs.length - runsBefore).toBe(6);
    ctx.fashn.finishAll();
    ctx.fashn.instant = true;
    await ctx.runCatalog();
    expect(ctx.fashn.runs.length - runsBefore).toBe(7);
    expect(await ctx.db.catalogJob.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } })).toBe(0);
  });

  it('phrases the master and poses for the abaya style, embroidery and the designer direction', async () => {
    const otherAbaya = await upload(other);
    const master = await ctx.http
      .post('/v1/studio/catalog/masters')
      .set(other.auth)
      .send({
        abayaPath: otherAbaya,
        modelProfileId,
        style: 'OPEN_FRONT',
        embroidery: ['BACK'],
        direction: 'soft evening light, gentle breeze',
        resolution: '1k',
        mode: 'fast',
      })
      .expect(201);
    expect(master.body.prompt).toContain('Designer direction: soft evening light, gentle breeze.');
    expect(master.body.prompt).toContain('The abaya itself must still match the product photo exactly.');
    await ctx.runCatalog();
    const image = (await job(master.body.id, other)).body.images[0].id;
    await ctx.http.patch(`/v1/studio/catalog/images/${image}`).set(other.auth).send({ review: 'APPROVED' }).expect(200);
    const poses = await ctx.http
      .post(`/v1/studio/catalog/images/${image}/poses`)
      .set(other.auth)
      .send({ poses: ['FRONT_2', 'BACK'], direction: 'calm expression', resolution: '1k', mode: 'fast' })
      .expect(201);
    expect(poses.body[0].prompt).toContain('open front gently parts');
    expect(poses.body[0].prompt).toContain('Designer direction: calm expression.');
    expect(poses.body[1].prompt).toContain('back embroidery is fully visible');

    // The saved model has now worn three abaya photos (original, cleaned, this one): the panel
    // nudges designers towards a new face for each abaya.
    const models = await ctx.http.get('/v1/studio/catalog/models').set(other.auth).expect(200);
    expect(models.body.find((m: { id: string }) => m.id === modelProfileId).abayaCount).toBe(3);
  });

  it('uses the designer\'s own background photo as the reference for a background edit', async () => {
    const background = await upload(other);
    const own = (await ctx.db.catalogImage.findFirstOrThrow({ where: { job: { createdById: other.id, view: 'MASTER' } } })).id;
    const edit = await ctx.http
      .post(`/v1/studio/catalog/images/${own}/edits`)
      .set(other.auth)
      .send({ instruction: 'Change the background to the reference photo', contextPath: background, resolution: '1k', mode: 'fast' })
      .expect(201);
    expect(edit.body.editType).toBe('BACKGROUND');
    await ctx.runCatalog();
    expect(lastRun().inputs.image_context).toBe(`https://storage.test/signed/private/${background}`);
    await ctx.http
      .post(`/v1/studio/catalog/images/${own}/edits`)
      .set(other.auth)
      .send({ instruction: 'Change the background', contextPath: 'qc-photos/2026/01/00000000-0000-4000-8000-000000000000.jpg' })
      .expect(422);
  });

  it('keeps saved directions as presets the whole team can use', async () => {
    const created = await ctx.http
      .post('/v1/studio/catalog/presets')
      .set(designer.auth)
      .send({ name: 'Eid golden hour', text: 'warm golden-hour light, festive but elegant' })
      .expect(201);
    const list = await ctx.http.get('/v1/studio/catalog/presets').set(other.auth).expect(200);
    expect(list.body[0]).toMatchObject({ name: 'Eid golden hour', text: 'warm golden-hour light, festive but elegant' });
    await ctx.http.delete(`/v1/studio/catalog/presets/${created.body.id}`).set(other.auth).expect(404);
    await ctx.http.delete(`/v1/studio/catalog/presets/${created.body.id}`).set(manager.auth).expect(204);
    expect((await ctx.http.get('/v1/studio/catalog/presets').set(designer.auth).expect(200)).body).toEqual([]);
  });

  describe('one step (product-to-model)', () => {
    let solo: TestUser;
    beforeAll(async () => {
      solo = await userWithRoles(ctx, ['DESIGNER'], 'cat-solo');
    });

    it('makes a new model wearing the abaya in the chosen Arabian setting in one call', async () => {
      const abaya = await upload(solo);
      const res = await ctx.http
        .post('/v1/studio/catalog/masters/one-step')
        .set(solo.auth)
        .send({
          abayaPath: abaya,
          attributes: { features: 'heart-shaped face, warm brown eyes with long lashes' },
          backgroundId: 'desert-golden-hour',
          style: 'OPEN_FRONT',
          resolution: '2k',
          mode: 'balanced',
        })
        .expect(201);
      expect(res.body).toMatchObject({ kind: 'PRODUCT_TO_MODEL', view: 'MASTER', endpoint: 'product-to-model', credits: 3, style: 'OPEN_FRONT' });
      expect(res.body.prompt).toContain('heart-shaped face');
      expect(res.body.prompt).toContain('covering all her hair');
      expect(res.body.prompt).toContain('small structured mini top-handle bag');
      expect(res.body.prompt).toContain('about 5–6 m away');
      expect(res.body.prompt).toContain('Arabian desert dunes at golden hour');

      await ctx.runCatalog();
      expect(lastRun().endpoint).toBe('product-to-model');
      expect(lastRun().inputs).toMatchObject({
        product_image: `https://storage.test/signed/private/${abaya}`,
        aspect_ratio: '4:5',
        resolution: '2k',
        generation_mode: 'balanced',
      });
      expect(lastRun().inputs).not.toHaveProperty('face_reference');
      expect(lastRun().inputs).not.toHaveProperty('background_reference');

      // Poses come from the approved one-step master, exactly as before.
      const image = (await job(res.body.id, solo)).body.images[0].id;
      await ctx.http.patch(`/v1/studio/catalog/images/${image}`).set(solo.auth).send({ review: 'APPROVED' }).expect(200);
      const poses = await ctx.http
        .post(`/v1/studio/catalog/images/${image}/poses`)
        .set(solo.auth)
        .send({ poses: ['THREE_QUARTER'], resolution: '1k', mode: 'fast' })
        .expect(201);
      expect(poses.body[0]).toMatchObject({ endpoint: 'edit', credits: 1 });
      await ctx.runCatalog();
      expect(lastRun().inputs).not.toHaveProperty('face_reference');
    });

    it('uses a face photo only with consent (3 more credits), and your own background photo', async () => {
      const abaya = await upload(solo);
      const face = await upload(solo);
      const background = await upload(solo);
      const base = { abayaPath: abaya, attributes: { heightCm: 155 }, facePath: face, backgroundPath: background, resolution: '1k', mode: 'fast' };
      await ctx.http.post('/v1/studio/catalog/masters/one-step').set(solo.auth).send(base).expect(400);
      const res = await ctx.http.post('/v1/studio/catalog/masters/one-step').set(solo.auth).send({ ...base, faceConsent: true }).expect(201);
      expect(res.body.credits).toBe(4); // 1 + face reference 3
      expect(res.body.prompt).toContain('the woman from the face reference');
      expect(res.body.prompt).toContain('She is about 155 cm tall (petite)');
      expect(res.body.prompt).toContain('the background from the background reference');
      await ctx.runCatalog();
      expect(lastRun().inputs).toMatchObject({
        face_reference: `https://storage.test/signed/private/${face}`,
        face_reference_mode: 'match_reference',
        background_reference: `https://storage.test/signed/private/${background}`,
      });
      // The 4K final keeps the face and background photos (and their cost).
      const image = (await job(res.body.id, solo)).body.images[0].id;
      await ctx.http.patch(`/v1/studio/catalog/images/${image}`).set(solo.auth).send({ review: 'APPROVED' }).expect(200);
      const final = await ctx.http.post(`/v1/studio/catalog/images/${image}/final`).set(solo.auth).expect(201);
      expect(final.body).toMatchObject({ endpoint: 'product-to-model', resolution: '4k', credits: 8 });
      const audit = await ctx.db.auditLog.findFirst({ where: { action: 'catalog.generation_requested', entityId: res.body.id } });
      expect(audit?.after).toMatchObject({ views: ['MASTER'], credits: 4 });
    });
  });

  it('makes the master from a sketch with design references, then applies a reference with one edit', async () => {
    const sketcher = await userWithRoles(ctx, ['DESIGNER'], 'cat-sketch');
    const sketch = await upload(sketcher);
    const fabric = await upload(sketcher);
    const embroidery = await upload(sketcher);
    await ctx.http
      .post('/v1/studio/catalog/masters/one-step')
      .set(sketcher.auth)
      .send({ abayaPath: sketch, attributes: {}, references: [{ type: 'FABRIC_COLOUR', path: 'qc-photos/2026/01/00000000-0000-4000-8000-000000000000.jpg' }] })
      .expect(422);
    const res = await ctx.http
      .post('/v1/studio/catalog/masters/one-step')
      .set(sketcher.auth)
      .send({
        abayaPath: sketch,
        sketch: true,
        attributes: {},
        references: [
          { type: 'FABRIC_COLOUR', path: fabric, note: 'matte black nida' },
          { type: 'EMBROIDERY', path: embroidery, note: 'silver zari vine' },
        ],
        resolution: '1k',
        mode: 'fast',
      })
      .expect(201);
    expect(res.body.sketch).toBe(true);
    expect(res.body.prompt).toContain("The product image is the designer's sketch");
    expect(res.body.prompt).toContain('Design details: Fabric and colour: matte black nida; Embroidery: silver zari vine.');
    expect(res.body.references).toEqual([
      { type: 'FABRIC_COLOUR', path: fabric, url: `https://storage.test/signed/private/${fabric}`, note: 'matte black nida' },
      { type: 'EMBROIDERY', path: embroidery, url: `https://storage.test/signed/private/${embroidery}`, note: 'silver zari vine' },
    ]);
    await ctx.runCatalog();
    expect(lastRun().inputs.product_image).toBe(`https://storage.test/signed/private/${sketch}`);

    // The fabric reference is applied to the master as a focused edit (FASHN image_context).
    const image = (await job(res.body.id, sketcher)).body.images[0].id;
    const edit = await ctx.http
      .post(`/v1/studio/catalog/images/${image}/edits`)
      .set(sketcher.auth)
      .send({
        instruction: 'Change the abaya fabric and colour to match the fabric in the reference image (matte black nida)',
        editType: 'FABRIC',
        contextPath: fabric,
        resolution: '1k',
        mode: 'fast',
      })
      .expect(201);
    expect(edit.body.references).toHaveLength(2); // still listed on everything made from this master
    await ctx.runCatalog();
    expect(lastRun().inputs).toMatchObject({ image_context: `https://storage.test/signed/private/${fabric}` });
  });

  it('uses the designer\'s own bag, shoes and accessories, and needs a description for "Custom"', async () => {
    const stylist = await userWithRoles(ctx, ['DESIGNER'], 'cat-stylist');
    const abaya = await upload(stylist);
    const send = (styling: Record<string, unknown>) =>
      ctx.http.post('/v1/studio/catalog/masters/one-step').set(stylist.auth).send({ abayaPath: abaya, attributes: {}, styling, resolution: '1k', mode: 'fast' });
    await send({ handbag: 'CUSTOM' }).expect(400);
    const res = await send({
      handbag: 'CUSTOM',
      handbagCustom: 'small pearl-beaded mini bag in ivory',
      shoes: 'CUSTOM',
      shoesCustom: 'gold embellished khussa flats',
      accessories: ['EARRINGS'],
      accessoriesCustom: 'thin gold chain belt',
    }).expect(201);
    expect(res.body.prompt).toContain('She carries a small pearl-beaded mini bag in ivory');
    expect(res.body.prompt).toContain('She wears gold embellished khussa flats');
    expect(res.body.prompt).toContain('Accessories: delicate earrings just visible at the edge of the shayla, thin gold chain belt');
    expect(res.body.prompt).not.toContain('No jewellery');
  });

  it('describes a reference photo in a few words with Gemini (free), for its note', async () => {
    const stylist = await userWithRoles(ctx, ['DESIGNER'], 'cat-describe');
    const fabric = await upload(stylist);
    const res = await ctx.http.post('/v1/studio/catalog/references/describe').set(stylist.auth).send({ type: 'FABRIC_COLOUR', path: fabric }).expect(200);
    expect(res.body).toEqual({ description: 'Dusty mauve satin with a soft sheen', available: true });
    expect(ctx.describer.asked.at(-1)).toContain('exact colour shade');
    await ctx.http
      .post('/v1/studio/catalog/references/describe')
      .set(stylist.auth)
      .send({ type: 'FABRIC_COLOUR', path: 'qc-photos/2026/01/00000000-0000-4000-8000-000000000000.jpg' })
      .expect(422);
    ctx.describer.available = false;
    const off = await ctx.http.post('/v1/studio/catalog/references/describe').set(stylist.auth).send({ type: 'EMBROIDERY', path: fabric }).expect(200);
    expect(off.body).toEqual({ description: null, available: false });
    ctx.describer.available = true;
  });

  it('applies the references automatically after the master, one after another', async () => {
    const chain = await userWithRoles(ctx, ['DESIGNER'], 'cat-chain');
    const sketch = await upload(chain);
    const pattern = await upload(chain);
    const fabric = await upload(chain);
    await ctx.runCatalog(); // finish anything earlier tests left queued
    const runsBefore = ctx.fashn.runs.length;
    const res = await ctx.http
      .post('/v1/studio/catalog/masters/one-step')
      .set(chain.auth)
      .send({
        abayaPath: sketch,
        sketch: true,
        style: 'KIMONO',
        attributes: {},
        references: [
          { type: 'FABRIC_PATTERN', path: pattern, note: 'small paisley' },
          { type: 'FABRIC_COLOUR', path: fabric, note: 'dusty mauve satin' },
        ],
        applyReferences: true,
        resolution: '1k',
        mode: 'fast',
      })
      .expect(201);
    expect(res.body.view).toBe('MASTER');
    const jobs = await ctx.db.catalogJob.findMany({ where: { createdById: chain.id }, orderBy: { createdAt: 'asc' } });
    expect(jobs.map((j) => [j.view, j.editType, j.creditsEstimated])).toEqual([
      ['MASTER', null, 1],
      ['EDIT', 'FABRIC', 1], // fabric colour first
      ['EDIT', 'FABRIC', 1], // then the print
    ]);
    expect(jobs[1]!.afterJobId).toBe(jobs[0]!.id);
    expect(jobs[2]!.afterJobId).toBe(jobs[1]!.id);
    const limits = await ctx.http.get('/v1/studio/catalog/limits').set(chain.auth).expect(200);
    expect(limits.body.usedToday).toBe(3);

    await ctx.runCatalog();
    const runs = ctx.fashn.runs.slice(runsBefore);
    expect(runs.map((r) => r.endpoint)).toEqual(['product-to-model', 'edit', 'edit']);
    expect(runs[1]!.inputs.image_context).toBe(`https://storage.test/signed/private/${fabric}`);
    expect(runs[2]!.inputs.image_context).toBe(`https://storage.test/signed/private/${pattern}`);
    const done = await Promise.all(jobs.map((j) => job(j.id, chain)));
    // Each step starts from the image the step before made.
    expect(runs[1]!.inputs.image).toContain(done[0]!.body.images[0].url.replace('https://storage.test/signed/private/', ''));
    expect(runs[2]!.inputs.image).toContain(done[1]!.body.images[0].url.replace('https://storage.test/signed/private/', ''));
    expect(done[2]!.body).toMatchObject({ status: 'DONE', afterJobId: jobs[1]!.id, style: 'KIMONO', parentImageId: done[1]!.body.images[0].id });

    // Poses can be made from the approved final edit (it keeps the master's style).
    const last = done[2]!.body.images[0].id;
    await ctx.http.patch(`/v1/studio/catalog/images/${last}`).set(chain.auth).send({ review: 'APPROVED' }).expect(200);
    const poses = await ctx.http.post(`/v1/studio/catalog/images/${last}/poses`).set(chain.auth).send({ poses: ['FRONT_2'], resolution: '1k', mode: 'fast' }).expect(201);
    expect(poses.body[0].prompt).toContain('wide sleeves');
  });

  it('stops the chain when the master fails, charging nothing for the skipped steps', async () => {
    const chain = await userWithRoles(ctx, ['DESIGNER'], 'cat-chain-fail');
    const abaya = await upload(chain);
    const fabric = await upload(chain);
    await ctx.runCatalog(); // finish anything earlier tests left queued
    ctx.fashn.failNext = 'ContentModerationError';
    await ctx.http
      .post('/v1/studio/catalog/masters/one-step')
      .set(chain.auth)
      .send({ abayaPath: abaya, attributes: {}, references: [{ type: 'FABRIC_COLOUR', path: fabric }], applyReferences: true, resolution: '1k', mode: 'fast' })
      .expect(201);
    await ctx.runCatalog();
    const jobs = await ctx.db.catalogJob.findMany({ where: { createdById: chain.id }, orderBy: { createdAt: 'asc' } });
    expect(jobs.map((j) => j.status)).toEqual(['FAILED', 'FAILED']);
    expect(jobs[1]!.error).toBe('Not made: the step before it failed.');
    expect((await ctx.http.get('/v1/studio/catalog/limits').set(chain.auth).expect(200)).body.usedToday).toBe(0);
  });

  it('puts approved images in the catalog: a new design, a whole set, and the main photo', async () => {
    const owner = await userWithRoles(ctx, ['DESIGNER'], 'cat-owner');
    const abaya = await upload(owner);
    await ctx.runCatalog();
    const master = await ctx.http
      .post('/v1/studio/catalog/masters/one-step')
      .set(owner.auth)
      .send({ abayaPath: abaya, attributes: {}, style: 'BUTTERFLY', resolution: '1k', mode: 'fast' })
      .expect(201);
    await ctx.runCatalog();
    const masterImage = (await job(master.body.id, owner)).body.images[0].id;

    // Not approved yet: refused.
    await ctx.http.post(`/v1/studio/catalog/images/${masterImage}/new-design`).set(owner.auth).send({ name: 'Wings of Dusk', style: 'BUTTERFLY' }).expect(422);
    await ctx.http.patch(`/v1/studio/catalog/images/${masterImage}`).set(owner.auth).send({ review: 'APPROVED' }).expect(200);

    // 1. A new draft design with this image as its main photo, marked as AI-made.
    const design = await ctx.http
      .post(`/v1/studio/catalog/images/${masterImage}/new-design`)
      .set(owner.auth)
      .send({ name: 'Wings of Dusk', style: 'BUTTERFLY' })
      .expect(201);
    expect(design.body).toMatchObject({ name: 'Wings of Dusk', status: 'DRAFT', source: 'AI_GENERATED', aiGeneration: { generationId: master.body.id } });
    expect(design.body.images).toHaveLength(1);
    expect(design.body.images[0].isPrimary).toBe(true);
    expect((await job(master.body.id, owner)).body.images[0].designId).toBe(design.body.id); // "In catalog"

    // 2. The whole set (poses) in order, one of them becoming the main photo.
    const poses = await ctx.http
      .post(`/v1/studio/catalog/images/${masterImage}/poses`)
      .set(owner.auth)
      .send({ poses: ['FRONT_2', 'SIDE'], resolution: '1k', mode: 'fast' })
      .expect(201);
    await ctx.runCatalog();
    const poseImages: string[] = [];
    for (const p of poses.body) poseImages.push((await job(p.id, owner)).body.images[0].id);
    // One pose not approved: nothing is added at all.
    await ctx.http.patch(`/v1/studio/catalog/images/${poseImages[0]}`).set(owner.auth).send({ review: 'APPROVED' }).expect(200);
    await ctx.http
      .post(`/v1/studio/catalog/designs/${design.body.id}/images`)
      .set(owner.auth)
      .send({ imageIds: [masterImage, ...poseImages] })
      .expect(422);
    expect(await ctx.db.designImage.count({ where: { designId: design.body.id } })).toBe(1);

    await ctx.http.patch(`/v1/studio/catalog/images/${poseImages[1]}`).set(owner.auth).send({ review: 'APPROVED' }).expect(200);
    // The set shows one colour (customers see it when they pick that colour); only a colour option will do.
    const navy = await ctx.db.optionValue.findFirstOrThrow({ where: { group: { code: 'COLOUR' }, isActive: true } });
    const fabric = await ctx.db.optionValue.findFirstOrThrow({ where: { group: { code: 'FABRIC' } } });
    await ctx.http
      .post(`/v1/studio/catalog/designs/${design.body.id}/images`)
      .set(owner.auth)
      .send({ imageIds: [masterImage, ...poseImages], colourValueId: fabric.id })
      .expect(422);
    expect(await ctx.db.designImage.count({ where: { designId: design.body.id } })).toBe(1);
    const set = await ctx.http
      .post(`/v1/studio/catalog/designs/${design.body.id}/images`)
      .set(owner.auth)
      .send({ imageIds: [masterImage, ...poseImages], primaryImageId: poseImages[0], colourValueId: navy.id })
      .expect(200);
    expect(set.body).toEqual({ added: 2, skipped: 1 }); // the master was already in it
    const photos = await ctx.db.designImage.findMany({ where: { designId: design.body.id }, orderBy: { sortOrder: 'asc' } });
    expect(photos).toHaveLength(3);
    expect(photos.filter((p) => p.isPrimary)).toHaveLength(1);
    expect(photos[1]!.isPrimary).toBe(true); // the first pose is now the main photo
    expect(photos.map((p) => p.colourValueId)).toEqual([null, navy.id, navy.id]); // the master keeps its "every colour" tag

    // 3. Only to designs you can edit.
    const stranger = await userWithRoles(ctx, ['DESIGNER'], 'cat-stranger');
    const theirs = await ctx.http.post('/v1/admin/designs').set(stranger.auth).send({ name: 'Not Yours', style: 'CLOSED', tags: [], leadTimeDays: 12 }).expect(201);
    await ctx.http.post(`/v1/studio/catalog/images/${masterImage}/design`).set(owner.auth).send({ designId: theirs.body.id }).expect(404);
  });

  it('pages the history and polls only the jobs still being made', async () => {
    const pager = await userWithRoles(ctx, ['DESIGNER'], 'cat-pager');
    await ctx.runCatalog();
    for (let i = 0; i < 3; i++) {
      await ctx.http.post('/v1/studio/catalog/models/ai').set(pager.auth).send({ attributes: {}, resolution: '1k', mode: 'fast' }).expect(201);
    }
    const active = await ctx.http.get('/v1/studio/catalog/jobs/active').set(pager.auth).expect(200);
    expect(active.body).toHaveLength(3);
    const first = await ctx.http.get('/v1/studio/catalog/jobs?limit=2').set(pager.auth).expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await ctx.http.get(`/v1/studio/catalog/jobs?limit=2&cursor=${first.body.nextCursor}`).set(pager.auth).expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    await ctx.runCatalog();
    expect((await ctx.http.get('/v1/studio/catalog/jobs/active').set(pager.auth).expect(200)).body).toEqual([]);
  });

  it('makes "4 images" a photoshoot of one model: full body, close-up, left and right', async () => {
    const shoot = await userWithRoles(ctx, ['DESIGNER'], 'cat-shoot');
    const abaya = await upload(shoot);
    const fabric = await upload(shoot);
    await ctx.runCatalog();
    const runsBefore = ctx.fashn.runs.length;
    const res = await ctx.http
      .post('/v1/studio/catalog/masters/one-step')
      .set(shoot.auth)
      .send({
        abayaPath: abaya,
        attributes: {},
        references: [{ type: 'FABRIC_COLOUR', path: fabric, note: 'dusty mauve satin' }],
        applyReferences: true,
        numImages: 4,
        resolution: '2k',
        mode: 'balanced',
      })
      .expect(201);
    expect(res.body).toMatchObject({ view: 'MASTER', numImages: 1, credits: 3 });
    const jobs = await ctx.db.catalogJob.findMany({ where: { createdById: shoot.id }, orderBy: { createdAt: 'asc' } });
    expect(jobs.map((j) => j.view)).toEqual(['MASTER', 'EDIT', 'CLOSE_UP', 'LEFT_ANGLE', 'RIGHT_ANGLE']);
    // The shots all wait for the image with the reference applied, not for each other.
    expect(jobs.slice(2).every((j) => j.afterJobId === jobs[1]!.id)).toBe(true);
    expect(jobs.reduce((n, j) => n + j.creditsEstimated, 0)).toBe(15); // 5 × 3 credits at 2K balanced

    await ctx.runCatalog();
    const runs = ctx.fashn.runs.slice(runsBefore);
    expect(runs.map((r) => r.endpoint)).toEqual(['product-to-model', 'edit', 'edit', 'edit', 'edit']);
    const referenced = (await job(jobs[1]!.id, shoot)).body.images[0].url.replace('https://storage.test/signed/private/', '');
    for (const r of runs.slice(2)) expect(r.inputs.image).toContain(referenced);
    expect(String(runs[2]!.inputs.prompt)).toContain('waist-up fashion portrait');
    expect(String(runs[3]!.inputs.prompt)).toContain('to her left');
    expect(String(runs[4]!.inputs.prompt)).toContain('to her right');
    const shots = await Promise.all(jobs.slice(2).map((j) => job(j.id, shoot)));
    expect(shots.map((s) => s.body.status)).toEqual(['DONE', 'DONE', 'DONE']);

    // 2 images: full body + close-up; 3 images: full body + left + right.
    const two = await ctx.http.post('/v1/studio/catalog/masters/one-step').set(shoot.auth).send({ abayaPath: abaya, attributes: {}, numImages: 2, resolution: '1k', mode: 'fast' }).expect(201);
    const three = await ctx.http.post('/v1/studio/catalog/masters/one-step').set(shoot.auth).send({ abayaPath: abaya, attributes: {}, numImages: 3, resolution: '1k', mode: 'fast' }).expect(201);
    const after = async (id: string) =>
      (await ctx.db.catalogJob.findMany({ where: { afterJobId: id }, orderBy: { createdAt: 'asc' } })).map((j) => j.view);
    expect(await after(two.body.id)).toEqual(['CLOSE_UP']);
    expect(await after(three.body.id)).toEqual(['LEFT_ANGLE', 'RIGHT_ANGLE']);
  });
});
