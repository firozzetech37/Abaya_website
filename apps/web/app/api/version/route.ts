/**
 * The version of the website now live (the deployed git commit). Open pages poll this and reload
 * themselves when it changes, so visitors never stay on an old version after a deploy.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
