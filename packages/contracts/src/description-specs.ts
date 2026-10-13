/**
 * Designers often paste a product description as "Key : Value" pairs on one line
 * ("Length : Floor Length Fabric : Jacquard Color : Black ..."). The product page shows those as
 * a tidy details list instead of a run-on paragraph. Anything that does not read cleanly as
 * pairs returns null, and the page shows the description as written.
 */
export interface DescriptionSpec {
  label: string;
  value: string;
}

/** Labels recognised inside a one-line description, longest first wins (e.g. "Scarf Fabric" over "Fabric"). */
const KNOWN_LABELS = [
  'Belt Included',
  'Bust',
  'Care',
  'Closure',
  'Color',
  'Colour',
  'Embellishment',
  'Embroidery',
  'Fabric',
  'Fit',
  'Garment Care',
  'Hijab Included',
  'Hijab',
  'Includes',
  'Inner Included',
  'Length',
  'Lining',
  'Model Height',
  'Model Size',
  'Neckline',
  'Occasion',
  'Pattern',
  'Scarf Fabric',
  'Scarf Included',
  'Scarf Size',
  'Scarf',
  'Season',
  'Set Includes',
  'Shayla Included',
  'Size',
  'Sleeve Type',
  'Sleeve',
  'Sleeves',
  'Style',
  'Suitable for',
  'Transparency',
  'Versatile for Occasion',
  'Wash Care',
  'Work',
].sort((a, b) => b.length - a.length);

const MAX_LABEL_WORDS = 4;
const MIN_PAIRS = 2;

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const words = (s: string) => s.split(' ').filter(Boolean).length;

export function parseDescriptionSpecs(description: string | null | undefined): DescriptionSpec[] | null {
  const text = (description ?? '').trim();
  if (!text) return null;
  return byLines(text) ?? inline(text);
}

/** One "Key: Value" per line. */
function byLines(text: string): DescriptionSpec[] | null {
  const lines = text.split(/\r?\n/).map(tidy).filter(Boolean);
  if (lines.length < MIN_PAIRS) return null;
  const specs: DescriptionSpec[] = [];
  for (const line of lines) {
    const m = /^([^:]{1,40}?)\s*:\s*(.+)$/.exec(line);
    if (!m || words(m[1]!) > MAX_LABEL_WORDS) return null;
    specs.push({ label: capitalise(tidy(m[1]!)), value: tidy(m[2]!) });
  }
  return specs;
}

/** All pairs on one line: each value runs until the next known label. */
function inline(text: string): DescriptionSpec[] | null {
  const parts = tidy(text).split(/\s*:\s+|\s+:\s*/);
  if (parts.length < MIN_PAIRS + 1) return null;
  const first = parts[0]!;
  if (words(first) > MAX_LABEL_WORDS) return null;
  const specs: DescriptionSpec[] = [];
  let label = first;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    if (i === parts.length - 1) {
      specs.push({ label: capitalise(label), value: part });
      break;
    }
    const lower = part.toLowerCase();
    const next = KNOWN_LABELS.find((k) => lower.endsWith(` ${k.toLowerCase()}`));
    if (!next) return null;
    const value = tidy(part.slice(0, part.length - next.length));
    if (!value) return null;
    specs.push({ label: capitalise(label), value });
    label = part.slice(part.length - next.length);
  }
  return specs.length >= MIN_PAIRS ? specs : null;
}
