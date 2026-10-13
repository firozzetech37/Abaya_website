/**
 * Sample images for the 10 seed designs: original studio-style illustrations
 * (front + back view) drawn from each design's style, colour and details, so
 * the admin, website and apps have something good to show in development.
 * They are NOT photos of real products and should be replaced before launch.
 *
 * Paths match seed.ts: `seed/<slug>-1.jpg` (front) and `seed/<slug>-2.jpg` (back)
 * in the public "designs" bucket.
 *
 *   Preview locally:  pnpm --filter @abaya/db seed:images --out ./tmp/seed-images
 *   Upload:           pnpm --filter @abaya/db seed:images
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

type Style = 'CLOSED' | 'OPEN_FRONT' | 'BUTTERFLY' | 'KIMONO' | 'BISHT' | 'KAFTAN';
type Sleeve = 'straight' | 'bell' | 'cuffed';
type Detail = 'pleats' | 'belt' | 'lace' | 'gold-trim' | 'cuff-embroidery' | 'back-stonework' | 'neck-embroidery' | 'piping';

interface Look {
  slug: string;
  style: Style;
  colour: string;
  inner?: string; // visible inner layer for open styles
  sleeve?: Sleeve;
  details: Detail[];
}

/** Same slugs as seed.ts. Colours chosen from the seeded COLOUR options. */
const LOOKS: Look[] = [
  { slug: 'classic-nida-closed', style: 'CLOSED', colour: '#1B1B1D', sleeve: 'straight', details: ['piping'] },
  { slug: 'open-front-kimono', style: 'KIMONO', colour: '#1F2A44', inner: '#D8C8A8', details: [] },
  { slug: 'butterfly-flow', style: 'BUTTERFLY', colour: '#C9A0A0', details: ['back-stonework'] },
  { slug: 'pleated-front-closed', style: 'CLOSED', colour: '#4B5320', sleeve: 'cuffed', details: ['pleats'] },
  { slug: 'bisht-edge-occasion', style: 'BISHT', colour: '#161618', inner: '#2A2A2E', details: ['gold-trim', 'back-stonework'] },
  { slug: 'everyday-open-front', style: 'OPEN_FRONT', colour: '#CDBB9A', inner: '#F4EFE6', sleeve: 'straight', details: [] },
  { slug: 'kaftan-lounge', style: 'KAFTAN', colour: '#5A1E22', details: ['neck-embroidery'] },
  { slug: 'tailored-work-closed', style: 'CLOSED', colour: '#23304D', sleeve: 'cuffed', details: ['piping'] },
  { slug: 'eid-lace-butterfly', style: 'BUTTERFLY', colour: '#141416', details: ['lace', 'cuff-embroidery', 'back-stonework'] },
  { slug: 'belted-open-front', style: 'OPEN_FRONT', colour: '#6B5A4A', inner: '#E9E1D4', sleeve: 'bell', details: ['belt'] },
];

const W = 1200;
const H = 1500;
const GOLD = '#C9A24B';

// ───────────── colour helpers ─────────────

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 110;
};

// ───────────── shapes (front view; x mirrored for the right side) ─────────────

const NECK = 'M 545 300 Q 600 338 655 300';

function bodyPath(style: Style): string {
  switch (style) {
    case 'BUTTERFLY':
      return `M 545 300 Q 600 338 655 300 L 765 330 Q 955 470 1045 745 Q 905 800 790 805 Q 806 1060 800 1332 Q 600 1352 400 1332 Q 394 1060 410 805 Q 295 800 155 745 Q 245 470 435 330 Z`;
    case 'KAFTAN':
      return `M 545 300 Q 600 338 655 300 L 705 312 L 965 402 L 992 770 Q 885 798 792 788 L 806 1332 Q 600 1350 394 1332 L 408 788 Q 315 798 208 770 L 235 402 L 495 312 Z`;
    case 'BISHT':
      return `M 545 300 Q 600 338 655 300 L 775 335 Q 870 700 900 1332 Q 600 1356 300 1332 Q 330 700 425 335 Z`;
    case 'KIMONO':
      return `M 545 300 Q 600 338 655 300 L 748 342 Q 770 820 790 1332 Q 600 1350 410 1332 Q 430 820 452 342 Z`;
    default: // CLOSED, OPEN_FRONT: soft A-line
      return `M 545 300 Q 600 338 655 300 L 752 345 Q 792 800 818 1332 Q 600 1352 382 1332 Q 408 800 448 345 Z`;
  }
}

