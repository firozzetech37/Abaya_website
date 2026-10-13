/**
 * Seed: option groups + values, size bands, collections and 10 sample designs.
 * Safe to run more than once (uses upserts).
 *
 * All prices are PLACEHOLDERS in paise (₹1 = 100 paise). Replace with real
 * prices in the admin panel before launch.
 *
 * Run: pnpm db:seed
 */
import {
  type AbayaStyle,
  DesignStatus,
  type OptionGroupCode,
  PrismaClient,
  type SelectionType,
  type SizeBandCode,
} from '@prisma/client';

const prisma = new PrismaClient();
const rupees = (r: number) => Math.round(r * 100);

type ValueSeed = { code: string; name: string; surcharge: number; colourHex?: string };

const groups: {
  code: OptionGroupCode;
  name: string;
  selectionType: SelectionType;
  isRequired: boolean;
  values: ValueSeed[];
}[] = [
  {
    code: 'FABRIC',
    name: 'Fabric',
    selectionType: 'SINGLE',
    isRequired: true,
    values: [
      { code: 'nida', name: 'Nida', surcharge: 0 },
      { code: 'crepe', name: 'Crepe', surcharge: 300 },
      { code: 'jersey', name: 'Jersey', surcharge: 200 },
      { code: 'linen', name: 'Linen', surcharge: 400 },
      { code: 'chiffon', name: 'Chiffon (layered)', surcharge: 500 },
      { code: 'satin', name: 'Satin', surcharge: 600 },
    ],
  },
  {
    code: 'COLOUR',
    name: 'Colour',
    selectionType: 'SINGLE',
    isRequired: true,
    values: [
      { code: 'black', name: 'Black', surcharge: 0, colourHex: '#111111' },
      { code: 'navy', name: 'Navy', surcharge: 0, colourHex: '#1F2A44' },
      { code: 'olive', name: 'Olive', surcharge: 0, colourHex: '#4B5320' },
      { code: 'beige', name: 'Beige', surcharge: 0, colourHex: '#D8C8A8' },
      { code: 'maroon', name: 'Maroon', surcharge: 0, colourHex: '#5A1E22' },
      { code: 'dusty-pink', name: 'Dusty Pink', surcharge: 0, colourHex: '#C9A0A0' },
    ],
  },
  {
    code: 'PATTERN_COLOUR',
    name: 'Pattern colour',
    selectionType: 'SINGLE',
    isRequired: false,
    values: [
      { code: 'gold', name: 'Gold', surcharge: 0, colourHex: '#C9A24A' },
      { code: 'antique-gold', name: 'Antique gold', surcharge: 0, colourHex: '#9E7A2F' },
      { code: 'silver', name: 'Silver', surcharge: 150, colourHex: '#C3C7CF' },
      { code: 'copper', name: 'Copper', surcharge: 150, colourHex: '#B5672A' },
      { code: 'rose-gold', name: 'Rose gold', surcharge: 200, colourHex: '#D9A08E' },
      { code: 'tone-on-tone', name: 'Tone-on-tone', surcharge: 0, colourHex: '#3A3A3A' },
    ],
  },
  {
    code: 'SLEEVE',
    name: 'Sleeves',
    selectionType: 'SINGLE',
    isRequired: true,
    values: [
      { code: 'straight', name: 'Straight', surcharge: 0 },
      { code: 'elastic', name: 'Elastic cuff', surcharge: 100 },
      { code: 'wide', name: 'Wide', surcharge: 150 },
      { code: 'bell', name: 'Bell', surcharge: 200 },
      { code: 'cuffed', name: 'Buttoned cuff', surcharge: 250 },
    ],
  },
  {
    code: 'EMBELLISHMENT',
    name: 'Embellishment',
    selectionType: 'MULTI',
    isRequired: false,
    values: [
      { code: 'piping', name: 'Contrast piping', surcharge: 200 },
      { code: 'cuff-embroidery', name: 'Cuff embroidery', surcharge: 450 },
      { code: 'front-lace', name: 'Front lace panel', surcharge: 600 },
      { code: 'back-stonework', name: 'Back stonework', surcharge: 900 },
    ],
  },
  {
    code: 'CLOSURE',
    name: 'Closure',
    selectionType: 'SINGLE',
    isRequired: true,
    values: [
      { code: 'open', name: 'Open front', surcharge: 0 },
      { code: 'snaps', name: 'Hidden snaps', surcharge: 100 },
      { code: 'buttons', name: 'Buttons', surcharge: 150 },
      { code: 'zip', name: 'Zip', surcharge: 200 },
    ],
  },
  {
    code: 'ADD_ON',
    name: 'Add-ons',
    selectionType: 'MULTI',
    isRequired: false,
    values: [
      { code: 'belt', name: 'Matching belt', surcharge: 299 },
      { code: 'hijab', name: 'Matching hijab', surcharge: 499 },
      { code: 'shayla', name: 'Matching shayla', surcharge: 599 },
      { code: 'inner-slip', name: 'Inner slip', surcharge: 699 },
    ],
  },
];

