/**
 * Creates the two Supabase Storage buckets the API uses, if they are missing:
 *   designs  — PUBLIC  (published design images only)
 *   private  — PRIVATE (uploads before publishing, stage/QC photos, references)
 * Both accept JPEG/PNG/WebP; both also accept short MP4/WebM clips (home-page collection videos,
 * uploaded privately and copied to the public bucket on save). Safe to run more than once.
 *
 * Run: pnpm --filter @abaya/db storage:setup
 */
const IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
/** Home-page collection videos (docs/apps/web.md "Collections"): up to 50 MB each (Supabase's free-plan per-file ceiling). */
const VIDEOS = ['video/mp4', 'video/webm'];
const MB = 1024 * 1024;

async function main() {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || base.includes('[PROJECT-REF]')) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
  const headers = { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json' };

  const wanted = [
    { id: process.env.SUPABASE_STORAGE_BUCKET_DESIGNS || 'designs', public: true, mime: [...IMAGES, ...VIDEOS], limit: 50 * MB },
    // Private files also hold pattern files from the workshop: PDFs and CAD (DXF) exports.
    { id: process.env.SUPABASE_STORAGE_BUCKET_PRIVATE || 'private', public: false, mime: [...IMAGES, ...VIDEOS, 'application/pdf', 'application/dxf'], limit: 50 * MB },
  ];

  for (const b of wanted) {
    const body = JSON.stringify({ id: b.id, name: b.id, public: b.public, file_size_limit: b.limit, allowed_mime_types: b.mime });
    const existing = await fetch(`${base}/storage/v1/bucket/${b.id}`, { headers });
    if (existing.ok) {
      const current = (await existing.json()) as { public?: boolean };
      const res = await fetch(`${base}/storage/v1/bucket/${b.id}`, { method: 'PUT', headers, body });
      if (!res.ok) throw new Error(`Could not update bucket "${b.id}" (${res.status}).`);
      const note = current.public !== b.public ? ` (visibility corrected to ${b.public ? 'public' : 'private'})` : '';
      console.log(`✓ ${b.id} exists — ${b.public ? 'public' : 'private'}${note}`);
    } else {
      const res = await fetch(`${base}/storage/v1/bucket`, { method: 'POST', headers, body });
      if (!res.ok) throw new Error(`Could not create bucket "${b.id}" (${res.status}): ${(await res.text()).slice(0, 200)}`);
      console.log(`✓ ${b.id} created — ${b.public ? 'public' : 'private'}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