/** Left sleeve; the right one is the same path mirrored. Null when sleeves are part of the body. */
function sleevePath(style: Style, sleeve: Sleeve = 'straight'): string | null {
  if (style === 'BUTTERFLY' || style === 'KAFTAN') return null;
  if (style === 'KIMONO') return 'M 455 350 Q 330 372 238 430 L 222 842 Q 330 868 432 850 L 470 560 Z';
  if (style === 'BISHT') return 'M 428 340 Q 320 380 250 470 L 205 905 Q 300 930 395 912 L 452 600 Z';
  if (sleeve === 'bell') return 'M 448 346 Q 402 362 388 420 L 300 890 Q 360 928 440 905 L 458 525 Z';
  return 'M 448 346 Q 400 362 386 420 L 322 880 Q 356 906 408 896 L 458 525 Z';
}

function mirrored(content: string): string {
  return `<g transform="translate(${W},0) scale(-1,1)">${content}</g>`;
}

// ───────────── details ─────────────

function folds(style: Style, base: string): string {
  const dark = shade(base, -0.35);
  const light = shade(base, isDark(base) ? 0.22 : 0.18);
  const xs = style === 'BISHT' ? [380, 470, 730, 820] : style === 'BUTTERFLY' ? [450, 520, 680, 750] : [440, 505, 695, 760];
  const lines = xs
    .map((x, i) => {
      const drift = x < 600 ? -18 : 18;
      return `<path d="M ${x + drift * 0.2} ${620 + (i % 2) * 40} Q ${x + drift} 1000 ${x + drift * 2} 1322" stroke="${dark}" stroke-width="10" fill="none" opacity="0.22" stroke-linecap="round"/>
<path d="M ${x + 14} ${660 + (i % 2) * 30} Q ${x + 14 + drift} 1020 ${x + 14 + drift * 2} 1318" stroke="${light}" stroke-width="5" fill="none" opacity="0.18" stroke-linecap="round"/>`;
    })
    .join('');
  return lines;
}

function frontOpening(inner: string, base: string, trim: boolean): string {
  const edge = trim ? GOLD : shade(base, -0.3);
  return `<path d="M 582 312 L 618 312 L 648 1340 L 552 1340 Z" fill="${inner}"/>
<path d="M 582 312 L 552 1340" stroke="${edge}" stroke-width="${trim ? 9 : 5}" fill="none"/>
<path d="M 618 312 L 648 1340" stroke="${edge}" stroke-width="${trim ? 9 : 5}" fill="none"/>`;
}

function pleats(base: string): string {
  const dark = shade(base, -0.4);
  return [548, 574, 600, 626, 652]
    .map((x) => `<path d="M ${x} 420 Q ${x + (x - 600) * 0.15} 900 ${x + (x - 600) * 0.45} 1330" stroke="${dark}" stroke-width="4" fill="none" opacity="0.45"/>`)
    .join('');
}

function belt(base: string): string {
  const band = shade(base, -0.28);
  return `<path d="M 434 655 Q 600 676 766 655 L 768 695 Q 600 716 432 695 Z" fill="${band}"/>
<rect x="578" y="660" width="44" height="46" rx="6" fill="none" stroke="${GOLD}" stroke-width="6"/>
<path d="M 600 705 L 585 860 M 604 705 L 628 850" stroke="${band}" stroke-width="14" stroke-linecap="round"/>`;
}

