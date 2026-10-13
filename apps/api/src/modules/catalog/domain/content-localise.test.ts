import { parseDescriptionSpecs } from '@abaya/contracts';
import { describe, expect, it } from 'vitest';
import { applyTranslations, textsToTranslate } from './content-localise';

describe('localising catalog responses', () => {
  const body = {
    items: [{ name: 'Black Abaya', collectionName: 'Workwear', slug: 'black-abaya', priceInPaise: 100 }],
    optionGroups: [{ name: 'Fabric', values: [{ name: 'Nida', code: 'NIDA' }] }],
    description: 'Length : Floor Length Fabric : Jacquard Color : Black',
  };
  const keys = new Set(['name', 'collectionName', 'description']);

  it('collects the marked fields at any depth, and a "Key : Value" description pair by pair', () => {
    expect(textsToTranslate(body, keys)).toEqual(['Black Abaya', 'Workwear', 'Fabric', 'Nida', 'Length', 'Floor Length', 'Fabric', 'Jacquard', 'Color', 'Black']);
  });

  it('puts the translations back, leaves everything else, and keeps the details list readable', () => {
    const ar = new Map([
      ['Black Abaya', 'عباءة سوداء'],
      ['Fabric', 'القماش'],
      ['Nida', 'ندى'],
      ['Length', 'الطول'],
      ['Floor Length', 'حتى الأرض'],
      ['Jacquard', 'جاكار'],
      ['Color', 'اللون'],
      ['Black', 'أسود'],
    ]);
    const out = applyTranslations(body, keys, ar) as typeof body;
    expect(out.items[0]).toEqual({ name: 'عباءة سوداء', collectionName: 'Workwear', slug: 'black-abaya', priceInPaise: 100 });
    expect(out.optionGroups[0]!.values[0]).toEqual({ name: 'ندى', code: 'NIDA' });
    expect(parseDescriptionSpecs(out.description)).toEqual([
      { label: 'الطول', value: 'حتى الأرض' },
      { label: 'القماش', value: 'جاكار' },
      { label: 'اللون', value: 'أسود' },
    ]);
    // The original is not changed.
    expect(body.items[0]!.name).toBe('Black Abaya');
  });
});
