import { describe, expect, it } from 'vitest';
import {
  buildEditPrompt,
  buildOneStepPrompt,
  photoshootShots,
  catalogStyling,
  hasJewellery,
  tidy,
  accessoriesText,
  framingText,
  referenceEdit,
  orderReferences,
  heightText,
  createOneStepBody,
  CATALOG_BACKGROUNDS,
  poseText,
  SHAYLA_OPTIONS,
  suggestPoses,
  varietyTraits,
  buildMasterPrompt,
  buildModelPrompt,
  buildPosePrompt,
  aiModelAttributes,
  classifyEdit,
  creditCost,
  overallScore,
  retryPrompt,
  reviewCatalogImageBody,
} from './catalog';

describe('AI catalog credits', () => {
  it('follows the FASHN credit table', () => {
    expect(creditCost({ kind: 'TRYON', resolution: '2k', mode: 'balanced', numImages: 1 })).toBe(3);
    expect(creditCost({ kind: 'TRYON', resolution: '4k', mode: 'quality', numImages: 1 })).toBe(5);
    expect(creditCost({ kind: 'EDIT', resolution: '1k', mode: 'fast', numImages: 4 })).toBe(4);
    expect(creditCost({ kind: 'MODEL_CREATE', resolution: '2k', mode: 'fast', numImages: 2, faceReference: true })).toBe(10);
    expect(creditCost({ kind: 'BACKGROUND_REMOVE', resolution: '4k', mode: 'quality', numImages: 1 })).toBe(1);
  });
});

describe('edit classifier', () => {
  it.each([
    ['Change fabric to matte black Nida.', 'FABRIC'],
    ['Change the Abaya from beige to black.', 'COLOUR'],
    ['Add silver sequins around the existing chest embroidery.', 'EMBELLISHMENT'],
    ['Replace the chest embroidery with gold zari work', 'EMBROIDERY'],
    ['Make the sleeves wider.', 'SLEEVES'],
    ['Add a pearl band to the cuffs', 'EMBELLISHMENT'],
    ['Make the cuffs narrower', 'CUFFS'],
    ['Put her in a three-quarter pose.', 'POSE'],
    ['Change the background to a beige studio', 'BACKGROUND'],
    ['Make the abaya floor-length', 'LENGTH'],
    ['Change to a V-neck', 'NECKLINE'],
    ['Add hidden buttons down the front', 'CLOSURE'],
    ['Make it look nicer', 'OTHER'],
  ])('%s → %s', (text, type) => {
    expect(classifyEdit(text)).toBe(type);
  });
});