function lace(base: string): string {
  const colour = shade(base, 0.55);
  let dots = '';
  for (let y = 360; y < 1320; y += 26) {
    const spread = 18 + (y - 360) * 0.05;
    for (const dx of [-spread, 0, spread]) dots += `<circle cx="${600 + dx}" cy="${y + (dx === 0 ? 13 : 0)}" r="5" fill="none" stroke="${colour}" stroke-width="2" opacity="0.8"/>`;
  }
  let scallops = '';
  for (let x = 410; x < 790; x += 30) scallops += `<path d="M ${x} 1318 q 15 18 30 0" stroke="${colour}" stroke-width="3" fill="none" opacity="0.8"/>`;
  return dots + scallops;
}

function cuffEmbroidery(style: Style): string {
  const points = style === 'BUTTERFLY' ? [[175, 735], [1025, 735]] : [[365, 880], [835, 880]];
  return points
    .map(([cx, cy]) =>
      Array.from({ length: 7 }, (_, i) => `<circle cx="${cx! + (i - 3) * 16}" cy="${cy! - Math.abs(i - 3) * 3}" r="5" fill="${GOLD}"/>`).join(''),
    )
    .join('');
}

function neckEmbroidery(): string {
  let s = '';
  for (let t = 0; t <= 1; t += 0.06) {
    const x = 540 + 120 * t;
    const y = 300 + 4 * 42 * t * (1 - t) + 12;
    s += `<circle cx="${x}" cy="${y}" r="5" fill="${GOLD}"/>`;
  }
  return s + `<path d="M 600 350 L 600 470" stroke="${GOLD}" stroke-width="4" stroke-dasharray="6 10"/>`;
}

function piping(base: string): string {
  const c = isDark(base) ? shade(base, 0.35) : shade(base, -0.35);
  return `<path d="${NECK}" stroke="${c}" stroke-width="6" fill="none"/>
<path d="M 600 336 L 600 520" stroke="${c}" stroke-width="4" fill="none"/>`;
}

function backStonework(): string {
  let s = '';
  const rows = [[600, 420, 7], [600, 470, 9], [600, 520, 11], [600, 570, 9], [600, 620, 7]] as const;
  for (const [cx, cy, n] of rows) {
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * 24;
      s += `<path d="M ${x} ${cy - 7} L ${x + 6} ${cy} L ${x} ${cy + 7} L ${x - 6} ${cy} Z" fill="#E9E2D0" opacity="0.9"/>`;
    }
  }
  return s;
}

// ───────────── composition ─────────────

