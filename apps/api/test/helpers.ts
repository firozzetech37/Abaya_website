import { createHmac, createPrivateKey, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, type Role } from '@abaya/db';
import { stitchingChecklist } from '@abaya/contracts';
import { SignJWT } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_CONFIG, type AppConfig } from '../src/common/config/config.module';
import type { BucketKind, ObjectStorage } from '../src/common/storage/object-storage';
import { OBJECT_STORAGE } from '../src/common/storage/object-storage';
import { PAYMENT_GATEWAY } from '../src/modules/payments/application/ports/payments.ports';
import { AUTH_PROVIDER_ADMIN, type AuthProviderAdmin } from '../src/common/auth/auth.types';
import { AiWorker } from '../src/modules/ai/application/ai-worker.service';
import {
  type AnalysisResult,
  AnalyzerUnavailableError,
  IMAGE_ANALYZER,
  type ImageAnalyzer,
  PermanentAnalysisError,
} from '../src/modules/ai/application/ports/ai.ports';
import { CheckoutExpiryService } from '../src/modules/orders/application/checkout-expiry.service';
import { NotificationDispatcher } from '../src/modules/notify/application/notification-dispatcher.service';
import {
  type ChannelPayload,
  type ChannelSender,
  EMAIL_CHANNEL,
  PermanentSendError,
  PUSH_CHANNEL,
  type SendContext,
  WHATSAPP_CHANNEL,
} from '../src/modules/notify/application/ports/notify.ports';
import { FakePaymentGateway } from '../src/modules/payments/infrastructure/fake.gateway';
import { RazorpayGateway } from '../src/modules/payments/infrastructure/razorpay.gateway';
import { GenerationWorker } from '../src/modules/studio/application/generation-worker.service';
import { CatalogWorker } from '../src/modules/ai-catalog/application/catalog-worker.service';
import { TryOnWorker } from '../src/modules/try-on/application/try-on-worker.service';
import { PREVIEW_CHECKER, type PreviewChecker } from '../src/modules/try-on/application/ports/try-on.ports';
import {
  FASHN_CLIENT,
  type FashnClient,
  type FashnStatus,
  FashnRequestError,
  IMAGE_DESCRIBER,
  type ImageDescriber,
} from '../src/modules/ai-catalog/application/ports/catalog.ports';
import { PINTEREST_CLIENT, type PinterestClient } from '../src/modules/studio/application/ports/studio.ports';

/** In-memory Supabase Storage stand-in. */
export class FakeStorage implements ObjectStorage {
  readonly copies: { from: BucketKind; to: BucketKind; path: string }[] = [];
  async createSignedUploadUrl(bucket: BucketKind, path: string) {
    return { url: `https://storage.test/upload/${bucket}/${path}?token=t`, expiresInSeconds: 7200 };
  }
  async createSignedReadUrl(bucket: BucketKind, path: string) {
    return `https://storage.test/signed/${bucket}/${path}`;
  }
  publicUrl(path: string) {
    return `https://storage.test/public/${path}`;
  }
  async copy(from: BucketKind, to: BucketKind, path: string) {
    this.copies.push({ from, to, path });
  }
  async remove(bucket: BucketKind, paths: string[]) {
    for (const p of paths) this.files.delete(`${bucket}/${p}`);
  }
  /** Files the server wrote (cleaned uploads, AI images); tests may also put "uploaded" files here. */
  readonly files = new Map<string, { body: Buffer; contentType: string }>();
  async put(bucket: BucketKind, path: string, body: Buffer, contentType: string) {
    this.files.set(`${bucket}/${path}`, { body, contentType });
  }
  async get(bucket: BucketKind, path: string) {
    return this.files.get(`${bucket}/${path}`)?.body ?? null;
  }
}

/** Real Razorpay signature checks; network calls replaced. */
export class FakeRazorpay extends RazorpayGateway {
  readonly refunds: { providerPaymentId: string; amountInPaise: number }[] = [];
  override async createOrder() {
    return { id: `order_${randomUUID().replace(/-/g, '').slice(0, 14)}` };
  }
  override async refund(input: { providerPaymentId: string; amountInPaise: number }) {
    this.refunds.push(input);
    return { id: `rfnd_${randomUUID().replace(/-/g, '').slice(0, 14)}`, status: 'processed' as const };
  }
}

