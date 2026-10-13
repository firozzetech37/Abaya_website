import sharp from 'sharp';
import { createTestApp, designChoices, type TestContext, type TestUser, userWithRoles } from './helpers';

describe('Catalog and pricing (e2e)', () => {
  let ctx: TestContext;
  let designer: TestUser;
  let otherDesigner: TestUser;
  let manager: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    designer = await userWithRoles(ctx, ['DESIGNER']);
    otherDesigner = await userWithRoles(ctx, ['DESIGNER']);
    manager = await userWithRoles(ctx, ['CATALOG_MANAGER']);
  });
  afterAll(() => ctx.close());

  it('lists the seeded published designs with public image URLs', async () => {
    const res = await ctx.http.get('/v1/designs?limit=50').expect(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(10);
    expect(res.body.items[0]).toEqual(
      expect.objectContaining({ slug: expect.any(String), fromPriceInPaise: expect.any(Number) }),
    );
    expect(res.body.items[0].primaryImageUrl).toMatch(/^https:\/\/storage\.test\/public\//);
    // Living cards: a second angle for hover, colour dots and the lead time.
    const classic = res.body.items.find((d: { slug: string }) => d.slug === 'classic-nida-closed');
    expect(classic.hoverImageUrl).toMatch(/classic-nida-closed-2\.jpg/);
    expect(classic.colours.length).toBeGreaterThan(0);
    expect(classic.colours.every((c: string) => /^#[0-9A-F]{6}$/i.test(c))).toBe(true);
    expect(classic.leadTimeDays).toBeGreaterThan(0);
    // The card's eyebrow names the collection; freshly seeded designs are new arrivals.
    expect(classic.collectionName).toBe('Everyday Essentials');
    expect(classic.isNew).toBe(true);
  });

  it('announcements: managers write them with dates; the website reads the live ones in its language', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const live = await ctx.http.post('/v1/admin/announcements').set(manager.auth).send({ textEn: 'Eid delivery by the 20th', textAr: 'توصيل العيد قبل العشرين', linkPath: '/collections/occasion', startsAt: past, endsAt: future, sortOrder: 1 }).expect(201);
    expect(live.body.live).toBe(true);
    const expired = await ctx.http.post('/v1/admin/announcements').set(manager.auth).send({ textEn: 'Old news', textAr: 'قديم', endsAt: past }).expect(201);
    expect(expired.body.live).toBe(false);
    await ctx.http.post('/v1/admin/announcements').set(manager.auth).send({ textEn: 'Bad dates', textAr: 'تواريخ', startsAt: future, endsAt: past }).expect(400);
    // Designers cannot write
    await ctx.http.post('/v1/admin/announcements').set(designer.auth).send({ textEn: 'Nope', textAr: 'لا' }).expect(403);
    // An Arabic draft for the editor
    const draft = await ctx.http.post('/v1/admin/announcements/translate').set(manager.auth).send({ text: 'Free delivery this week' }).expect(200);
    expect(draft.body).toEqual({ textAr: '[ar] Free delivery this week', provider: 'test' });

    const en = await ctx.http.get('/v1/announcements').expect(200);
    expect(en.body.map((a: { text: string }) => a.text)).toEqual(['Eid delivery by the 20th']);
    const ar = await ctx.http.get('/v1/announcements?lang=ar').expect(200);
    expect(ar.body[0]).toEqual(expect.objectContaining({ text: 'توصيل العيد قبل العشرين', linkPath: '/collections/occasion' }));

    await ctx.http.patch(`/v1/admin/announcements/${live.body.id}`).set(manager.auth).send({ isActive: false }).expect(200);
    expect((await ctx.http.get('/v1/announcements').expect(200)).body).toEqual([]);
    await ctx.http.delete(`/v1/admin/announcements/${expired.body.id}`).set(manager.auth).expect(204);
    await ctx.http.delete(`/v1/admin/announcements/${expired.body.id}`).set(manager.auth).expect(404);
  });

  it('publishes the display-currency rate (the fallback in tests, never a charge currency)', async () => {
    const res = await ctx.http.get('/v1/pricing/rates').expect(200);
    expect(res.body.base).toBe('INR');
    expect(res.body.source).toBe('fallback');
    expect(res.body.rates.AED).toBeGreaterThan(0.01);
    expect(res.body.rates.AED).toBeLessThan(0.2);
    expect(res.body.rates.SAR).toBeGreaterThan(0.01);
    expect(res.body.rates.SAR).toBeLessThan(0.2);
  });

  it('gives each collection a cover photo from its newest published design', async () => {
    const res = await ctx.http.get('/v1/collections').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const c of res.body) expect(c.coverImageUrl).toMatch(/^https:\/\/storage\.test\/public\/seed\//);
  });

  it('paginates with an opaque cursor and filters by style and collection', async () => {
    const first = await ctx.http.get('/v1/designs?limit=4').expect(200);
    expect(first.body.items).toHaveLength(4);
    const second = await ctx.http.get(`/v1/designs?limit=4&cursor=${first.body.nextCursor}`).expect(200);
    const ids = new Set([...first.body.items, ...second.body.items].map((d: { id: string }) => d.id));
    expect(ids.size).toBe(8);

    const butterfly = await ctx.http.get('/v1/designs?style=BUTTERFLY').expect(200);
    expect(butterfly.body.items.every((d: { style: string }) => d.style === 'BUTTERFLY')).toBe(true);
    const occasion = await ctx.http.get('/v1/designs?collection=occasion').expect(200);
    expect(occasion.body.items.length).toBeGreaterThan(0);
    await ctx.http.get('/v1/designs?cursor=garbage').expect(400);
  });

  it('filters by colour and counts designs per style and colour for the shop page', async () => {
    const all = await ctx.http.get('/v1/designs?limit=100').expect(200);
    const facets = await ctx.http.get('/v1/designs/facets').expect(200);
    expect(facets.body.total).toBe(all.body.items.length);
    // Every style is listed (with zero when empty); a style with designs has its newest photo.
    const butterfly = facets.body.styles.find((s: { style: string }) => s.style === 'BUTTERFLY');
    expect(butterfly.count).toBe((await ctx.http.get('/v1/designs?style=BUTTERFLY&limit=100').expect(200)).body.items.length);
    expect(butterfly.imageUrl).toMatch(/^https:\/\/storage\.test\/public\//);
    // Colours carry their name and swatch; only fabric colours, never thread colours.
    const black = facets.body.colours.find((c: { code: string }) => c.code === 'black');
    expect(black).toEqual(expect.objectContaining({ name: 'Black', hex: '#111111', count: expect.any(Number) }));
    expect(facets.body.colours.some((c: { code: string }) => c.code === 'gold')).toBe(false);

    const inBlack = await ctx.http.get('/v1/designs?colour=black&limit=100').expect(200);
    expect(inBlack.body.items.length).toBe(black.count);
    expect(inBlack.body.items.every((d: { colours: string[] }) => d.colours.includes('#111111'))).toBe(true);
    // An unknown colour matches nothing (never everything).
    expect((await ctx.http.get('/v1/designs?colour=no-such-colour').expect(200)).body.items).toEqual([]);

    // The style counts keep the other filters; the total follows the chosen style.
    const narrowed = await ctx.http.get('/v1/designs/facets?colour=black&style=BUTTERFLY').expect(200);
    const narrowedButterfly = narrowed.body.styles.find((s: { style: string }) => s.style === 'BUTTERFLY');
    expect(narrowed.body.total).toBe(narrowedButterfly.count);
    expect(narrowed.body.styles.reduce((n: number, s: { count: number }) => n + s.count, 0)).toBe(black.count);
    await ctx.http.get('/v1/designs/facets?style=NOPE').expect(400);
  });

  it('quotes satin + back stonework on the classic nida with the right breakdown', async () => {
    const { design, values, bands } = await designChoices(ctx, 'classic-nida-closed');
    const res = await ctx.http
      .post('/v1/pricing/quote')
      .send({
        designId: design.id,
        selectedOptionValueIds: [values.satin, values.black, values.straight, values.buttons, values['back-stonework']],
        sizeBandId: bands.M,
        quantity: 2,
      })
      .expect(200);
    // ₹2,499 base + ₹600 satin + ₹900 stonework + ₹150 buttons = ₹4,149
    expect(res.body.unitPriceInPaise).toBe(414900);
    expect(res.body.totalInPaise).toBe(829800);
    expect(res.body.lines.map((l: { label: string }) => l.label)).toEqual([
      'Base price', 'Satin', 'Black', 'Straight', 'Back stonework', 'Buttons',
    ]);
  });

  it('adds the CUSTOM band when ordering to measurements, and rejects bad selections (422)', async () => {
    const { design, values, bands } = await designChoices(ctx, 'classic-nida-closed');
    const custom = await ctx.http
      .post('/v1/pricing/quote')
      .send({ designId: design.id, selectedOptionValueIds: [values.nida, values.black, values.straight, values.open], measurementProfileId: bands.M })
      .expect(200);
    expect(custom.body.lines.at(-1)).toMatchObject({ kind: 'SIZE', amountInPaise: 30000 });

    const twoFabrics = await ctx.http
      .post('/v1/pricing/quote')
      .send({ designId: design.id, selectedOptionValueIds: [values.nida, values.satin, values.black, values.straight, values.open], sizeBandId: bands.M })
      .expect(422);
    expect(twoFabrics.body.error.code).toBe('INVALID_OPTION_SELECTION');

    await ctx.http
      .post('/v1/pricing/quote')
      .send({ designId: design.id, selectedOptionValueIds: [], sizeBandId: bands.M, measurementProfileId: bands.M })
      .expect(400);
  });

  it('runs the full draft → review → priced → published flow with role checks and audit', async () => {
    // Designer creates a draft and uploads an image through a signed URL.
    const created = await ctx.http
      .post('/v1/admin/designs')
      .set(designer.auth)
      .send({ name: 'Moonlight Crepe Kimono', style: 'KIMONO', tags: ['crepe'] })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({ status: 'DRAFT', slug: 'moonlight-crepe-kimono', allowedTransitions: ['IN_REVIEW'] });

    await ctx.http.post(`/v1/admin/designs/${id}/transition`).set(designer.auth).send({ to: 'IN_REVIEW', originalityConfirmed: true }).expect(422);

    const upload = await ctx.http
      .post('/v1/admin/uploads')
      .set(designer.auth)
      .send({ fileName: 'front.jpg', contentType: 'image/jpeg', purpose: 'DESIGN_IMAGE' })
      .expect(201);
    expect(upload.body.storagePath).toMatch(/^design-images\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    // The photo the designer PUT to the signed URL (2000px wide, so the preview is visibly smaller).
    const photo = await sharp({ create: { width: 2000, height: 2600, channels: 3, background: '#2b2b2b' } }).jpeg().toBuffer();
    await ctx.storage.put('private', upload.body.storagePath, photo, 'image/jpeg');
    await ctx.http
      .post(`/v1/admin/designs/${id}/images`)
      .set(designer.auth)
      .send({ storagePath: 'qc-photos/2026/01/00000000-0000-4000-8000-000000000000.jpg' })
      .expect(422);
    const withImage = await ctx.http
      .post(`/v1/admin/designs/${id}/images`)
      .set(designer.auth)
      .send({ storagePath: upload.body.storagePath, alt: 'Front view' })
      .expect(201);
    expect(withImage.body.images[0]).toMatchObject({ isPrimary: true });
    expect(withImage.body.images[0].url).toMatch(/signed\/private/);

    // Other designers cannot see it; designers cannot price.
    await ctx.http.get(`/v1/admin/designs/${id}`).set(otherDesigner.auth).expect(404);
    await ctx.http.patch(`/v1/admin/designs/${id}`).set(designer.auth).send({ basePriceInPaise: 100 }).expect(403);

    // Submitting needs the designer's originality confirmation (saved with the time).
    const unconfirmed = await ctx.http.post(`/v1/admin/designs/${id}/transition`).set(designer.auth).send({ to: 'IN_REVIEW' }).expect(422);
    expect(unconfirmed.body.error.code).toBe('ORIGINALITY_REQUIRED');
    await ctx.http.post(`/v1/admin/designs/${id}/transition`).set(designer.auth).send({ to: 'IN_REVIEW', originalityConfirmed: true }).expect(200);
    const submitted = await ctx.http.get(`/v1/admin/designs/${id}`).set(designer.auth).expect(200);
    expect(submitted.body).toMatchObject({ source: 'UPLOAD', originalityConfirmedAt: expect.any(String), submittedAt: expect.any(String) });
    // In review: the designer can no longer edit or move it.
    await ctx.http.patch(`/v1/admin/designs/${id}`).set(designer.auth).send({ name: 'Renamed' }).expect(403);
    await ctx.http.post(`/v1/admin/designs/${id}/transition`).set(designer.auth).send({ to: 'PRICED' }).expect(403);

    // Manager requests changes (notes required), designer resubmits.
    await ctx.http.post(`/v1/admin/designs/${id}/transition`).set(manager.auth).send({ to: 'CHANGES_REQUESTED' }).expect(422);
    await ctx.http
      .post(`/v1/admin/designs/${id}/transition`)
      .set(manager.auth)
      .send({ to: 'CHANGES_REQUESTED', notes: 'Please add a back view' })
      .expect(200);
    await ctx.http.post(`/v1/admin/designs/${id}/transition`).set(designer.auth).send({ to: 'IN_REVIEW', originalityConfirmed: true }).expect(200);

    // PRICED needs a price and options in every required group.
    const priceless = await ctx.http.post(`/v1/admin/designs/${id}/transition`).set(manager.auth).send({ to: 'PRICED' }).expect(422);
    expect(priceless.body.error.code).toBe('PRICE_NOT_SET');
    await ctx.http.patch(`/v1/admin/designs/${id}`).set(manager.auth).send({ basePriceInPaise: 399900, makingCostInPaise: 120000 }).expect(200);
    const noOptions = await ctx.http.post(`/v1/admin/designs/${id}/transition`).set(manager.auth).send({ to: 'PRICED' }).expect(422);
    expect(noOptions.body.error.code).toBe('REQUIRED_OPTIONS_MISSING');

    const { values } = await designChoices(ctx, 'classic-nida-closed');
    await ctx.http
      .put(`/v1/admin/designs/${id}/options`)
      .set(designer.auth)
      .send({ options: [{ optionValueId: values.crepe, isDefault: true }] })
      .expect(403);
    await ctx.http
      .put(`/v1/admin/designs/${id}/options`)
      .set(manager.auth)
      .send({
        options: [
          { optionValueId: values.crepe, isDefault: true },
          { optionValueId: values.satin, surchargeOverrideInPaise: 45000 },
          { optionValueId: values.black, isDefault: true },
          { optionValueId: values.navy },
          { optionValueId: values.wide, isDefault: true },
          { optionValueId: values.open, isDefault: true },
          { optionValueId: values.hijab },
        ],
      })
      .expect(200);

    await ctx.http.post(`/v1/admin/designs/${id}/transition`).set(manager.auth).send({ to: 'PRICED' }).expect(200);
    // Designers can never publish, even their own design.
    const designerPublish = await ctx.http.post(`/v1/admin/designs/${id}/transition`).set(designer.auth).send({ to: 'PUBLISHED' }).expect(403);
    expect(designerPublish.body.error.code).toBe('FORBIDDEN');
    await ctx.http.get('/v1/designs/moonlight-crepe-kimono').expect(404);

    const published = await ctx.http.post(`/v1/admin/designs/${id}/transition`).set(manager.auth).send({ to: 'PUBLISHED' }).expect(200);
    expect(published.body.status).toBe('PUBLISHED');
    // Customers only get a watermarked 1200px preview; the full original stays private.
    const preview = ctx.storage.files.get(`public/${upload.body.storagePath}`);
    expect(preview?.contentType).toBe('image/jpeg');
    expect((await sharp(preview!.body).metadata()).height).toBe(1600);
    expect((await sharp(ctx.storage.files.get(`private/${upload.body.storagePath}`)!.body).metadata()).height).toBe(2400); // capped at upload, never shrunk to preview size

    // Now visible, with the per-design satin override and crepe as the default.
    const detail = await ctx.http.get('/v1/designs/moonlight-crepe-kimono').expect(200);
    const fabric = detail.body.optionGroups.find((g: { code: string }) => g.code === 'FABRIC');
    expect(fabric.values.map((v: { code: string; surchargeInPaise: number }) => [v.code, v.surchargeInPaise])).toEqual([
      ['crepe', 30000],
      ['satin', 45000],
    ]);
    // from price = 3,999 + crepe 300 + wide sleeve 150
    expect(detail.body.fromPriceInPaise).toBe(444900);
    const list = await ctx.http.get('/v1/designs?limit=100').expect(200);
    expect(list.body.items.map((d: { slug: string }) => d.slug)).toContain('moonlight-crepe-kimono');

    const audit = await ctx.db.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['design.created', 'design.price_changed', 'design.options_changed', 'design.status_changed']),
    );
    expect(audit.filter((a) => a.action === 'design.status_changed')).toHaveLength(5);
  });

  it('tags photos with a colour: customers get each photo’s colour, main photos stay untagged', async () => {
    const slug = 'moonlight-crepe-kimono';
    const { values: own, design: pub } = await designChoices(ctx, slug);
    const upload = await ctx.http
      .post('/v1/admin/uploads')
      .set(manager.auth)
      .send({ fileName: 'navy.jpg', contentType: 'image/jpeg', purpose: 'DESIGN_IMAGE' })
      .expect(201);
    const photo = await sharp({ create: { width: 1200, height: 1500, channels: 3, background: '#1b2a4a' } }).jpeg().toBuffer();
    await ctx.storage.put('private', upload.body.storagePath, photo, 'image/jpeg');

    // Only an active colour option can tag a photo.
    const wrong = await ctx.http
      .post(`/v1/admin/designs/${pub.id}/images`)
      .set(manager.auth)
      .send({ storagePath: upload.body.storagePath, colourValueId: own.crepe })
      .expect(422);
    expect(wrong.body.error.code).toBe('UNKNOWN_COLOUR');
    const tagged = await ctx.http
      .post(`/v1/admin/designs/${pub.id}/images`)
      .set(manager.auth)
      .send({ storagePath: upload.body.storagePath, alt: 'Navy, front', colourValueId: own.navy })
      .expect(201);
    expect(tagged.body.images.map((i: { colourValueId: string | null }) => i.colourValueId)).toEqual([null, own.navy]);
    const [mainId, navyId] = tagged.body.images.map((i: { id: string }) => i.id) as [string, string];

    // Customers see which colour each photo shows; the main photo shows every colour.
    const detail = await ctx.http.get(`/v1/designs/${slug}`).expect(200);
    expect(detail.body.images.map((i: { alt: string | null; colourId: string | null }) => [i.alt, i.colourId])).toEqual([
      ['Front view', null],
      ['Navy, front', own.navy],
    ]);

    // Tagged with a colour the design does not offer: shown like a main photo (the tag itself is kept).
    const groups = await ctx.http.get('/v1/admin/options').set(manager.auth).expect(200);
    const offered = new Set(Object.values(own));
    const other = groups.body
      .find((g: { code: string }) => g.code === 'COLOUR')
      .values.find((v: { id: string; isActive: boolean }) => v.isActive && !offered.has(v.id));
    expect(other).toBeDefined();
    const retagged = await ctx.http
      .patch(`/v1/admin/designs/${pub.id}/images`)
      .set(manager.auth)
      .send({ images: [{ id: mainId, isPrimary: true }, { id: navyId, colourValueId: other.id }] })
      .expect(200);
    expect(retagged.body.images[1].colourValueId).toBe(other.id);
    const hidden = await ctx.http.get(`/v1/designs/${slug}`).expect(200);
    expect(hidden.body.images.map((i: { colourId: string | null }) => i.colourId)).toEqual([null, null]);

    // A close-up tagged as a detail shot: on the card for the craftsmanship gallery, never the hover angle.
    const asDetail = await ctx.http
      .patch(`/v1/admin/designs/${pub.id}/images`)
      .set(manager.auth)
      .send({ images: [{ id: mainId, isPrimary: true }, { id: navyId, isDetail: true }] })
      .expect(200);
    expect(asDetail.body.images.map((i: { isDetail: boolean }) => i.isDetail)).toEqual([false, true]);
    const cards = await ctx.http.get('/v1/designs?limit=50').expect(200);
    const card = cards.body.items.find((d: { slug: string }) => d.slug === slug);
    expect(card.detailImageUrls).toHaveLength(1);
    expect(card.detailImageUrls[0]).toMatch(/^https:\/\/storage\.test\/public\//);
    expect(card.hoverImageUrl).toBeNull();

    // Left out = unchanged; null = back to the main photoshoot.
    await ctx.http
      .patch(`/v1/admin/designs/${pub.id}/images`)
      .set(manager.auth)
      .send({ images: [{ id: mainId, isPrimary: true }, { id: navyId, colourValueId: null }] })
      .expect(200);
    const admin = await ctx.http.get(`/v1/admin/designs/${pub.id}`).set(manager.auth).expect(200);
    expect(admin.body.images.map((i: { colourValueId: string | null }) => i.colourValueId)).toEqual([null, null]);
  });

  it('admin collections list every member design; public ones never do', async () => {
    const draft = await ctx.http.post('/v1/admin/designs').set(manager.auth).send({ name: 'Unpublished Member', style: 'CLOSED' }).expect(201);
    const created = await ctx.http
      .post('/v1/admin/collections')
      .set(manager.auth)
      .send({ slug: 'staff-picks', name: 'Staff picks', designIds: [draft.body.id] })
      .expect(201);
    expect(created.body).toMatchObject({ designIds: [draft.body.id], designCount: 1 });
    const pub = await ctx.http.get('/v1/collections/staff-picks').expect(200);
    expect(pub.body.designCount).toBe(0);
    expect(pub.body.designIds).toBeUndefined();

    // A looping home-page video: uploaded for that purpose, copied to the public bucket when saved.
    const video = await ctx.http
      .post('/v1/admin/uploads')
      .set(manager.auth)
      .send({ fileName: 'reel.mp4', contentType: 'video/mp4', purpose: 'COLLECTION_VIDEO' })
      .expect(201);
    expect(video.body.storagePath).toMatch(/^collection-videos\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.mp4$/);
    await ctx.storage.put('private', video.body.storagePath, Buffer.from('mp4 bytes'), 'video/mp4');
    const notAVideo = await ctx.http
      .patch(`/v1/admin/collections/${created.body.id}`)
      .set(manager.auth)
      .send({ videoPath: 'design-images/2026/01/00000000-0000-4000-8000-000000000000.jpg' })
      .expect(422);
    expect(notAVideo.body.error.code).toBe('INVALID_UPLOAD_PATH');
    const withVideo = await ctx.http.patch(`/v1/admin/collections/${created.body.id}`).set(manager.auth).send({ videoPath: video.body.storagePath }).expect(200);
    expect(withVideo.body.videoUrl).toMatch(/\/public\/collection-videos\//);
    expect(ctx.storage.copies).toContainEqual({ from: 'private', to: 'public', path: video.body.storagePath });
    const everyday = (await ctx.http.get('/v1/collections').expect(200)).body as { slug: string; videoUrl: string | null; previewImageUrls: string[] }[];
    expect(everyday.find((c) => c.slug === 'staff-picks')?.videoUrl).toMatch(/collection-videos/);
    expect(everyday.every((c) => c.previewImageUrls.length <= 3)).toBe(true);
    // Customers cannot upload videos.
    await ctx.http.post('/v1/admin/uploads').set(designer.auth).send({ fileName: 'x.mp4', contentType: 'video/mp4', purpose: 'COLLECTION_VIDEO' }).expect(403);

    const detail = await ctx.http.get('/v1/designs/classic-nida-closed').expect(200);
    const m = detail.body.sizeBands.find((b: { code: string }) => b.code === 'M');
    expect(m).toMatchObject({ bustMinCm: 88, bustMaxCm: 94 });
    expect(detail.body.sizeBands.find((b: { code: string }) => b.code === 'CUSTOM')).toMatchObject({ bustMinCm: null });
  });

  it('logs surcharge changes and lets only catalog managers edit options', async () => {
    const groups = await ctx.http.get('/v1/admin/options').set(manager.auth).expect(200);
    const linen = groups.body.find((g: { code: string }) => g.code === 'FABRIC').values.find((v: { code: string }) => v.code === 'linen');
    await ctx.http.patch(`/v1/admin/options/values/${linen.id}`).set(designer.auth).send({ surchargeInPaise: 1 }).expect(403);
    await ctx.http.patch(`/v1/admin/options/values/${linen.id}`).set(manager.auth).send({ surchargeInPaise: 45000 }).expect(200);
    const log = await ctx.db.auditLog.findFirst({ where: { entityId: linen.id, action: 'option.surcharge_changed' } });
    expect(log?.before).toEqual({ surchargeInPaise: 40000 });
    expect(log?.after).toEqual({ surchargeInPaise: 45000 });
  });

  it('references: manual upload, assign to a designer, design from it', async () => {
    const upload = await ctx.http
      .post('/v1/admin/uploads')
      .set(manager.auth)
      .send({ fileName: 'pin.jpg', contentType: 'image/jpeg', purpose: 'REFERENCE_IMAGE' })
      .expect(201);
    const ref = await ctx.http
      .post('/v1/admin/references')
      .set(manager.auth)
      .send({ imagePath: upload.body.storagePath, title: 'Pleated cuffs', licenseNote: 'Inspiration only' })
      .expect(201);
    expect(ref.body.status).toBe('IMPORTED');

    await ctx.http.patch(`/v1/admin/references/${ref.body.id}`).set(manager.auth).send({ status: 'IN_REVIEW' }).expect(200);
    await ctx.http.patch(`/v1/admin/references/${ref.body.id}`).set(manager.auth).send({ status: 'NEEDS_DESIGN' }).expect(422);
    await ctx.http
      .patch(`/v1/admin/references/${ref.body.id}`)
      .set(manager.auth)
      .send({ status: 'NEEDS_DESIGN', assignedDesignerId: designer.id })
      .expect(200);

    const mine = await ctx.http.get('/v1/admin/references').set(designer.auth).expect(200);
    expect(mine.body.items.map((r: { id: string }) => r.id)).toContain(ref.body.id);
    const theirs = await ctx.http.get('/v1/admin/references').set(otherDesigner.auth).expect(200);
    expect(theirs.body.items).toHaveLength(0);

    await ctx.http
      .post('/v1/admin/designs')
      .set(otherDesigner.auth)
      .send({ name: 'Copy attempt', style: 'CLOSED', referenceId: ref.body.id })
      .expect(403);
    const design = await ctx.http
      .post('/v1/admin/designs')
      .set(designer.auth)
      .send({ name: 'Pleated Cuff Abaya', style: 'CLOSED', referenceId: ref.body.id })
      .expect(201);
    expect(design.body.referenceId).toBe(ref.body.id);
    const after = await ctx.http.get(`/v1/admin/references/${ref.body.id}`).set(manager.auth).expect(200);
    expect(after.body).toMatchObject({ status: 'DESIGNED', designIds: [design.body.id] });
  });
});
