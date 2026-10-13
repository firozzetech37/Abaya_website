import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { UploadsService } from '../src/modules/media/application/uploads.service';
import { WatermarkService } from '../src/modules/watermark/application/watermark.service';
import { createTestApp, type TestContext, type TestUser, userWithRoles } from './helpers';

/** A textured photo, like fabric (flat pictures have nowhere to hide a mark). */
async function photo(width = 900, height = 1125, seed = 5): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let s = seed;
  for (let i = 0; i < raw.length; i += 3) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const p = i / 3;
    const v = 120 + 50 * Math.sin((p % width) / 19) * Math.cos(Math.floor(p / width) / 27) + (s % 40);
    raw[i] = v + 30;
    raw[i + 1] = v;
    raw[i + 2] = v - 30;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}

/** Admin "Check an image" (docs/apps/admin.md): which design or customer request a picture came from. */
describe('Image check: invisible watermark (e2e)', () => {
  let ctx: TestContext;
  let manager: TestUser;
  let designId: string;
  const checkPath = () => `image-checks/2026/10/${randomUUID()}.jpg`;

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await userWithRoles(ctx, ['CATALOG_MANAGER'], 'check-manager');
    designId = (await ctx.http.get('/v1/designs/classic-nida-closed').expect(200)).body.id;
  });
  afterAll(() => ctx.close());

  /** "Uploads" a picture for checking and asks the API about it. */
  async function check(body: Buffer, user = manager, status = 200) {
    const path = checkPath();
    await ctx.storage.put('private', path, body, 'image/jpeg');
    const res = await ctx.http.post('/v1/admin/image-checks').set(user.auth).send({ path }).expect(status);
    return { res, path };
  }

  // Reading a screenshot (rough crop, other size) searches over position and scale; that search is
  // covered by the watermark unit tests (it is ~50× slower under Jest's sandbox than in the API).
  it('traces a saved catalog photo back to its design, then deletes the upload', async () => {
    // Publishing makes the public web preview, with the design's mark.
    const original = `design-images/2026/10/${randomUUID()}.jpg`;
    await ctx.storage.put('private', original, await photo(), 'image/jpeg');
    await ctx.app.get(UploadsService).publishPreviews(designId, [original]);
    const preview = await ctx.storage.get('public', original);
    expect(preview).not.toBeNull();
    const meta = await sharp(preview!).metadata();
    expect(meta.exif?.toString('latin1')).toContain('Abaya Atelier');

    // Saved from the page and posted elsewhere: smaller and re-compressed.
    const saved = await sharp(preview!).resize({ width: 560 }).jpeg({ quality: 75 }).toBuffer();
    const { res, path } = await check(saved);
    expect(res.body).toMatchObject({ found: true, kind: 'DESIGN', recordGone: false, request: null });
    expect(res.body.design).toMatchObject({ id: designId, slug: 'classic-nida-closed', status: 'PUBLISHED' });
    expect(res.body.confidence).toBeGreaterThan(0.8);
    expect(await ctx.storage.get('private', path)).toBeNull();
  }, 60_000);

  it('traces an AI preview to the customer who asked for it', async () => {
    const ana = await userWithRoles(ctx, ['CUSTOMER'], 'check-ana');
    const row = await ctx.db.customerPreview.create({
      data: {
        userId: ana.id,
        kind: 'PREVIEW',
        designId,
        sourcePath: 'x.jpg',
        prompt: 'p',
        endpoint: 'edit',
        credits: 1,
        status: 'DONE',
        choices: ['Colour: Navy'],
      },
    });
    const marked = await ctx.app.get(WatermarkService).mark(await photo(800, 1000, 9), { kind: 'PREVIEW', id: row.id });
    const { res } = await check(marked.body);
    expect(res.body).toMatchObject({ found: true, kind: 'PREVIEW', design: { id: designId } });
    expect(res.body.request).toMatchObject({ id: row.id, kind: 'PREVIEW', customer: { id: ana.id, email: ana.email }, choices: ['Colour: Navy'] });
  }, 60_000);

  it('says so when a picture has no mark, or its record is gone', async () => {
    // Too small to carry a mark (a full search on a large unmarked photo is in the unit tests).
    expect((await check(await photo(100, 125, 21))).res.body).toEqual({
      found: false,
      kind: null,
      confidence: null,
      design: null,
      request: null,
      recordGone: false,
    });
    const gone = await ctx.app.get(WatermarkService).mark(await photo(800, 1000, 13), { kind: 'TRYON', id: randomUUID() });
    expect((await check(gone.body)).res.body).toMatchObject({ found: true, kind: 'TRYON', recordGone: true, request: null });
  }, 60_000);

  it('is for catalog managers only, with a path issued for checking', async () => {
    const designer = await userWithRoles(ctx, ['DESIGNER'], 'check-designer');
    await check(await photo(200, 250), designer, 403);
    await ctx.http.post('/v1/admin/image-checks').set(manager.auth).send({ path: 'design-images/2026/10/x.jpg' }).expect(422);
    await ctx.http.post('/v1/admin/image-checks').set(manager.auth).send({ path: checkPath() }).expect(404);
    // Only catalog managers may upload for checking.
    await ctx.http.post('/v1/admin/uploads').set(manager.auth).send({ fileName: 'found.jpg', purpose: 'IMAGE_CHECK', contentType: 'image/jpeg' }).expect(201);
    await ctx.http.post('/v1/admin/uploads').set(designer.auth).send({ fileName: 'found.jpg', purpose: 'IMAGE_CHECK', contentType: 'image/jpeg' }).expect(403);
  }, 60_000);
});