/** Records what would have been sent. Set `fail` to simulate provider errors. */
export class FakeChannel<C extends 'EMAIL' | 'WHATSAPP' | 'PUSH'> implements ChannelSender<C> {
  readonly sent: { payload: ChannelPayload[C]; userId: string | null }[] = [];
  enabled = true;
  fail: 'none' | 'temporary' | 'permanent' = 'none';
  constructor(readonly channel: C) {}
  async send(payload: ChannelPayload[C], ctx: SendContext): Promise<void> {
    if (this.fail === 'temporary') throw new Error('provider timeout');
    if (this.fail === 'permanent') throw new PermanentSendError('invalid number');
    this.sent.push({ payload, userId: ctx.userId });
  }
}

/** Deterministic unit vector for a string (random direction: unrelated strings are far apart). */
export function directionFor(seed: string, dims = 64): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const next = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) / 4294967296) * 2 - 1;
  };
  return normalise(Array.from({ length: dims }, () => next() + next() + next()));
}

/** 64-bit FNV-1a of a string as 16 hex characters. */
const hex16 = (text: string) =>
  [0x811c9dc5, 0x01000193]
    .map((seed) => {
      let h = seed;
      for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      return (h >>> 0).toString(16).padStart(8, '0');
    })
    .join('');

const normalise = (v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

/** A unit vector whose cosine with `base` is exactly `cos` (tilted towards `towards`). */
export function lookingLike(base: number[], cos: number, towards: string): number[] {
  const other = directionFor(towards, base.length);
  const dot = other.reduce((s, x, i) => s + x * base[i]!, 0);
  const orth = normalise(other.map((x, i) => x - dot * base[i]!));
  const sin = Math.sqrt(1 - cos * cos);
  return base.map((x, i) => cos * x + sin * orth[i]!);
}

/**
 * Stand-in for the Python AI service. Images look like `looks[path]` when set (tests
 * decide which images are look-alikes), otherwise like a random unrelated direction.
 */
export class FakeAnalyzer implements ImageAnalyzer {
  enabled = true;
  reachable = true;
  readonly looks = new Map<string, number[]>();
  readonly analysed: string[] = [];
  broken = new Set<string>();
  down = false;

  async analyze(imageUrl: string): Promise<AnalysisResult> {
    if (this.down) throw new AnalyzerUnavailableError('connection refused');
    const path = [...this.looks.keys(), ...this.broken].find((p) => imageUrl.includes(p));
    if (path && this.broken.has(path)) throw new PermanentAnalysisError('File is not a readable image');
    this.analysed.push(imageUrl);
    return {
      model: 'fake:clip',
      tagger: 'clip',
      embedding: (path && this.looks.get(path)) || directionFor(imageUrl),
      // Per-image hash: different pictures never share one, so only the vectors decide.
      phash: hex16(path ?? imageUrl),
      tags: [
        { tag: 'black', group: 'colour', label: 'Black', score: 0.82 },
        { tag: 'embroidery', group: 'embellishment', label: 'Embroidery', score: 0.7 },
      ],
      style: { value: 'BUTTERFLY', score: 0.61 },
      altText: 'Black butterfly abaya with embroidery',
    };
  }

  async health() {
    return { reachable: this.reachable, model: 'fake:clip', tagger: 'clip', loaded: true };
  }
}

/** Pinterest stand-in: known pins by id; a short pin.it link resolves to the first pin. */
export class FakePinterest implements PinterestClient {
  connected = false;
  readonly pins = new Map<string, { title: string; author: string; imageUrl: string }>([
    ['1234567890', { title: 'Emerald satin abaya', author: 'Studio Board', imageUrl: 'https://i.pinimg.com/236x/aa/bb/emerald.jpg' }],
  ]);
  async canonicalUrl(url: string) {
    return url.startsWith('https://pin.it/') ? 'https://www.pinterest.com/pin/1234567890/' : url;
  }
  async oembed(url: string) {
    const id = /\/pin\/(\d+)/.exec(url)?.[1];
    const pin = id ? this.pins.get(id) : undefined;
    return pin ? { title: pin.title, author: pin.author, imageUrl: pin.imageUrl } : null;
  }
  async boards() {
    return [{ id: 'b1', name: 'Eid 2027', pinCount: 1, coverUrl: null }];
  }
  async boardPins() {
    return [{ id: '1234567890', title: 'Emerald satin abaya', url: 'https://www.pinterest.com/pin/1234567890/', imageUrl: 'https://i.pinimg.com/236x/aa/bb/emerald.jpg' }];
  }
}

/**
 * FASHN stand-in: records every request; jobs stay pending until `finish()` (or complete at once
 * when `instant`), and `failNext` makes the next prediction fail with a FASHN error name.
 */
export class FakeFashn implements FashnClient {
  live = true;
  instant = true;
  balance: number | null = 120;
  readonly runs: { id: string; endpoint: string; inputs: Record<string, unknown> }[] = [];
  failNext: string | null = null;
  rejectRun: FashnRequestError | null = null;
  private readonly results = new Map<string, FashnStatus>();
  private n = 0;

  async run(endpoint: string, inputs: Record<string, unknown>) {
    if (this.rejectRun) {
      const e = this.rejectRun;
      this.rejectRun = null;
      throw e;
    }
    const id = `fake_${++this.n}`;
    this.runs.push({ id, endpoint, inputs });
    if (this.failNext) {
      this.results.set(id, { state: 'failed', errorName: this.failNext, message: 'raw provider text' });
      this.failNext = null;
    } else if (this.instant) {
      this.results.set(id, this.done(Number(inputs.num_images ?? 1)));
    }
    return { id };
  }

  /** Complete every pending prediction. */
  finishAll() {
    for (const r of this.runs) if (!this.results.has(r.id)) this.results.set(r.id, this.done(Number(r.inputs.num_images ?? 1)));
  }

  async status(id: string): Promise<FashnStatus> {
    return this.results.get(id) ?? { state: 'pending' };
  }

  async download(url: string) {
    const n = Number(url.split('/').pop());
    const data = await sharpImage(n);
    return { data, contentType: 'image/png' as const };
  }

  async credits() {
    return this.balance;
  }

  private done(count: number): FashnStatus {
    return { state: 'completed', output: Array.from({ length: count }, (_, i) => `https://cdn.fashn.ai/out/${i}`), creditsUsed: null };
  }
}

const sharpImage = async (seed: number) => {
  const { default: sharp } = await import('sharp');
  return sharp({ create: { width: 40, height: 50, channels: 3, background: { r: 30 + seed, g: 30, b: 30 } } }).png().toBuffer();
};

export { FashnRequestError };

/** Gemini vision stand-in: answers with `answer` and records the instructions it got. */
export class FakeDescriber implements ImageDescriber {
  available = true;
  answer: string | null = '"Dusty mauve satin with a soft sheen."';
  readonly asked: string[] = [];
  async describe(_image: { data: Buffer; mimeType: string }, instruction: string) {
    this.asked.push(instruction);
    return this.answer;
  }
}

/** Gemini preview-checker stand-in: passes everything unless `failNext` > 0; records each question. */
export class FakeChecker implements PreviewChecker {
  available = true;
  failNext = 0;
  /** What the next customer photo check says (null = could not tell). */
  photoVerdict: { ok: boolean; reason: string } | null = { ok: true, reason: 'ok' };
  readonly asked: string[] = [];
  /** Labels of the images sent with each check. */
  readonly shown: string[][] = [];
  async assessPhoto() {
    return this.photoVerdict;
  }
  /** Parts with design words are left out, surface parts kept (what Gemini decides in production). */
  async classifyRequest(question: string) {
    const wish = /Wish: <<<([\s\S]*)>>>/.exec(question)?.[1] ?? '';
    const parts = wish.split(/,|\band\b/).map((p) => p.trim()).filter(Boolean);
    const design = (p: string) => /lace|sleeve|neckline|length|cut|remove|accessor|add /i.test(p);
    return { kept: parts.filter((p) => !design(p)).join(', '), leftOut: parts.filter(design) };
  }
  async check(images: { label: string }[], question: string, count: number) {
    this.asked.push(question);
    this.shown.push(images.map((i) => i.label));
    if (this.failNext > 0) {
      this.failNext--;
      return Array.from({ length: count }, () => ({ ok: false, problem: 'the gold embroidery panels are missing' }));
    }
    return Array.from({ length: count }, () => ({ ok: true, problem: '' }));
  }
}

export interface TestChannels {
  email: FakeChannel<'EMAIL'>;
  whatsapp: FakeChannel<'WHATSAPP'>;
  push: FakeChannel<'PUSH'>;
}

export interface TestContext {
  app: NestExpressApplication;
  http: ReturnType<typeof request>;
  db: PrismaClient;
  storage: FakeStorage;
  razorpay: FakeRazorpay;
  channels: TestChannels;
  /** Send everything queued in the notification outbox now (the worker is off in tests). */
  flushNotifications: () => Promise<{ sent: number; retried: number; failed: number }>;
  /** Run the unpaid-checkout sweep as if it were `now`. */
  expireCheckouts: (now?: Date) => Promise<number>;
  analyzer: FakeAnalyzer;
  pinterest: FakePinterest;
  fashn: FakeFashn;
  describer: FakeDescriber;
  checker: FakeChecker;
  /** Run the AI Catalog worker until nothing moves (it is off in tests). */
  runCatalog: () => Promise<number>;
  /** Run the website preview/try-on worker until nothing moves; `at` runs one pass at that time (e.g. 31 days on). */
  runTryOn: (at?: Date) => Promise<{ submitted: number; finished: number; deleted: number; purged: number }>;
  /** Make the images of every queued AI design now (the Studio worker is off in tests). */
  runStudio: () => Promise<number>;
  /** Analyse every queued image now (the AI worker is off in tests). */
  runAi: () => Promise<{ done: number; retried: number; failed: number; deferred: number }>;
  config: AppConfig;
  close: () => Promise<void>;
}

export async function createTestApp(options: { testPayments?: boolean } = {}): Promise<TestContext> {
  const storage = new FakeStorage();
  // Clerk Backend API stand-in: profiles come from token claims in tests.
  const fakeClerk: AuthProviderAdmin = { getProfile: async () => ({}), deleteUser: async () => undefined };
  const channels: TestChannels = {
    email: new FakeChannel('EMAIL'),
    whatsapp: new FakeChannel('WHATSAPP'),
    push: new FakeChannel('PUSH'),
  };
  let razorpay!: FakeRazorpay;
  const analyzer = new FakeAnalyzer();
  const pinterest = new FakePinterest();
  const fashn = new FakeFashn();
  const checker = new FakeChecker();
  const describer = new FakeDescriber();
  let catalogClock = Date.now();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(OBJECT_STORAGE)
    .useValue(storage)
    .overrideProvider(IMAGE_ANALYZER)
    .useValue(analyzer)
    .overrideProvider(PINTEREST_CLIENT)
    .useValue(pinterest)
    .overrideProvider(FASHN_CLIENT)
    .useValue(fashn)
    .overrideProvider(IMAGE_DESCRIBER)
    .useValue(describer)
    .overrideProvider(PREVIEW_CHECKER)
    .useValue(checker)
    .overrideProvider(EMAIL_CHANNEL)
    .useValue(channels.email)
    .overrideProvider(WHATSAPP_CHANNEL)
    .useValue(channels.whatsapp)
    .overrideProvider(PUSH_CHANNEL)
    .useValue(channels.push)
    .overrideProvider(AUTH_PROVIDER_ADMIN)
    .useValue(fakeClerk)
    .overrideProvider(PAYMENT_GATEWAY)
    .useFactory({
      // testPayments: the development "Simulate payment" gateway (PAYMENT_PROVIDER=fake).
      factory: (config: AppConfig) => (options.testPayments ? new FakePaymentGateway() : (razorpay = new FakeRazorpay(config))),
      inject: [APP_CONFIG],
    })
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true, logger: false });
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);
  // Listen once on a random port so every request reuses the same server.
  await app.listen(0, '127.0.0.1');
  const db = new PrismaClient();
  return {
    app,
    http: request(app.getHttpServer()),
    db,
    storage,
    razorpay,
    channels,
    flushNotifications: () => app.get(NotificationDispatcher).runOnce(),
    expireCheckouts: (now?: Date) => app.get(CheckoutExpiryService).runOnce(now),
    analyzer,
    pinterest,
    fashn,
    describer,
    checker,
    runCatalog: async () => {
      let moved = 0;
      for (let i = 0; i < 20; i++) {
        // Each pass is a minute later than the last, so "check again in a few seconds" is due.
        catalogClock = Math.max(catalogClock, Date.now()) + 60_000;
        const r = await app.get(CatalogWorker).runOnce(new Date(catalogClock));
        if (r.submitted + r.finished + r.retried === 0) break;
        moved += r.submitted + r.finished;
      }
      return moved;
    },
    runTryOn: async (at?: Date) => {
      if (at) return app.get(TryOnWorker).runOnce(at);
      const total = { submitted: 0, finished: 0, deleted: 0, purged: 0 };
      for (let i = 0; i < 20; i++) {
        catalogClock = Math.max(catalogClock, Date.now()) + 60_000;
        const r = await app.get(TryOnWorker).runOnce(new Date(catalogClock));
        total.submitted += r.submitted;
        total.finished += r.finished;
        total.deleted += r.deleted;
        total.purged += r.purged;
        if (r.submitted + r.finished + r.deleted === 0) break;
      }
      return total;
    },
    runStudio: async () => {
      let n = 0;
      while (n < 50 && (await app.get(GenerationWorker).runOnce())) n++;
      return n;
    },
    runAi: async () => {
      const total = { done: 0, retried: 0, failed: 0, deferred: 0 };
      for (let i = 0; i < 50; i++) {
        const r = await app.get(AiWorker).runOnce();
        for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r[k];
        if (r.done + r.retried + r.failed === 0) break;
      }
      return total;
    },
    config,
    close: async () => {
      await db.$disconnect();
      await app.close();
    },
  };
}

