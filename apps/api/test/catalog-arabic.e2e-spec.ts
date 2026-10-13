import { createTestApp, type TestContext, type TestUser, userWithRoles } from './helpers';

/** The Arabic site (`?lang=ar`): catalog text comes back translated (tests use a "[ar] …" translator). */
describe('Catalog in Arabic (e2e)', () => {
  let ctx: TestContext;
  let customer: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    customer = await userWithRoles(ctx, ['CUSTOMER'], 'arabic-customer');
  });
  afterAll(() => ctx.close());

  it('translates design, option and collection text, and leaves English pages and codes alone', async () => {
    const en = await ctx.http.get('/v1/designs/classic-nida-closed').expect(200);
    const ar = await ctx.http.get('/v1/designs/classic-nida-closed').query({ lang: 'ar' }).expect(200);
    expect(ar.body.name).toBe(`[ar] ${en.body.name}`);
    expect(ar.body.optionGroups[0].name).toBe(`[ar] ${en.body.optionGroups[0].name}`);
    expect(ar.body.optionGroups[0].values[0].name).toBe(`[ar] ${en.body.optionGroups[0].values[0].name}`);
    // Codes, slugs, ids and prices are never touched.
    expect(ar.body.slug).toBe(en.body.slug);
    expect(ar.body.optionGroups[0].code).toBe(en.body.optionGroups[0].code);
    expect(ar.body.fromPriceInPaise).toBe(en.body.fromPriceInPaise);

    const cards = await ctx.http.get('/v1/designs').query({ lang: 'ar', limit: 3 }).expect(200);
    expect(cards.body.items.every((c: { name: string }) => c.name.startsWith('[ar] '))).toBe(true);
    const collections = await ctx.http.get('/v1/collections').query({ lang: 'ar' }).expect(200);
    expect(collections.body.every((c: { name: string }) => c.name.startsWith('[ar] '))).toBe(true);

    // Stored, so the next request does not translate again.
    expect(await ctx.db.contentTranslation.count({ where: { lang: 'ar', source: en.body.name } })).toBe(1);
    // English pages are as before.
    expect((await ctx.http.get('/v1/designs/classic-nida-closed').expect(200)).body.name).toBe(en.body.name);
  });

  it('never translates what people typed: her own profile stays as she wrote it', async () => {
    await ctx.http.patch('/v1/me').set(customer.auth).send({ name: 'Sana Ali' }).expect(200);
    expect((await ctx.http.get('/v1/me').query({ lang: 'ar' }).set(customer.auth).expect(200)).body.name).toBe('Sana Ali');
  });
});
