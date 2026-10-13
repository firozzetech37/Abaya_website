import { describe, expect, it } from 'vitest';
import { parseDescriptionSpecs } from './description-specs';

describe('parseDescriptionSpecs', () => {
  it('reads a one-line "Key : Value" description as a details list', () => {
    const text =
      'Length : Floor Length Fabric : Jacquard Color : Black, Light Beige Scarf Included : Yes Scarf Fabric : Crepe Chiffon Scarf Size : 24" × 81" INCH Garment Care : Dry Clean Suitable for : All Seasons Versatile for Occasion : Special Events, Parties, and Weddings';
    expect(parseDescriptionSpecs(text)).toEqual([
      { label: 'Length', value: 'Floor Length' },
      { label: 'Fabric', value: 'Jacquard' },
      { label: 'Color', value: 'Black, Light Beige' },
      { label: 'Scarf Included', value: 'Yes' },
      { label: 'Scarf Fabric', value: 'Crepe Chiffon' },
      { label: 'Scarf Size', value: '24" × 81" INCH' },
      { label: 'Garment Care', value: 'Dry Clean' },
      { label: 'Suitable for', value: 'All Seasons' },
      { label: 'Versatile for Occasion', value: 'Special Events, Parties, and Weddings' },
    ]);
  });

  it('reads one pair per line', () => {
    expect(parseDescriptionSpecs('Fabric: Nida\nlength: Floor\n\nCare: Dry clean only')).toEqual([
      { label: 'Fabric', value: 'Nida' },
      { label: 'Length', value: 'Floor' },
      { label: 'Care', value: 'Dry clean only' },
    ]);
  });

  it('leaves ordinary prose alone', () => {
    expect(parseDescriptionSpecs('A flowing open abaya in soft nida with hand embroidery on the cuffs.')).toBeNull();
    expect(parseDescriptionSpecs('Made with love and care: every seam is finished by hand.')).toBeNull();
    expect(parseDescriptionSpecs('Fabric : Nida')).toBeNull();
    expect(parseDescriptionSpecs('Fabric : Nida with something odd : here')).toBeNull();
    expect(parseDescriptionSpecs(null)).toBeNull();
  });
});
