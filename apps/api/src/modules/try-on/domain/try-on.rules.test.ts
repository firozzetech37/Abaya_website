import { describe, expect, it } from 'vitest';
import { changesToShow, checkQuestion, choiceLines, customerError, fashnInputs, judge, previewPlan, sourceImage, startOfIndiaDay, type SubjectOption, tryOnPlan } from './try-on.rules';

const options: SubjectOption[] = [
  { id: 'nida', groupCode: 'FABRIC', name: 'Nida', description: null, isDefault: true },
  { id: 'crepe', groupCode: 'FABRIC', name: 'Crepe', description: null, isDefault: false },
  { id: 'black', groupCode: 'COLOUR', name: 'Black', description: null, isDefault: true },
  { id: 'navy', groupCode: 'COLOUR', name: 'Navy', description: null, isDefault: false },
  { id: 'belt', groupCode: 'ADD_ON', name: 'Matching belt', description: null, isDefault: false },
];
const images = [
  { storagePath: 'main.jpg', colourValueId: null },
  { storagePath: 'navy.jpg', colourValueId: 'navy' },
];

describe('website AI preview rules', () => {
  it('starts from the chosen colour’s own photo, else the main photo', () => {
    expect(sourceImage(images, options, 'navy')).toEqual({ image: images[1], showsColour: true });
    expect(sourceImage(images, options, 'black')).toEqual({ image: images[0], showsColour: true });
    expect(sourceImage([images[0]!], options, 'navy')).toEqual({ image: images[0], showsColour: false });
    expect(sourceImage([], options, null)).toBeNull();
  });

  it('asks only for what the photo does not already show', () => {
    expect(changesToShow(options, ['nida', 'black'], true)).toEqual([]);
    expect(changesToShow(options, ['crepe', 'navy', 'belt'], true).map((c) => c.name)).toEqual(['Crepe', 'Matching belt']);
    expect(changesToShow(options, ['crepe', 'navy'], false).map((c) => c.name)).toEqual(['Crepe', 'Navy']);
  });

  it('labels choices and builds 1K fast FASHN requests', () => {
    expect(choiceLines(options, ['crepe', 'belt'])).toEqual(['Fabric: Crepe', 'Add-on: Matching belt']);
    expect(fashnInputs('edit', 'p', { source: 's' })).toMatchObject({ image: 's', prompt: 'p', resolution: '1k', generation_mode: 'fast', num_images: 1 });
    // Later edit steps start from the previous step's picture.
    expect(fashnInputs('edit', 'p', { source: 's', working: 'w' })).toMatchObject({ image: 'w' });
    expect(fashnInputs('tryon-max', 'p', { source: 's', person: 'me' })).toMatchObject({ product_image: 's', model_image: 'me' });
    // "A model like me": the model made by the previous step wears the abaya.
    expect(fashnInputs('tryon-max', 'p', { source: 's', working: 'model' })).toMatchObject({ product_image: 's', model_image: 'model' });
    // Try-on pictures come back as JPEG (faster); previews stay PNG.
    expect(fashnInputs('tryon-max', 'p', { source: 's', person: 'me' }).output_format).toBe('jpeg');
    expect(fashnInputs('model-create', 'p', { source: 's' }).output_format).toBe('jpeg');
    expect(fashnInputs('edit', 'p', { source: 's' }).output_format).toBe('png');
    expect(fashnInputs('model-create', 'p', { source: 's' })).toEqual({ prompt: 'p', aspect_ratio: '4:5', resolution: '1k', generation_mode: 'fast', num_images: 1, output_format: 'jpeg' });
    expect(() => fashnInputs('tryon-max', 'p', { source: 's' })).toThrow();
  });

  it('never shows provider text, and counts days in India time', () => {
    expect(customerError('ContentModerationError')).toMatch(/different photo/);
    expect(customerError('Anything')).toMatch(/try again/);
    expect(startOfIndiaDay(new Date('2026-10-08T20:00:00Z')).toISOString()).toBe('2026-10-08T18:30:00.000Z');
  });

  it('plans with the chosen colour naming the accessories', () => {
    const plan = previewPlan('BUTTERFLY', options, ['navy', 'belt'], changesToShow(options, ['navy', 'belt'], false));
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[1]).toContain('same navy abaya fabric');
  });

  it('passes a preview only when silhouette, embroidery and colour are right', () => {
    const checks = [
      { text: 'Silhouette kept.', critical: true },
      { text: 'Embroidery kept.', critical: true },
      { text: 'Belt shown.', critical: false },
      { text: 'Sleeves bell.', critical: false },
    ];
    const ok = { ok: true, problem: '' };
    expect(judge(checks, [ok, ok, ok, ok]).pass).toBe(true);
    expect(judge(checks, [ok, ok, { ok: false, problem: 'no belt' }, ok])).toEqual({ pass: true, problems: ['Belt shown: no belt.'] });
    expect(judge(checks, [ok, { ok: false, problem: 'panels missing' }, ok, ok]).pass).toBe(false);
    expect(judge(checks, [ok, ok, { ok: false, problem: 'a' }, { ok: false, problem: 'b' }]).pass).toBe(false);
    expect(checkQuestion(checks)).toContain('4. Sleeves bell.');
  });
});

describe('try-on plans', () => {
  it('uses one tryon-max step on her photo', () => {
    expect(tryOnPlan('OPEN_FRONT')).toMatchObject({ endpoints: ['tryon-max'] });
    expect(tryOnPlan('OPEN_FRONT').steps[0]).toContain('Dress the woman in her photo');
  });

  it('adds the made-to-measure length and sleeves when she gives her measurements', () => {
    const plan = tryOnPlan('OPEN_FRONT', { mode: 'PHOTO', body: { heightCm: 150 } });
    expect(plan.endpoints).toEqual(['tryon-max', 'edit']);
    expect(plan.steps[1]).toContain('sleeves end exactly at her wrists');
    expect(plan.checks.some((c) => c.text.includes('same person') && c.critical)).toBe(true);
  });

  it('makes a model with her build, then dresses that model (no photo of her)', () => {
    const plan = tryOnPlan('CLOSED', { mode: 'MODEL', body: { heightCm: 168, weightKg: 85 } });
    expect(plan.endpoints).toEqual(['model-create', 'tryon-max']);
    expect(plan.steps[0]).toContain('about 168 cm tall');
    expect(plan.steps.join(' ')).not.toMatch(/\b85\b/);
    expect(plan.checks.some((c) => c.text.includes('same person'))).toBe(false);
    expect(() => tryOnPlan('CLOSED', { mode: 'MODEL' })).toThrow();
  });
});
