import { createTestApp, designChoices, directionFor, lookingLike, type TestContext, type TestUser, userWithRoles } from './helpers';

interface Similar {
  kind: 'DESIGN' | 'REFERENCE';
  id: string;
  name: string | null;
  imageUrl: string | null;
  level: 'DUPLICATE' | 'SIMILAR';
  score: number;
}

describe('AI assistant: tag suggestions and duplicate detection (e2e)', () => {
  let ctx: TestContext;
  let designer: TestUser;
  let otherDesigner: TestUser;
  let manager: TestUser;
  let qc: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    designer = await userWithRoles(ctx, ['DESIGNER']);
    otherDesigner = await userWithRoles(ctx, ['DESIGNER'], 'designer-two');
    manager = await userWithRoles(ctx, ['CATALOG_MANAGER']);
    qc = await userWithRoles(ctx, ['QC']);
  });
  afterAll(() => ctx.close());

  async function upload(user: TestUser, purpose: 'DESIGN_IMAGE' | 'REFERENCE_IMAGE' = 'DESIGN_IMAGE'): Promise<string> {
    const res = await ctx.http.post('/v1/admin/uploads').set(user.auth).send({ fileName: 'a.jpg', contentType: 'image/jpeg', purpose }).expect(201);
    return res.body.storagePath as string;
  }

  /** A draft design with one image that the fake AI sees as `look`. */
  async function designWithImage(user: TestUser, name: string, look?: number[]) {
    const created = await ctx.http.post('/v1/admin/designs').set(user.auth).send({ name, style: 'CLOSED' }).expect(201);
    const path = await upload(user);
    if (look) ctx.analyzer.looks.set(path, look);
    const detail = await ctx.http.post(`/v1/admin/designs/${created.body.id}/images`).set(user.auth).send({ storagePath: path }).expect(201);
    return { id: created.body.id as string, path, imageId: detail.body.images[0].id as string };
  }

  const insights = async (user: TestUser, designId: string) =>
    (await ctx.http.get(`/v1/admin/designs/${designId}/ai`).set(user.auth).expect(200)).body as {
      status: string;
      analysedImages: number;
      totalImages: number;
      suggestion: { tags: { tag: string }[]; style: { value: string } | null; altText: string | null } | null;
      similar: Similar[];
      hasDuplicate: boolean;
    };

  const listLevel = async (designId: string) => {
    const res = await ctx.http.get('/v1/admin/designs?limit=100').set(manager.auth).expect(200);
    return (res.body.items as { id: string; aiMatch: string | null }[]).find((d) => d.id === designId)?.aiMatch;
  };

  it('analyses new images in the background and suggests tags, a style and alt text', async () => {
    const a = await designWithImage(designer, 'Midnight Butterfly', directionFor('look-a'));

    const before = await insights(designer, a.id);
    expect(before).toMatchObject({ status: 'PENDING', analysedImages: 0, totalImages: 1, suggestion: null, similar: [] });

    const run = await ctx.runAi();
    expect(run.done).toBeGreaterThan(0);
    expect(ctx.analyzer.analysed.some((url) => url.includes(a.path) && url.includes('signed/private'))).toBe(true);

    const after = await insights(designer, a.id);
    expect(after.status).toBe('READY');
    expect(after.suggestion!.tags.map((t) => t.tag)).toEqual(['black', 'embroidery']);
    expect(after.suggestion!.style).toMatchObject({ value: 'BUTTERFLY' });
    expect(after.suggestion!.altText).toBe('Black butterfly abaya with embroidery');

    // Designers may only act on their own designs.
    await ctx.http.post(`/v1/admin/designs/${a.id}/ai/apply`).set(otherDesigner.auth).send({ tags: ['black'] }).expect(404);
    const applied = await ctx.http
      .post(`/v1/admin/designs/${a.id}/ai/apply`)
      .set(designer.auth)
      .send({ tags: ['black'], style: 'BUTTERFLY', altText: 'Black butterfly abaya with embroidery' })
      .expect(200);
    expect(applied.body).toMatchObject({ tags: ['black'], style: 'BUTTERFLY' });
    expect(applied.body.images[0].alt).toBe('Black butterfly abaya with embroidery');
    expect((await insights(designer, a.id)).suggestion).toBeNull();

    const audit = await ctx.db.auditLog.findFirst({ where: { entityId: a.id, action: 'design.updated' } });
    expect(audit?.after).toMatchObject({ tags: ['black'], style: 'BUTTERFLY' });
  });

  it('flags likely duplicates and look-alikes, without showing other designers their work', async () => {
    const base = directionFor('look-original');
    const original = await designWithImage(designer, 'Original Pleats', base);
    const copy = await designWithImage(otherDesigner, 'Suspicious Copy', lookingLike(base, 0.975, 'crop'));
    const cousin = await designWithImage(otherDesigner, 'Distant Cousin', lookingLike(base, 0.945, 'near'));
    await ctx.runAi();

    const asOwner = await insights(otherDesigner, copy.id);
    expect(asOwner.hasDuplicate).toBe(true);
    expect(asOwner.similar[0]).toMatchObject({ kind: 'DESIGN', id: original.id, level: 'DUPLICATE', name: null, imageUrl: null });
    expect(asOwner.similar[0]!.score).toBeCloseTo(0.975, 2);

    const asManager = await insights(manager, copy.id);
    expect(asManager.similar.find((s) => s.id === original.id)).toMatchObject({ name: 'Original Pleats', level: 'DUPLICATE' });
    expect(asManager.similar.find((s) => s.id === original.id)!.imageUrl).toMatch(/^https:\/\/storage\.test\//);

    const forCousin = await insights(manager, cousin.id);
    expect(forCousin.similar.find((s) => s.id === original.id)).toMatchObject({ level: 'SIMILAR' });
    expect(forCousin.hasDuplicate).toBe(false);

    expect(await listLevel(original.id)).toBe('DUPLICATE');
    expect(await listLevel(copy.id)).toBe('DUPLICATE');
    expect(await listLevel(cousin.id)).toBe('SIMILAR');

    // Removing the copied image removes the match everywhere.
    await ctx.http.delete(`/v1/admin/designs/${copy.id}/images/${copy.imageId}`).set(otherDesigner.auth).expect(200);
    expect(await insights(manager, copy.id)).toMatchObject({ totalImages: 0, similar: [] });
    expect(await listLevel(original.id)).toBe('SIMILAR');
  });

  it('asks the reviewer to confirm before approving a likely duplicate, and records it', async () => {
    const base = directionFor('look-twin');
    const first = await designWithImage(designer, 'First Twin', base);
    const twin = await designWithImage(otherDesigner, 'Second Twin', lookingLike(base, 0.985, 'twin'));
    await ctx.runAi();

    await ctx.http.post(`/v1/admin/designs/${twin.id}/transition`).set(otherDesigner.auth).send({ to: 'IN_REVIEW', originalityConfirmed: true }).expect(200);
    await ctx.http.patch(`/v1/admin/designs/${twin.id}`).set(manager.auth).send({ basePriceInPaise: 450000 }).expect(200);
    const { values } = await designChoices(ctx, 'classic-nida-closed');
    await ctx.http
      .put(`/v1/admin/designs/${twin.id}/options`)
      .set(manager.auth)
      .send({
        options: [
          { optionValueId: values.crepe, isDefault: true },
          { optionValueId: values.black, isDefault: true },
          { optionValueId: values.wide, isDefault: true },
          { optionValueId: values.open, isDefault: true },
        ],
      })
      .expect(200);

    const blocked = await ctx.http.post(`/v1/admin/designs/${twin.id}/transition`).set(manager.auth).send({ to: 'PRICED' }).expect(422);
    expect(blocked.body.error.code).toBe('DUPLICATE_CHECK_REQUIRED');
    expect(blocked.body.error.details.matches).toEqual([expect.objectContaining({ kind: 'DESIGN', id: first.id })]);

    await ctx.http
      .post(`/v1/admin/designs/${twin.id}/transition`)
      .set(manager.auth)
      .send({ to: 'PRICED', duplicatesChecked: true })
      .expect(200);
    const audit = await ctx.db.auditLog.findFirst({
      where: { entityId: twin.id, action: 'design.status_changed' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.after).toMatchObject({ status: 'PRICED', duplicatesAcknowledged: [expect.objectContaining({ id: first.id })] });
  });

  it('compares designs with references (a copied reference is exactly what reviewers look for)', async () => {
    const look = directionFor('look-cape');
    const imagePath = await upload(manager, 'REFERENCE_IMAGE');
    ctx.analyzer.looks.set(imagePath, look);
    const ref = await ctx.http.post('/v1/admin/references').set(manager.auth).send({ imagePath, title: 'Pinterest cape' }).expect(201);
    expect(ref.body.aiMatch).toBeNull();
    const copy = await designWithImage(designer, 'Cape From Pinterest', lookingLike(look, 0.98, 'cape'));
    await ctx.runAi();

    const asDesigner = await insights(designer, copy.id);
    expect(asDesigner.similar).toContainEqual(expect.objectContaining({ kind: 'REFERENCE', id: ref.body.id, level: 'DUPLICATE', name: null }));
    const asManager = await insights(manager, copy.id);
    expect(asManager.similar).toContainEqual(expect.objectContaining({ kind: 'REFERENCE', name: 'Pinterest cape' }));

    const refInsights = await ctx.http.get(`/v1/admin/references/${ref.body.id}/ai`).set(manager.auth).expect(200);
    expect(refInsights.body.similar).toContainEqual(expect.objectContaining({ kind: 'DESIGN', id: copy.id, level: 'DUPLICATE' }));
    expect((await ctx.http.get(`/v1/admin/references/${ref.body.id}`).set(manager.auth).expect(200)).body.aiMatch).toBe('DUPLICATE');

    const tagged = await ctx.http.post(`/v1/admin/references/${ref.body.id}/ai/apply`).set(manager.auth).send({ tags: ['black'] }).expect(200);
    expect(tagged.body.tags).toContain('black');
    await ctx.http.post(`/v1/admin/references/${ref.body.id}/ai/apply`).set(designer.auth).send({ tags: ['black'] }).expect(403);
  });

  it('waits out an AI outage without using up attempts, fails unreadable images, and reports status', async () => {
    ctx.analyzer.down = true;
    const queued = await designWithImage(designer, 'Waiting For AI');
    const run = await ctx.runAi();
    expect(run.deferred).toBeGreaterThan(0);
    const row = await ctx.db.aiImage.findUniqueOrThrow({ where: { kind_subjectId: { kind: 'DESIGN_IMAGE', subjectId: queued.imageId } } });
    expect(row).toMatchObject({ status: 'QUEUED', attempts: 0 });

    ctx.analyzer.down = false;
    const broken = await designWithImage(designer, 'Broken Upload');
    ctx.analyzer.broken.add(broken.path);
    await ctx.db.aiImage.updateMany({ where: { status: 'QUEUED' }, data: { nextAttemptAt: new Date(0) } });
    await ctx.runAi();
    expect((await insights(designer, queued.id)).status).toBe('READY');
    expect((await insights(designer, broken.id)).status).toBe('FAILED');

    const status = await ctx.http.get('/v1/admin/ai/status').set(manager.auth).expect(200);
    expect(status.body).toMatchObject({ enabled: true, reachable: true, model: 'fake:clip', thresholds: { duplicate: 0.96, similar: 0.93 } });
    expect(status.body.queue.failed).toBeGreaterThanOrEqual(1);
    await ctx.http.get('/v1/admin/ai/status').set(designer.auth).expect(200);
    await ctx.http.get('/v1/admin/ai/status').set(qc.auth).expect(403);

    await ctx.http.post('/v1/admin/ai/retry-failed').set(designer.auth).expect(403);
    const retried = await ctx.http.post('/v1/admin/ai/retry-failed').set(manager.auth).expect(200);
    expect(retried.body.queued).toBeGreaterThanOrEqual(1);
    await ctx.http.post('/v1/admin/ai/reanalyse').set(manager.auth).expect(403);
  });
});
