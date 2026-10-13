import { createTestApp, type TestContext, type TestUser, userWithRoles } from './helpers';

/** Admin "FASHN usage": credits per person (docs/apps/admin.md "FASHN usage"). */
describe('FASHN usage per person (e2e)', () => {
  let ctx: TestContext;
  let manager: TestUser;
  let ana: TestUser;
  let dina: TestUser;
  let designId: string;
  // A closed past month, so rows made by other tests (today) never land in it.
  const range = { from: '2026-03-01', to: '2026-03-31' };
  const inMarch = (day: number, hour = 6) => new Date(Date.UTC(2026, 2, day, hour));

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await userWithRoles(ctx, ['CATALOG_MANAGER'], 'usage-manager');
    ana = await userWithRoles(ctx, ['CUSTOMER'], 'usage-ana');
    dina = await userWithRoles(ctx, ['DESIGNER'], 'usage-dina');
    designId = (await ctx.http.get('/v1/designs/classic-nida-closed').expect(200)).body.id;

    const preview = { kind: 'PREVIEW' as const, designId, sourcePath: 'x.jpg', prompt: 'p', endpoint: 'edit' };
    await ctx.db.customerPreview.createMany({
      data: [
        // Two credits, remade once after the accuracy check
        { ...preview, userId: ana.id, credits: 2, retries: 1, status: 'DONE', resultPath: 'tryon-results/a.jpg', createdAt: inMarch(3) },
        // Failed: costs nothing
        { ...preview, userId: ana.id, credits: 1, status: 'FAILED', createdAt: inMarch(4) },
        // Failed the accuracy check twice: FASHN was used, so it counts
        { ...preview, userId: ana.id, credits: 2, status: 'FAILED', inaccurate: true, createdAt: inMarch(5) },
        // Her own photo: counted, never pictured
        { ...preview, kind: 'TRYON', endpoint: 'tryon-max', userId: ana.id, credits: 1, status: 'DONE', resultPath: 'tryon-results/her.jpg', createdAt: inMarch(6) },
        // Outside the range
        { ...preview, userId: ana.id, credits: 5, status: 'DONE', createdAt: new Date(Date.UTC(2026, 3, 2)) },
      ],
    });
    const job = {
      createdById: dina.id,
      view: 'FRONT',
      inputs: {},
      prompt: 'p',
      endpoint: 'product-to-model',
      resolution: '1k',
      mode: 'fast',
      numImages: 1,
      seed: 1,
      provider: 'fashn',
    };
    const done = await ctx.db.catalogJob.create({
      data: { ...job, kind: 'PRODUCT_TO_MODEL', designId, creditsEstimated: 4, creditsUsed: 3, status: 'DONE', createdAt: inMarch(10) },
    });
    await ctx.db.catalogImage.create({ data: { jobId: done.id, storagePath: 'catalog/out.jpg' } });
    await ctx.db.catalogJob.createMany({
      data: [
        // No count from FASHN: the estimate is used
        { ...job, kind: 'EDIT', view: 'EDIT', creditsEstimated: 2, status: 'DONE', createdAt: inMarch(11) },
        { ...job, kind: 'EDIT', view: 'EDIT', creditsEstimated: 2, status: 'FAILED', createdAt: inMarch(12) },
      ],
    });
  });
  afterAll(() => ctx.close());

  it('adds up credits per person: website for customers, Studio for staff', async () => {
    const res = await ctx.http.get('/v1/admin/fashn-usage').query(range).set(manager.auth).expect(200);
    expect(res.body.totals).toEqual({ website: 5, studio: 5, total: 10 });
    const rows = res.body.users as { userId: string }[];
    const anaRow = res.body.users.find((r: { userId: string }) => r.userId === ana.id);
    expect(anaRow).toMatchObject({
      email: ana.email,
      audience: 'CUSTOMER',
      previews: 3,
      tryOns: 1,
      studioJobs: 0,
      failed: 2,
      remakes: 1,
      credits: 5,
      lastUsedAt: inMarch(6).toISOString(),
    });
    const dinaRow = res.body.users.find((r: { userId: string }) => r.userId === dina.id);
    expect(dinaRow).toMatchObject({ audience: 'STAFF', roles: ['DESIGNER'], previews: 0, studioJobs: 3, failed: 1, credits: 5 });
    // Same credits: the most recent first
    expect(rows.map((r) => r.userId)).toEqual([dina.id, ana.id]);
  });

  it('lists one person’s jobs newest first; a try-on never shows her picture', async () => {
    const res = await ctx.http.get(`/v1/admin/fashn-usage/users/${ana.id}/jobs`).query(range).set(manager.auth).expect(200);
    expect(res.body.more).toBe(false);
    const items = res.body.items as { source: string; credits: number; thumbnailUrl: string | null; designName: string | null; status: string }[];
    expect(items.map((j) => [j.source, j.status, j.credits])).toEqual([
      ['TRYON', 'DONE', 1],
      ['PREVIEW', 'FAILED', 2],
      ['PREVIEW', 'FAILED', 0],
      ['PREVIEW', 'DONE', 2],
    ]);
    expect(items[0]?.thumbnailUrl).toBeNull();
    expect(items[3]?.thumbnailUrl).toEqual(expect.any(String));
    expect(items[3]?.designName).toEqual(expect.any(String));

    const studio = await ctx.http.get(`/v1/admin/fashn-usage/users/${dina.id}/jobs`).query(range).set(manager.auth).expect(200);
    expect(studio.body.items.map((j: { kind: string; credits: number }) => [j.kind, j.credits])).toEqual([
      ['EDIT', 0],
      ['EDIT', 2],
      ['PRODUCT_TO_MODEL', 3],
    ]);
    expect(studio.body.items[2].thumbnailUrl).toEqual(expect.any(String));
  });

  it('shows today, the last 7 days and this month with the limits', async () => {
    const res = await ctx.http.get('/v1/admin/fashn-usage/summary').set(manager.auth).expect(200);
    expect(Object.keys(res.body.today)).toEqual(['website', 'studio', 'total']);
    expect(res.body.websiteDailyLimit).toEqual(expect.any(Number));
    expect(res.body.staffDailyLimit).toEqual(expect.any(Number));
    expect(res.body.thisMonth.total).toBeGreaterThanOrEqual(res.body.today.total);
  });

  it('is for catalog managers and super admins only, with a valid range', async () => {
    await ctx.http.get('/v1/admin/fashn-usage').query(range).set(ana.auth).expect(403);
    await ctx.http.get('/v1/admin/fashn-usage').query(range).set(dina.auth).expect(403);
    const boss = await userWithRoles(ctx, ['SUPER_ADMIN'], 'usage-boss');
    await ctx.http.get('/v1/admin/fashn-usage').query(range).set(boss.auth).expect(200);
    await ctx.http.get('/v1/admin/fashn-usage').query({ from: '2026-03-31', to: '2026-03-01' }).set(manager.auth).expect(400);
    await ctx.http.get('/v1/admin/fashn-usage').query({ from: '2024-01-01', to: '2026-03-01' }).set(manager.auth).expect(400);
  });
});