const sizeBands: { code: SizeBandCode; label: string; adjustment: number; bust?: [number, number] }[] = [
  { code: 'XS', label: 'XS (bust 78–82 cm)', adjustment: 0, bust: [78, 82] },
  { code: 'S', label: 'S (bust 83–87 cm)', adjustment: 0, bust: [83, 87] },
  { code: 'M', label: 'M (bust 88–94 cm)', adjustment: 0, bust: [88, 94] },
  { code: 'L', label: 'L (bust 95–101 cm)', adjustment: 0, bust: [95, 101] },
  { code: 'XL', label: 'XL (bust 102–108 cm)', adjustment: 0, bust: [102, 108] },
  { code: 'XXL', label: 'XXL (bust 109–116 cm)', adjustment: 200, bust: [109, 116] },
  { code: 'CUSTOM', label: 'Made to my measurements', adjustment: 300 },
];

const collections = [
  { slug: 'everyday', name: 'Everyday Essentials', sortOrder: 1 },
  { slug: 'occasion', name: 'Occasion & Eid', sortOrder: 2 },
  { slug: 'work', name: 'Workwear', sortOrder: 3 },
];

const designs: {
  slug: string;
  name: string;
  style: AbayaStyle;
  base: number;
  tags: string[];
  collection: string;
  description: string;
}[] = [
  { slug: 'classic-nida-closed', name: 'Classic Nida Closed Abaya', style: 'CLOSED', base: 2499, tags: ['minimal', 'daily'], collection: 'everyday', description: 'A clean, closed-front abaya with a straight fall.' },
  { slug: 'open-front-kimono', name: 'Open-Front Kimono Abaya', style: 'KIMONO', base: 2999, tags: ['layering', 'relaxed'], collection: 'everyday', description: 'Kimono sleeves and an open front for easy layering.' },
  { slug: 'butterfly-flow', name: 'Butterfly Flow Abaya', style: 'BUTTERFLY', base: 3299, tags: ['flowy', 'occasion'], collection: 'occasion', description: 'A wide butterfly cut that drapes from the shoulders.' },
  { slug: 'pleated-front-closed', name: 'Pleated Front Closed Abaya', style: 'CLOSED', base: 3499, tags: ['pleats', 'work'], collection: 'work', description: 'Soft front pleats with a tailored shoulder.' },
  { slug: 'bisht-edge-occasion', name: 'Bisht-Edge Occasion Abaya', style: 'BISHT', base: 4999, tags: ['occasion', 'trim'], collection: 'occasion', description: 'Bisht-inspired open cut with trimmed edges.' },
  { slug: 'everyday-open-front', name: 'Everyday Open-Front Abaya', style: 'OPEN_FRONT', base: 2699, tags: ['daily', 'lightweight'], collection: 'everyday', description: 'A lightweight open-front abaya for daily wear.' },
  { slug: 'kaftan-lounge', name: 'Kaftan Lounge Abaya', style: 'KAFTAN', base: 2799, tags: ['relaxed', 'home'], collection: 'everyday', description: 'Relaxed kaftan silhouette with a round neckline.' },
  { slug: 'tailored-work-closed', name: 'Tailored Work Abaya', style: 'CLOSED', base: 3199, tags: ['work', 'structured'], collection: 'work', description: 'Structured shoulders and a narrow sleeve for the office.' },
  { slug: 'eid-lace-butterfly', name: 'Eid Lace Butterfly Abaya', style: 'BUTTERFLY', base: 5499, tags: ['eid', 'lace'], collection: 'occasion', description: 'Butterfly cut designed for lace and embroidery options.' },
  { slug: 'belted-open-front', name: 'Belted Open-Front Abaya', style: 'OPEN_FRONT', base: 3099, tags: ['belted', 'modern'], collection: 'work', description: 'An open-front abaya shaped with a matching belt.' },
];