describe('prompt builder', () => {
  it('keeps everything but the requested change', () => {
    const fabric = buildEditPrompt('FABRIC', 'Change fabric to matte black Nida.');
    expect(fabric).toMatch(/^Edit this image\. Change fabric to matte black Nida\. Change ONLY that\./);
    expect(fabric).toContain('embroidery and embellishments');
    expect(fabric).not.toMatch(/Keep the abaya's[^.]*\bfabric\b/);
    const embroidery = buildEditPrompt('EMBROIDERY', 'Add gold zari to the chest');
    expect(embroidery).toContain('keep all other embroidery exactly where it is');
    expect(embroidery).toMatch(/Keep the abaya's[^.]*\bfabric\b/);
  });

  it('builds master, pose and model prompts', () => {
    expect(buildMasterPrompt('black crepe, silver chest vine')).toContain('The abaya: black crepe, silver chest vine.');
    expect(buildPosePrompt('BACK', true)).toContain('must match the reference image');
    expect(buildPosePrompt('BACK', false)).toContain('do not invent embroidery');
    expect(buildPosePrompt('SIDE', false)).toContain('Change ONLY the pose');
    const model = buildModelPrompt(aiModelAttributes.parse({}), 'soft-beige-studio');
    expect(model).toContain('Middle Eastern, Arabian Gulf appearance');
    expect(model).toContain('warm olive, light wheatish skin');
    expect(model).toContain('complements the abaya (a tone or accent from it, not the same colour as the abaya), covering all her hair');
    expect(model).toContain('Soft beige seamless studio backdrop');
    // The default setting is Arabian.
    expect(buildModelPrompt(aiModelAttributes.parse({}), 'unknown')).toContain('Arabian courtyard');
  });

  it('adds fixes for the rejection reasons, once each', () => {
    const p = retryPrompt('Base.', ['EMBROIDERY_CHANGED', 'EMBROIDERY_CHANGED', 'OTHER']);
    expect(p.match(/Preserve the existing embroidery/g)).toHaveLength(1);
    expect(retryPrompt('Base.', ['OTHER'])).toBe('Base.');
  });
});

describe('house look and variety', () => {
  it('gives every model a different face within the warm olive range', () => {
    const a = varietyTraits(1);
    const b = varietyTraits(2);
    expect(varietyTraits(1)).toEqual(a);
    expect(a.features).not.toBe(b.features);
    for (let seed = 1; seed < 50; seed++) {
      const t = varietyTraits(seed);
      expect(t.age).toBeGreaterThanOrEqual(22);
      expect(t.age).toBeLessThanOrEqual(35);
      expect(t.skinTone).toMatch(/olive|wheatish/);
    }
    const faces = new Set(Array.from({ length: 30 }, (_, i) => varietyTraits(i + 1).features));
    expect(faces.size).toBeGreaterThan(25);
  });

  it('offers only shayla head coverings and Arabian settings first', () => {
    expect(SHAYLA_OPTIONS.every((o) => o.includes('shayla'))).toBe(true);
    expect(CATALOG_BACKGROUNDS[0]!.group).toBe('arabian');
    expect(CATALOG_BACKGROUNDS.filter((b) => b.group === 'arabian')).toHaveLength(7);
  });

  it('adds the designer direction on top of the garment rules', () => {
    const master = buildMasterPrompt(undefined, 'soft evening light, walking towards camera.');
    expect(master).toContain('Designer direction: soft evening light, walking towards camera.');
    expect(master.endsWith('The abaya itself must still match the product photo exactly.')).toBe(true);
    expect(buildMasterPrompt()).not.toContain('Designer direction');
    expect(buildPosePrompt('SIDE', false, { direction: 'hand on hip' })).toContain('Designer direction: hand on hip.');
  });
});

describe('poses for the abaya design', () => {
  it('suggests poses that show what makes the abaya special', () => {
    expect(suggestPoses({ style: 'OPEN_FRONT' })).toEqual(['FRONT_2', 'THREE_QUARTER', 'EDITORIAL']);
    expect(suggestPoses({ style: 'KIMONO' })).toEqual(['FRONT_2', 'THREE_QUARTER', 'SIDE']);
    expect(suggestPoses({ style: 'CLOSED', embroidery: ['BACK'] })).toEqual(['FRONT_2', 'THREE_QUARTER', 'BACK']);
    expect(suggestPoses({ style: 'BUTTERFLY', embroidery: ['SLEEVES'] })).toEqual(['FRONT_2', 'THREE_QUARTER', 'SIDE', 'EDITORIAL']);
    expect(suggestPoses()).toEqual(['FRONT_2', 'THREE_QUARTER', 'BACK']);
  });

  it('phrases each pose for the style and embroidery', () => {
    expect(poseText('FRONT_2', { style: 'OPEN_FRONT' })).toContain('open front gently parts');
    expect(poseText('FRONT_2', { style: 'BUTTERFLY' })).toContain('butterfly wings');
    expect(poseText('FRONT_2', { style: 'KIMONO' })).toContain('wide sleeves');
    expect(poseText('FRONT', { embroidery: ['CHEST'] })).toContain('embroidery is fully visible');
    expect(poseText('BACK', { embroidery: ['BACK'] })).toContain('back embroidery');
    expect(buildPosePrompt('FRONT_2', false, { style: 'OPEN_FRONT' })).toContain('Change ONLY the pose to a slow walking step');
  });
});

describe('one step (product-to-model)', () => {
  const attributes = aiModelAttributes.parse({ features: 'soft oval face, honey-brown eyes' });

  it('describes a new face, the shayla, the abaya rules and the setting in one prompt', () => {
    const p = buildOneStepPrompt({ attributes, backgroundId: 'desert-golden-hour', style: 'OPEN_FRONT', garmentDescription: 'light blue crepe' });
    expect(p).toContain('Middle Eastern, Arabian Gulf appearance');
    expect(p).toContain('soft oval face, honey-brown eyes');
    expect(p).toContain('covering all her hair');
    expect(p).toContain('She wears the abaya from the product image exactly');
    expect(p).toContain('The abaya: light blue crepe.');
    expect(p).toContain('open front gently parts');
    expect(p).toContain('Arabian desert dunes at golden hour');
    // A closed abaya's master is a clean front pose.
    expect(buildOneStepPrompt({ attributes, style: 'CLOSED', embroidery: ['CHEST'] })).toContain('embroidery is fully visible');
  });

  it('uses the face and background photos when given, and adds the direction last', () => {
    const p = buildOneStepPrompt({ attributes, hasFacePhoto: true, hasBackgroundPhoto: true, direction: 'soft breeze' });
    expect(p).toContain('the woman from the face reference');
    expect(p).not.toContain('honey-brown eyes');
    expect(p).toContain('the background from the background reference');
    expect(p.endsWith('The abaya itself must still match the product image exactly.')).toBe(true);
  });

  it('keeps a real height and body type instead of runway proportions', () => {
    const p = buildOneStepPrompt({ attributes: aiModelAttributes.parse({ heightCm: 152, bodyType: 'curvy, fuller figure' }), hasFacePhoto: true });
    expect(p).toContain('the woman from the face reference');
    expect(p).toContain('curvy, fuller figure');
    expect(p).toContain('She is about 152 cm tall (petite)');
    expect(p).toContain('do not make her taller');
    expect(heightText(168)).toContain('(tall)');
    expect(heightText(160)).toContain('(average height)');
    expect(heightText()).toBe('');
    expect(aiModelAttributes.safeParse({ heightCm: 250 }).success).toBe(false);
  });

  it('needs consent for a face photo, and costs 3 more credits with one', () => {
    const base = { abayaPath: 'catalog-inputs/a.jpg', attributes: {} };
    expect(createOneStepBody.safeParse(base).success).toBe(true);
    expect(createOneStepBody.safeParse({ ...base, facePath: 'catalog-inputs/f.jpg' }).success).toBe(false);
    expect(createOneStepBody.safeParse({ ...base, facePath: 'catalog-inputs/f.jpg', faceConsent: true }).success).toBe(true);
    expect(creditCost({ kind: 'PRODUCT_TO_MODEL', resolution: '2k', mode: 'balanced', numImages: 1 })).toBe(3);
    expect(creditCost({ kind: 'PRODUCT_TO_MODEL', resolution: '2k', mode: 'balanced', numImages: 2, faceReference: true })).toBe(12);
  });
});

describe('sketch and design references', () => {
  const refs = [
    { type: 'FABRIC_COLOUR' as const, note: 'matte black nida.' },
    { type: 'EMBROIDERY' as const, note: 'silver zari vine' },
    { type: 'OTHER' as const },
  ];

  it('turns a sketch into a real abaya and lists the reference notes', () => {
    const p = buildOneStepPrompt({ attributes: aiModelAttributes.parse({}), sketch: true, references: refs });
    expect(p).toContain("The product image is the designer's sketch");
    expect(p).toContain('not a drawing');
    expect(p).toContain('Design details: Fabric and colour: matte black nida; Embroidery: silver zari vine.');
    const m = buildMasterPrompt('', undefined, { sketch: true, references: refs });
    expect(m).toContain('Design details:');
    expect(buildMasterPrompt('x')).not.toContain('sketch');
  });

  it('applies each reference as a focused edit', () => {
    expect(referenceEdit(refs[0]!)).toEqual({
      editType: 'FABRIC',
      instruction: 'Change the abaya fabric and colour to match the fabric in the reference image (matte black nida)',
    });
    expect(referenceEdit({ type: 'FABRIC_PATTERN' }).instruction).toContain('print or pattern');
    expect(referenceEdit({ type: 'LACE_TRIM' }).editType).toBe('EMBELLISHMENT');
    expect(buildEditPrompt(referenceEdit(refs[1]!).editType, referenceEdit(refs[1]!).instruction)).toContain('keep all other embroidery');
  });

  it('applies references base fabric first, then print, then details', () => {
    const order = orderReferences([{ type: 'OTHER' }, { type: 'EMBROIDERY' }, { type: 'FABRIC_PATTERN' }, { type: 'FABRIC_COLOUR' }] as const);
    expect(order.map((r) => r.type)).toEqual(['FABRIC_COLOUR', 'FABRIC_PATTERN', 'EMBROIDERY', 'OTHER']);
  });

  it('allows up to six references', () => {
    const base = { abayaPath: 'catalog-inputs/a.jpg', attributes: {} };
    const ref = { type: 'OTHER', path: 'catalog-inputs/r.jpg' };
    expect(createOneStepBody.safeParse({ ...base, sketch: true, references: Array(6).fill(ref) }).success).toBe(true);
    expect(createOneStepBody.safeParse({ ...base, references: Array(7).fill(ref) }).success).toBe(false);
  });
});

describe('styling: scale, handbag, shoes, coordinated shayla', () => {
  const attributes = aiModelAttributes.parse({});

  it('defaults to a coordinated shayla that is not the same colour as the abaya', () => {
    expect(attributes.hijab).toContain('complements the abaya');
    expect(attributes.hijab).toContain('not the same colour');
  });

  it('places her at a realistic size in the scene with a small bag and flats by default', () => {
    const p = buildOneStepPrompt({ attributes, backgroundId: 'modern-gulf' });
    expect(p).toContain('about 5–6 m away');
    expect(p).toContain('realistic size for the scene');
    expect(p).toContain('natural contact shadows');
    expect(p).toContain('small structured mini top-handle bag');
    expect(p).toContain('never covers the embroidery or the front opening');
    expect(p).toContain('pointed-toe leather flats');
    expect(p).not.toContain('nude flat shoes');
  });

  it('follows the chosen framing, bag and shoes', () => {
    const p = buildOneStepPrompt({ attributes, styling: { framing: 'WIDE', handbag: 'NONE', shoes: 'EMBELLISHED_SANDALS' } });
    expect(p).toContain('Wide environmental shot');
    expect(p).toContain('No handbag.');
    expect(p).toContain('flat sandals with delicate embellishment');
    expect(framingText({ framing: 'CLOSE' })).toContain('Close full-body');
    expect(accessoriesText({ handbag: 'CLUTCH' })).toContain('small elegant clutch');
  });

  it('keeps the accessories and scale in every pose, and fixes them on retry', () => {
    expect(buildPosePrompt('SIDE', false)).toContain('handbag, shoes, accessories or proportions, or her size in the scene');
    expect(retryPrompt('Base.', ['SCALE_WRONG'])).toContain('realistic size for the scene');
    expect(retryPrompt('Base.', ['ACCESSORIES_WRONG'])).toContain('never covering the abaya');
    expect(createOneStepBody.parse({ abayaPath: 'catalog-inputs/a.jpg', attributes: {} }).styling).toEqual({
      framing: 'WITH_SETTING',
      handbag: 'MINI_TOP_HANDLE',
      shoes: 'POINTED_FLATS',
      accessories: [],
    });
  });
});

describe('custom bag, shoes and accessories', () => {
  const attributes = aiModelAttributes.parse({});

  it('uses the designer\'s own bag and shoes, still under the house rules', () => {
    const t = accessoriesText({ handbag: 'CUSTOM', handbagCustom: 'small pearl-beaded mini bag in ivory.', shoes: 'CUSTOM', shoesCustom: ' gold embellished  khussa flats ' });
    expect(t).toContain('She carries a small pearl-beaded mini bag in ivory, kept small and held at her side');
    expect(t).toContain('never covers the embroidery');
    expect(t).toContain('She wears gold embellished khussa flats; only the toes show');
    expect(catalogStyling.safeParse({ handbag: 'CUSTOM' }).success).toBe(false);
    expect(catalogStyling.safeParse({ shoes: 'CUSTOM', shoesCustom: '' }).success).toBe(false);
    // The live preview never throws while "Custom…" is still empty.
    expect(() => accessoriesText({ handbag: 'CUSTOM', shoes: 'CUSTOM' })).not.toThrow();
    expect(accessoriesText({ handbag: 'CUSTOM', shoes: 'CUSTOM' })).toContain('No handbag.');
  });

  it('adds accessories and drops "no jewellery" only when jewellery is chosen', () => {
    const none = buildOneStepPrompt({ attributes });
    expect(none).toContain('No jewellery, no text, no logo.');
    expect(none).not.toContain('Accessories:');
    const some = buildOneStepPrompt({ attributes, styling: { accessories: ['EARRINGS', 'SUNGLASSES'], accessoriesCustom: 'thin gold chain belt' } });
    expect(some).toContain('Accessories: delicate earrings just visible at the edge of the shayla, sunglasses held in one hand, thin gold chain belt;');
    expect(some).toContain('never covering or changing it');
    expect(some).not.toContain('No jewellery');
    expect(hasJewellery({ accessories: ['SUNGLASSES'] })).toBe(false);
    expect(buildPosePrompt('SIDE', false)).toContain('shoes, accessories or proportions');
  });

  it('tidies what the designer typed', () => {
    expect(tidy('short .')).toBe('short');
    expect(tidy('  curvy ,  fuller   figure. ')).toBe('curvy, fuller figure');
    const p = buildOneStepPrompt({ attributes: aiModelAttributes.parse({ bodyType: 'short ' }), hasFacePhoto: true });
    expect(p).toContain('natural texture, short. She');
  });
});

describe('photoshoot shots', () => {
  it('turns the image count into shots of the same model', () => {
    expect(photoshootShots(1)).toEqual([]);
    expect(photoshootShots(2)).toEqual(['CLOSE_UP']);
    expect(photoshootShots(3)).toEqual(['LEFT_ANGLE', 'RIGHT_ANGLE']);
    expect(photoshootShots(4)).toEqual(['CLOSE_UP', 'LEFT_ANGLE', 'RIGHT_ANGLE']);
  });

  it('frames the close-up from the waist up and keeps the angles full body', () => {
    const close = buildPosePrompt('CLOSE_UP', false);
    expect(close).toContain('Change ONLY the pose and framing to a waist-up fashion portrait');
    expect(close).toContain('Waist-up framing');
    expect(close).not.toContain('Full body head to toe');
    const left = buildPosePrompt('LEFT_ANGLE', false);
    expect(left).toContain('turned about 45 degrees to her left');
    expect(left).toContain('Full body head to toe');
    expect(buildPosePrompt('RIGHT_ANGLE', false)).toContain('to her right');
  });
});

describe('review', () => {
  it('needs a reason to reject and averages scores', () => {
    expect(reviewCatalogImageBody.safeParse({ review: 'REJECTED' }).success).toBe(false);
    expect(reviewCatalogImageBody.safeParse({ review: 'REJECTED', reasons: ['FACE_WRONG'] }).success).toBe(true);
    expect(reviewCatalogImageBody.safeParse({ review: 'APPROVED', scores: { garmentFidelity: 11 } }).success).toBe(false);
    expect(overallScore({ garmentFidelity: 9, fabricFidelity: 8 })).toBe(8.5);
    expect(overallScore({})).toBeNull();
  });
});