/** A Clerk-style session token (RS256) signed with the test key from test/env.cjs. */
export async function tokenFor(
  authUserId: string,
  email: string,
  aal: 'aal1' | 'aal2' = 'aal1',
  extra: { azp?: string; phone?: string } = {},
): Promise<string> {
  const key = createPrivateKey(process.env.E2E_CLERK_PRIVATE_KEY!);
  return new SignJWT({
    email,
    ...(extra.phone ? { phone: extra.phone } : {}),
    sid: `sess_${authUserId.slice(-8)}`,
    // Factor verification age: [first factor, second factor]; -1 = no second factor this session.
    fva: [0, aal === 'aal2' ? 0 : -1],
    ...(extra.azp ? { azp: extra.azp } : {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'ins_test' })
    .setSubject(authUserId)
    .setIssuer('https://e2e.clerk.accounts.dev')
    .setIssuedAt()
    .setNotBefore('0s')
    .setExpirationTime('1h')
    .sign(key);
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  auth: { Authorization: string };
}

/** Log in once (creates the CUSTOMER row), then set roles directly, like make-admin does. */
export async function userWithRoles(ctx: TestContext, roles: Role[], label = roles.join('-').toLowerCase()): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.com`;
  const token = await tokenFor(`user_${randomUUID().replace(/-/g, '')}`, email);
  const auth = { Authorization: `Bearer ${token}` };
  const me = await ctx.http.get('/v1/me').set(auth).expect(200);
  if (roles.length > 0 && !(roles.length === 1 && roles[0] === 'CUSTOMER')) {
    await ctx.db.user.update({ where: { id: me.body.id }, data: { roles } });
  }
  return { id: me.body.id, email, token, auth };
}

export function signWebhook(body: string, secret = process.env.RAZORPAY_WEBHOOK_SECRET!): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function signPayment(orderId: string, paymentId: string, secret = process.env.RAZORPAY_KEY_SECRET!): string {
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

/** Option value ids by code, and size band ids by code, from a public design detail. */
export async function designChoices(ctx: TestContext, slug: string) {
  const res = await ctx.http.get(`/v1/designs/${slug}`).expect(200);
  const values: Record<string, string> = {};
  for (const g of res.body.optionGroups) for (const v of g.values) values[v.code] = v.id;
  const bands: Record<string, string> = {};
  for (const b of res.body.sizeBands) bands[b.code] = b.id;
  return { design: res.body as { id: string; slug: string; basePriceInPaise: number }, values, bands };
}

/** Address + one bag item + checkout + signed payment.captured webhook → a PAID order. */
export async function paidOrder(ctx: TestContext, customer: TestUser, slug: string, quantity = 1) {
  const address = await ctx.http
    .post('/v1/me/addresses')
    .set(customer.auth)
    .send({ fullName: 'Sana Ali', phone: '9988776655', line1: '7 Residency Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560025' })
    .expect(201);
  const { design, values, bands } = await designChoices(ctx, slug);
  await ctx.http
    .post('/v1/cart/items')
    .set(customer.auth)
    .send({ designId: design.id, selectedOptionValueIds: [values.crepe, values.navy, values.cuffed, values.snaps], sizeBandId: bands.M, quantity })
    .expect(201);
  const checkout = await ctx.http.post('/v1/checkout').set(customer.auth).send({ addressId: address.body.id }).expect(201);
  const body = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: `pay_${checkout.body.orderId.slice(0, 8)}`, order_id: checkout.body.razorpay.orderId, amount: checkout.body.totalInPaise, method: 'card' } } },
  });
  await ctx.http.post('/v1/payments/webhook').set('content-type', 'application/json').set('x-razorpay-signature', signWebhook(body)).send(body).expect(200);
  return checkout.body as { orderId: string; orderNumber: string; totalInPaise: number };
}

/** Who does each station for a test item (defaults: one shared team per test app). */
export interface TeamPick {
  pattern?: TestUser;
  cutting?: TestUser;
  qc?: TestUser;
  finishing?: TestUser;
  makerId?: string;
}

const defaultTeams = new WeakMap<TestContext, Promise<Required<TeamPick>>>();

function defaultTeam(ctx: TestContext): Promise<Required<TeamPick>> {
  let team = defaultTeams.get(ctx);
  if (!team) {
    team = (async () => ({
      pattern: await userWithRoles(ctx, ['PATTERN_TECHNICIAN'], 'team-pattern'),
      cutting: await userWithRoles(ctx, ['CUTTER'], 'team-cutter'),
      qc: await userWithRoles(ctx, ['QC'], 'team-qc'),
      finishing: await userWithRoles(ctx, ['FINISHER'], 'team-finisher'),
      makerId: (await addTailor(ctx, 'Team Tailors', 'team-tailor')).makerId,
    }))();
    defaultTeams.set(ctx, team);
  }
  return team;
}

/** The production manager picks the team (Assign team), as required before approval. */
export async function assignTeam(ctx: TestContext, pm: TestUser, itemId: string, pick: TeamPick = {}) {
  const d = await defaultTeam(ctx);
  return ctx.http
    .put(`/v1/admin/order-items/${itemId}/team`)
    .set(pm.auth)
    .send({
      pattern: (pick.pattern ?? d.pattern).id,
      cutting: (pick.cutting ?? d.cutting).id,
      qc: (pick.qc ?? d.qc).id,
      finishing: (pick.finishing ?? d.finishing).id,
      makerId: pick.makerId ?? d.makerId,
      dueDate: '2099-01-01',
    })
    .expect(200);
}

/** Paid order with its team and approved tech pack: the item waits at the pattern station (SPEC_APPROVED). */
export async function approvedItem(ctx: TestContext, pm: TestUser, customer: TestUser, slug = 'classic-nida-closed', team: TeamPick = {}) {
  const order = await paidOrder(ctx, customer, slug);
  const itemId = (await ctx.db.orderItem.findFirstOrThrow({ where: { orderId: order.orderId } })).id;
  await assignTeam(ctx, pm, itemId, team);
  const pack = await ctx.http.get(`/v1/admin/order-items/${itemId}/tech-pack`).set(pm.auth).expect(200);
  await ctx.http.put(`/v1/admin/order-items/${itemId}/tech-pack`).set(pm.auth).send({ content: pack.body.draft, approve: true }).expect(200);
  return { ...order, itemId };
}

/** A station photo, uploaded through the workshop's signed-URL endpoint. */
export async function stationPhoto(ctx: TestContext, user: TestUser): Promise<string> {
  const res = await ctx.http.post('/v1/workshop/uploads').set(user.auth).send({ contentType: 'image/jpeg' }).expect(201);
  return res.body.storagePath as string;
}

/** One station step (POST /v1/workshop/items/:id/advance). */
export function advance(ctx: TestContext, user: TestUser, itemId: string, body: { to: string; photoPath?: string; note?: string }) {
  return ctx.http.post(`/v1/workshop/items/${itemId}/advance`).set(user.auth).send(body);
}

/** A complete pattern (measurements, pieces, fabric, one PDF), saved by `user` on an item at PATTERN. */
export async function savePattern(ctx: TestContext, user: TestUser, itemId: string, over: Record<string, unknown> = {}, status = 200) {
  const upload = await ctx.http
    .post('/v1/workshop/uploads')
    .set(user.auth)
    .send({ contentType: 'application/pdf', purpose: 'PATTERN_FILE' })
    .expect(201);
  return ctx.http
    .put(`/v1/workshop/items/${itemId}/pattern`)
    .set(user.auth)
    .send({
      measurements: [
        { key: 'bustCm', bodyCm: 94, easeCm: 12 },
        { key: 'fullLengthCm', bodyCm: 138, easeCm: 2 },
      ],
      pieces: [
        { name: 'Front', count: 1 },
        { name: 'Back', count: 1 },
        { name: 'Sleeve', count: 2 },
      ],
      fabricWidthCm: 150,
      fabricLengthCm: 360,
      liningLengthCm: null,
      seamAllowanceMm: 10,
      notes: 'Grain straight on the front panels',
      files: [{ path: upload.body.storagePath, name: 'pattern-v1.pdf', contentType: 'application/pdf' }],
      ...over,
    })
    .expect(status);
}

/** The production manager (allowed at every station) takes an approved item through pattern and cutting. */
export async function toStitching(ctx: TestContext, pm: TestUser, itemId: string) {
  await advance(ctx, pm, itemId, { to: 'PATTERN' }).expect(200);
  await savePattern(ctx, pm, itemId);
  await advance(ctx, pm, itemId, { to: 'CUTTING' }).expect(200);
  await cutItem(ctx, pm, itemId);
}

/** "Cutting done" for the pieces of the helper pattern (Front, Back, Sleeve ×2), with a photo. */
export async function cutItem(ctx: TestContext, user: TestUser, itemId: string, over: Record<string, unknown> = {}, status = 200) {
  return ctx.http
    .post(`/v1/workshop/items/${itemId}/cutting`)
    .set(user.auth)
    .send({
      fabricLot: 'CR-NAVY-0925-03',
      colourConfirmed: true,
      fabricUsedCm: 370,
      wastageCm: 15,
      liningUsedCm: null,
      pieces: [
        { name: 'Front', count: 1, cut: true },
        { name: 'Back', count: 1, cut: true },
        { name: 'Sleeve', count: 2, cut: true },
      ],
      notes: '',
      photoPath: await stationPhoto(ctx, user),
      ...over,
    })
    .expect(status);
}

/**
 * "Stitching done" with every checklist line ticked (built like the website builds it) and
 * the finished sizes of the helper pattern (bust 106, full length 140). Starts the job first.
 */
export async function stitchItem(ctx: TestContext, user: TestUser, itemId: string, over: Record<string, unknown> = {}, status = 200) {
  const card = await ctx.http.get(`/v1/workshop/items/${itemId}`).set(user.auth).expect(200);
  if (card.body.claimedBy?.id !== user.id && card.body.actions.some((a: { kind: string }) => a.kind === 'claim')) {
    await ctx.http.post(`/v1/workshop/items/${itemId}/claim`).set(user.auth).expect(200);
  }
  const checklist = stitchingChecklist({
    techPack: card.body.techPack,
    pieces: card.body.pattern?.pieces ?? [],
    finishedLengthCm: card.body.pattern?.measurements.find((m: { key: string }) => m.key === 'fullLengthCm')?.finishedCm ?? null,
  });
  return ctx.http
    .post(`/v1/workshop/items/${itemId}/stitching`)
    .set(user.auth)
    .send({
      checklist: checklist.map((l) => ({ key: l.key, done: true })),
      measurements: [
        { key: 'fullLengthCm', measuredCm: 140.5 },
        { key: 'bustCm', measuredCm: 106 },
      ],
      notes: '',
      photoPath: await stationPhoto(ctx, user),
      ...over,
    })
    .expect(status);
}

/**
 * A tailor added the way the admin does it: Staff & roles → Add staff → Tailor (city).
 * They already have a login here, so the role applies at once; the login is linked to the
 * tailor record on their first workshop request.
 */
export async function addTailor(ctx: TestContext, name = 'Needle House', label = 'tailor') {
  const admin = await userWithRoles(ctx, ['SUPER_ADMIN'], 'staff-admin');
  const tailor = await userWithRoles(ctx, ['CUSTOMER'], label);
  await ctx.http
    .post('/v1/admin/staff-invites')
    .set(admin.auth)
    .send({ email: tailor.email, name, roles: ['MAKER'], tailor: { city: 'Hyderabad' } })
    .expect(201);
  const maker = await ctx.db.maker.findUniqueOrThrow({ where: { email: tailor.email } });
  return { tailor, makerId: maker.id };
}