const defaultValueCodes: Record<string, string> = {
  FABRIC: 'nida',
  COLOUR: 'black',
  PATTERN_COLOUR: 'gold',
  SLEEVE: 'straight',
  CLOSURE: 'buttons',
};

async function main() {
  // Option groups and values
  for (const [i, g] of groups.entries()) {
    const group = await prisma.optionGroup.upsert({
      where: { code: g.code },
      update: { name: g.name, selectionType: g.selectionType, isRequired: g.isRequired, sortOrder: i },
      create: { code: g.code, name: g.name, selectionType: g.selectionType, isRequired: g.isRequired, sortOrder: i },
    });
    for (const [j, v] of g.values.entries()) {
      await prisma.optionValue.upsert({
        where: { groupId_code: { groupId: group.id, code: v.code } },
        update: { name: v.name, surchargeInPaise: rupees(v.surcharge), colourHex: v.colourHex ?? null, sortOrder: j },
        create: {
          groupId: group.id,
          code: v.code,
          name: v.name,
          surchargeInPaise: rupees(v.surcharge),
          colourHex: v.colourHex ?? null,
          sortOrder: j,
        },
      });
    }
  }

  // Size bands
  for (const [i, s] of sizeBands.entries()) {
    const data = {
      label: s.label,
      adjustmentInPaise: rupees(s.adjustment),
      bustMinCm: s.bust?.[0] ?? null,
      bustMaxCm: s.bust?.[1] ?? null,
      sortOrder: i,
    };
    await prisma.sizeBand.upsert({ where: { code: s.code }, update: data, create: { code: s.code, ...data } });
  }

  // Collections
  for (const c of collections) {
    await prisma.collection.upsert({ where: { slug: c.slug }, update: c, create: c });
  }

  // Sample designs (published, so the storefront has content in development)
  const allValues = await prisma.optionValue.findMany({ include: { group: true } });
  for (const d of designs) {
    const design = await prisma.design.upsert({
      where: { slug: d.slug },
      update: { name: d.name, basePriceInPaise: rupees(d.base) },
      create: {
        slug: d.slug,
        name: d.name,
        description: d.description,
        style: d.style,
        tags: d.tags,
        status: DesignStatus.PUBLISHED,
        basePriceInPaise: rupees(d.base),
        makingCostInPaise: rupees(Math.round(d.base * 0.35)),
        publishedAt: new Date(),
        collections: { connect: { slug: d.collection } },
        images: {
          create: [
            { storagePath: `seed/${d.slug}-1.jpg`, alt: d.name, isPrimary: true, sortOrder: 0 },
            { storagePath: `seed/${d.slug}-2.jpg`, alt: `${d.name} back view`, sortOrder: 1 },
          ],
        },
      },
    });

    for (const v of allValues) {
      await prisma.designOption.upsert({
        where: { designId_optionValueId: { designId: design.id, optionValueId: v.id } },
        update: {},
        create: {
          designId: design.id,
          optionValueId: v.id,
          isDefault: defaultValueCodes[v.group.code] === v.code,
        },
      });
    }
  }

  console.log(
    `Seeded ${groups.length} option groups, ${sizeBands.length} size bands, ${collections.length} collections, ${designs.length} designs.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
