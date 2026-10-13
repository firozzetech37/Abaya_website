import { randomUUID } from 'node:crypto';
import { createTestApp, type TestContext, type TestUser, userWithRoles } from './helpers';

/**
 * Security review as a test (build plan step 10): discover EVERY registered
 * route and check it against the auth rules, so a new endpoint without a guard
 * fails CI instead of shipping.
 */

/** The only routes that may be called without logging in. */
const PUBLIC_ROUTES = new Set([
  'GET /v1/health',
  'GET /v1/designs',
  'GET /v1/designs/facets',
  'GET /v1/designs/:slug',
  'GET /v1/collections',
  'GET /v1/collections/:slug',
  'POST /v1/pricing/quote',
  'GET /v1/payments/config', // only says whether payments are real or test
  'POST /v1/payments/webhook', // authenticated by the Razorpay HMAC signature instead
  'GET /v1/announcements', // the live banner text shown to every visitor
  'GET /v1/pricing/rates', // INR → AED display rate for the currency switch
  'GET /v1/ordering/status', // whether ordering is open ("Ordering coming soon")
]);

/** Admin routes a DESIGNER may use (own designs, uploads, assigned references, dashboard). */
const DESIGNER_ALLOWED = [
  /^(GET|POST|PATCH|DELETE|PUT) \/v1\/admin\/designs/,
  /^POST \/v1\/admin\/uploads$/,
  /^GET \/v1\/admin\/references/,
  /^GET \/v1\/admin\/(dashboard|collections|options|size-bands)$/,
  /^GET \/v1\/admin\/audit-logs$/, // own-record history only; enforced in the service
  /^GET \/v1\/admin\/ai\/status$/, // AI service health and queue counts only (no catalogue data)
];

interface Route {
  method: string;
  path: string;
}

function listRoutes(ctx: TestContext): Route[] {
  // Express 4 router stack, as mounted by NestJS.
  const stack = (ctx.app.getHttpAdapter().getInstance() as { _router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] } })._router.stack;
  return stack
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.keys(layer.route!.methods).map((m) => ({ method: m.toUpperCase(), path: layer.route!.path })),
    );
}

const concrete = (path: string) => path.replace(/:(\w+)/g, (_, name: string) => (/slug|orderNumber/.test(name) ? 'missing' : randomUUID()));
const key = (r: Route) => `${r.method} ${r.path}`;

describe('Route security review (e2e)', () => {
  let ctx: TestContext;
  let routes: Route[];
  let customer: TestUser;
  let designer: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    routes = listRoutes(ctx).filter(
      // `/v1/*` is the request-logging middleware mounted for all methods, not an endpoint.
      (r) => r.path.startsWith('/v1/') && !r.path.startsWith('/v1/docs') && !r.path.includes('*'),
    );
    customer = await userWithRoles(ctx, ['CUSTOMER']);
    designer = await userWithRoles(ctx, ['DESIGNER']);
  });
  afterAll(() => ctx.close());

  const send = (r: Route, auth?: { Authorization: string }) => {
    const req = ctx.http[r.method.toLowerCase() as 'get'](concrete(r.path));
    if (auth) req.set(auth);
    return r.method === 'GET' ? req : req.send({});
  };

  it('finds the whole API surface', () => {
    expect(routes.length).toBeGreaterThanOrEqual(80);
    // The old maker app's API is gone: tailors use /v1/workshop.
    expect(routes.some((r) => r.path.startsWith('/v1/maker/'))).toBe(false);
    for (const publicRoute of PUBLIC_ROUTES) expect(routes.map(key)).toContain(publicRoute);
  });

  it('every non-public route answers 401 without a token', async () => {
    const leaks: string[] = [];
    for (const r of routes) {
      const res = await send(r).catch((e: Error) => {
        throw new Error(`${key(r)}: ${e.message}`);
      });
      const isPublic = PUBLIC_ROUTES.has(key(r));
      if (!isPublic && res.status !== 401) leaks.push(`${key(r)} → ${res.status}`);
      if (isPublic && (res.status === 401 || res.status === 403)) leaks.push(`${key(r)} (public) → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('every admin and workshop route answers 403 to a customer', async () => {
    const leaks: string[] = [];
    const staffPrefixes = ['/v1/admin/', '/v1/workshop/', '/v1/studio/'];
    for (const r of routes.filter((x) => staffPrefixes.some((p) => x.path.startsWith(p)))) {
      const res = await send(r, customer.auth);
      if (res.status !== 403) leaks.push(`${key(r)} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('designers are kept out of orders, makers, users, pricing and refunds', async () => {
    const leaks: string[] = [];
    for (const r of routes.filter((x) => x.path.startsWith('/v1/admin/'))) {
      if (DESIGNER_ALLOWED.some((re) => re.test(key(r)))) continue;
      const res = await send(r, designer.auth);
      if (res.status !== 403) leaks.push(`${key(r)} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('customer routes never expose another customer’s records', async () => {
    const owner = await userWithRoles(ctx, ['CUSTOMER']);
    const address = await ctx.http
      .post('/v1/me/addresses')
      .set(owner.auth)
      .send({ fullName: 'Owner', phone: '9000000001', line1: '1 Lane', city: 'Delhi', state: 'Delhi', pincode: '110001' })
      .expect(201);
    const profile = await ctx.http
      .post('/v1/me/measurements')
      .set(owner.auth)
      .send({ heightCm: 160, bustCm: 90, waistCm: 75, hipCm: 98, shoulderCm: 38, sleeveLengthCm: 57, fullLengthCm: 136 })
      .expect(201);

    await ctx.http.patch(`/v1/me/addresses/${address.body.id}`).set(customer.auth).send({ city: 'Pune' }).expect(404);
    await ctx.http.get(`/v1/me/measurements/${profile.body.id}`).set(customer.auth).expect(404);
    await ctx.http.patch(`/v1/me/measurements/${profile.body.id}`).set(customer.auth).send({ bustCm: 80 }).expect(404);
    await ctx.http.delete(`/v1/me/measurements/${profile.body.id}`).set(customer.auth).expect(404);
    // Using someone else's measurement profile in your own bag is refused too.
    const design = await ctx.http.get('/v1/designs/classic-nida-closed').expect(200);
    await ctx.http
      .post('/v1/cart/items')
      .set(customer.auth)
      .send({ designId: design.body.id, selectedOptionValueIds: [], measurementProfileId: profile.body.id })
      .expect(404);
    expect((await ctx.http.get('/v1/me/addresses').set(customer.auth).expect(200)).body).toEqual([]);
  });
});
