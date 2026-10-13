/** "Eid Lace Butterfly Abaya!" → "eid-lace-butterfly-abaya" (matches the contracts `slug` rule). */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '');
  return slug.length >= 3 ? slug : `design-${slug}`.replace(/-+$/g, '');
}

/** Append -2, -3 ... until `isTaken` says the slug is free. */
export async function uniqueSlug(base: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
  let candidate = base;
  for (let n = 2; await isTaken(candidate); n += 1) candidate = `${base}-${n}`;
  return candidate;
}