function svgFor(look: Look, view: 'front' | 'back'): string {
  const base = look.colour;
  const body = bodyPath(look.style);
  const sleeve = sleevePath(look.style, look.sleeve);
  const open = view === 'front' && (look.style === 'OPEN_FRONT' || look.style === 'KIMONO' || look.style === 'BISHT');
  const d = new Set(look.details);

  const sleeves = sleeve
    ? `<path d="${sleeve}" fill="url(#fabricL)"/>${mirrored(`<path d="${sleeve}" fill="url(#fabricL)"/>`)}`
    : '';

  const front = [
    open ? frontOpening(look.inner ?? shade(base, 0.6), base, d.has('gold-trim')) : '',
    view === 'front' && d.has('pleats') ? pleats(base) : '',
    view === 'front' && d.has('lace') ? lace(base) : '',
    view === 'front' && d.has('neck-embroidery') ? neckEmbroidery() : '',
    view === 'front' && d.has('piping') && !open ? piping(base) : '',
    d.has('belt') ? belt(base) : '',
    d.has('cuff-embroidery') ? cuffEmbroidery(look.style) : '',
    view === 'back' && d.has('back-stonework') ? backStonework() : '',
    view === 'back' ? `<path d="M 600 330 L 600 1330" stroke="${shade(base, -0.3)}" stroke-width="3" opacity="0.35"/>` : '',
    d.has('gold-trim') && view === 'front'
      ? `<path d="${NECK}" stroke="${GOLD}" stroke-width="9" fill="none"/>`
      : '',
    d.has('gold-trim') && sleeve
      ? `<path d="M 205 905 Q 300 930 395 912" stroke="${GOLD}" stroke-width="9" fill="none"/>${mirrored(`<path d="M 205 905 Q 300 930 395 912" stroke="${GOLD}" stroke-width="9" fill="none"/>`)}`
      : '',
  ].join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F3EEE7"/><stop offset="0.72" stop-color="#E9E1D6"/><stop offset="1" stop-color="#DDD3C6"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.38" r="0.6">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="fabric" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${shade(base, isDark(base) ? 0.16 : 0.1)}"/>
    <stop offset="0.45" stop-color="${base}"/>
    <stop offset="1" stop-color="${shade(base, -0.28)}"/>
  </linearGradient>
  <linearGradient id="fabricL" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${shade(base, isDark(base) ? 0.1 : 0.05)}"/>
    <stop offset="1" stop-color="${shade(base, -0.18)}"/>
  </linearGradient>
  <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#8A6A4F"/><stop offset="1" stop-color="#5E4633"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<ellipse cx="600" cy="1372" rx="330" ry="26" fill="#000" opacity="0.10"/>
<rect x="566" y="150" width="68" height="170" rx="30" fill="url(#wood)"/>
<ellipse cx="600" cy="152" rx="40" ry="14" fill="#6E533D"/>
${sleeves}
<path d="${body}" fill="url(#fabric)"/>
${folds(look.style, base)}
${front}
<path d="${NECK}" stroke="${shade(base, -0.4)}" stroke-width="3" fill="none" opacity="0.6"/>
</svg>`;
}

async function render(look: Look, view: 'front' | 'back'): Promise<Buffer> {
  return sharp(Buffer.from(svgFor(look, view))).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

// ───────────── upload ─────────────

async function ensurePublicBucket(base: string, key: string, bucket: string): Promise<void> {
  const headers = { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json' };
  const res = await fetch(`${base}/storage/v1/bucket/${bucket}`, { headers });
  if (res.ok) return;
  const created = await fetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: bucket, name: bucket, public: true }),
  });
  if (!created.ok) throw new Error(`Bucket "${bucket}" is missing and could not be created (${created.status}).`);
  console.log(`Created public bucket "${bucket}".`);
}

async function upload(base: string, key: string, bucket: string, objectPath: string, body: Buffer): Promise<void> {
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': '3600' },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`Upload of ${objectPath} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

async function main() {
  const outIndex = process.argv.indexOf('--out');
  const outDir = outIndex > -1 ? process.argv[outIndex + 1] : undefined;

  if (outDir) {
    await mkdir(outDir, { recursive: true });
    for (const look of LOOKS) {
      await writeFile(path.join(outDir, `${look.slug}-1.jpg`), await render(look, 'front'));
      await writeFile(path.join(outDir, `${look.slug}-2.jpg`), await render(look, 'back'));
    }
    console.log(`Wrote ${LOOKS.length * 2} images to ${outDir}`);
    return;
  }

  const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET_DESIGNS || 'designs';
  if (!base || !key || base.includes('[PROJECT-REF]')) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
  }
  await ensurePublicBucket(base, key, bucket);
  for (const look of LOOKS) {
    await upload(base, key, bucket, `seed/${look.slug}-1.jpg`, await render(look, 'front'));
    await upload(base, key, bucket, `seed/${look.slug}-2.jpg`, await render(look, 'back'));
    console.log(`✓ ${look.slug}`);
  }
  console.log(`Uploaded ${LOOKS.length * 2} images to the "${bucket}" bucket.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
