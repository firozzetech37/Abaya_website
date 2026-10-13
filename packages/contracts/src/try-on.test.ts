import { describe, expect, it } from 'vitest';
import { createTryOnBody, fixInstruction, isVisibleChoice, planPreview, previewKey } from './try-on';
import { bodyBuild, madeToMeasurePrompt, modelLikeMePrompt } from './try-on';

describe('customer AI preview', () => {
  it('shares a preview for the same design and options in any order', () => {
    expect(previewKey('d', ['b', 'a', 'b'])).toBe('d:a,b');
    expect(previewKey('d', [])).toBe('d:');
  });

  it('leaves out choices no photo can show', () => {
    expect(isVisibleChoice({ group: 'ADD_ON', name: 'Inner slip' })).toBe(false);
    expect(isVisibleChoice({ group: 'CLOSURE', name: 'Hidden snaps' })).toBe(false);
    expect(isVisibleChoice({ group: 'ADD_ON', name: 'Matching belt' })).toBe(true);
  });

  it('plans colour and fabric first, then the visible details, always protecting the design', () => {
    const plan = planPreview({
      style: 'BUTTERFLY',
      colourName: 'Black',
      choices: [
        { group: 'FABRIC', name: 'Chiffon (layered)' },
        { group: 'COLOUR', name: 'Maroon' },
        { group: 'SLEEVE', name: 'Bell' },
        { group: 'CLOSURE', name: 'Hidden snaps' },
        { group: 'ADD_ON', name: 'Matching belt' },
        { group: 'ADD_ON', name: 'Matching shayla' },
        { group: 'ADD_ON', name: 'Inner slip' },
      ],
    });
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toContain('base fabric colour to Maroon');
    expect(plan.steps[0]).toContain('Chiffon (layered)');
    expect(plan.steps[0]).not.toMatch(/belt|Bell/);
    for (const step of plan.steps) {
      expect(step).toContain('butterfly silhouette');
      expect(step).toContain('Keep every existing embroidery panel');
    }
    expect(plan.steps[1]).toContain('bell finish');
    expect(plan.steps[1]).toContain('replace her headscarf with a shayla in the same maroon colour');
    expect(plan.steps[1]).toContain('belt in the same maroon abaya fabric');
    expect(plan.steps.join(' ')).not.toMatch(/snaps|slip/i);
    expect(plan.checks.filter((c) => c.critical).map((c) => c.text).join(' ')).toMatch(/silhouette.*embroidery.*Maroon/s);
  });

  it('recolours the embroidery in the first step and checks it strictly', () => {
    const plan = planPreview({ style: 'BUTTERFLY', colourName: 'Black', choices: [{ group: 'PATTERN_COLOUR', name: 'Silver' }, { group: 'SLEEVE', name: 'Bell' }] });
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toContain('recolour ALL the embroidery, borders, motifs and trim to silver thread');
    expect(plan.steps[0]).toContain('Change ONLY the embroidery thread colour');
    expect(plan.steps[0]).not.toContain('and thread colour');
    expect(plan.checks.find((c) => /Silver in colour/.test(c.text))?.critical).toBe(true);
  });

  it('makes the picture from the customer’s words alone (options ignored), and keys the preview by them', () => {
    const plan = planPreview({
      style: 'CLOSED',
      colourName: 'Black',
      choices: [{ group: 'COLOUR', name: 'Navy' }, { group: 'PATTERN_COLOUR', name: 'Gold' }, { group: 'ADD_ON', name: 'Matching hijab' }],
      request: '  indigo with white embroidery,   in the desert at sunset ',
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toContain('follow the customer\'s wish exactly: "indigo with white embroidery, in the desert at sunset"');
    expect(plan.steps[0]).not.toContain('Navy');
    expect(plan.steps[0]).not.toContain('gold thread');
    expect(plan.steps[0]).toContain('Keep every existing embroidery panel');
    expect(plan.checks.some((c) => /Navy|hijab/.test(c.text))).toBe(false);
    expect(plan.checks.find((c) => /customer's wish/.test(c.text))?.critical).toBe(false);
    expect(previewKey('d', ['a'], 'On a Dubai   beach')).toBe('d:words:on a dubai beach');
    expect(previewKey('d', ['b', 'a'], '  ')).toBe('d:a,b');
  });

  it('uses one step when only details change, and none when nothing visible changes', () => {
    expect(planPreview({ style: 'CLOSED', colourName: 'Navy', choices: [{ group: 'ADD_ON', name: 'Matching hijab' }] }).steps).toHaveLength(1);
    expect(planPreview({ style: 'CLOSED', colourName: 'Navy', choices: [{ group: 'ADD_ON', name: 'Inner slip' }] }).steps).toHaveLength(0);
    expect(fixInstruction(['The embroidery was removed.'])).toContain('The embroidery was removed.');
  });

  it('try-on needs her consent', () => {
    const base = { designId: '00000000-0000-4000-8000-000000000001', personPath: 'tryon-photos/x.jpg' };
    expect(createTryOnBody.safeParse(base).success).toBe(false);
    expect(createTryOnBody.safeParse({ ...base, consent: true }).success).toBe(true);
  });
});

describe('try-on with her measurements', () => {
  it('describes her build in words, never her weight in kilograms', () => {
    expect(bodyBuild({ heightCm: 150, weightKg: 45 })).toEqual({ height: 'petite', build: 'a slim build', shape: null });
    expect(bodyBuild({ heightCm: 165, weightKg: 80, waistCm: 80, hipCm: 110 })).toMatchObject({ height: 'tall', build: 'a plus-size build', shape: 'a defined waist and full hips (hourglass)' });
    expect(bodyBuild({ heightCm: 160, hipCm: 100 })).toMatchObject({ build: 'a medium build' });
    // 66 kg at 158 cm: BMI 26.4
    const prompt = modelLikeMePrompt({ heightCm: 158, weightKg: 66, waistCm: 74, hipCm: 98 });
    expect(prompt).toContain('about 158 cm tall');
    expect(prompt).toContain('a full, curvy build');
    expect(prompt).not.toMatch(/\b66\b|\bkg\b/);
    expect(prompt).toContain('hijab');
  });

  it('tailors the length and sleeves to her, and protects everything else', () => {
    const fit = madeToMeasurePrompt({ heightCm: 150 }, 'OPEN_FRONT');
    expect(fit).toContain('just above the floor');
    expect(fit).toContain('no extra fabric pooling');
    expect(fit).toContain('sleeves end exactly at her wrists');
    expect(fit).toContain('Keep her face');
    expect(madeToMeasurePrompt({ heightCm: 170 }, 'CLOSED')).not.toContain('petite');
  });

  it('needs her photo for a photo try-on and her height for a model try-on', () => {
    const base = { designId: '2e7ec11b-684f-4451-9ed1-015483beccec', consent: true as const };
    expect(createTryOnBody.safeParse({ ...base, personPath: 'tryon-photos/x.jpg' }).success).toBe(true);
    expect(createTryOnBody.safeParse({ ...base }).success).toBe(false);
    expect(createTryOnBody.safeParse({ ...base, mode: 'MODEL' }).success).toBe(false);
    expect(createTryOnBody.safeParse({ ...base, mode: 'MODEL', body: { heightCm: 162, weightKg: 58 } }).success).toBe(true);
    expect(createTryOnBody.safeParse({ ...base, mode: 'MODEL', body: { heightCm: 300 } }).success).toBe(false);
  });
});
