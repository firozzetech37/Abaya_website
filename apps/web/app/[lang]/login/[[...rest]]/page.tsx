import type { Metadata } from 'next';
import { Suspense } from 'react';
import { type KeepDesign, LoginPanel } from '@/components/account/login-panel';
import { LoginShowcase } from '@/components/account/login-showcase';
import { MashrabiyaPattern } from '@/components/ornament/geometric';
import { stringsFor } from '@/content/i18n';
import { getDesign, getDesigns } from '@/lib/server-api';
import { safeNext } from '@/lib/utils';

type Search = Record<string, string | string[] | undefined>;

/** A different abaya greets each visit (a server component runs once per request, so this is stable). */
const randomStart = (n: number) => (n ? Math.floor(Math.random() * n) : 0);

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { auth } = (await stringsFor(params)).strings;
  return {
    title: auth.metaTitle,
    description: auth.subtitle,
    robots: { index: false },
  };
}

/** The design the customer was sent here from (`/abayas/<slug>` in `redirect_url`), if any. */
async function keptDesign(search: Search): Promise<KeepDesign | null> {
  const raw = search.redirect_url ?? search.next;
  const next = safeNext(typeof raw === 'string' ? raw : null, '');
  const slug = /^(?:\/ar)?\/abayas\/([^/?#]+)/.exec(next)?.[1];
  if (!slug) return null;
  const design = await getDesign(decodeURIComponent(slug));
  if (!design.ok) return null;
  return { name: design.data.name, slug: design.data.slug, imageUrl: design.data.images[0]?.url ?? null };
}

/** Catch-all so Clerk's path routing can use /login/factor-one, /login/sso-callback, /login/create/... */
export default async function LoginPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<Search> }) {
  const [, search] = await Promise.all([stringsFor(params), searchParams]);
  const [designs, keep] = await Promise.all([getDesigns({ limit: 6, sort: 'newest' }), keptDesign(search)]);
  const looks = designs.ok ? designs.data.items.filter((d) => d.primaryImageUrl) : [];
  const start = randomStart(looks.length);

  return (
    // The atelier window: a tall arched photo beside the sign-in card (above it on phones).
    <section className="relative bg-background">
      {/* Clipped in their own layer: `overflow-hidden` on the section would stop the photo sticking. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <MashrabiyaPattern size={72} className="text-accent-700/[0.05] [mask-image:radial-gradient(ellipse_70%_80%_at_70%_40%,black,transparent_85%)]" />
        <div className="absolute -end-40 -top-40 size-[520px] rounded-full bg-mauve-200/50 blur-3xl motion-safe:animate-float" />
        <div className="absolute -start-32 bottom-0 h-64 w-[45%] rounded-[100%] bg-gold-200/30 blur-3xl" />
      </div>
      <div className="container relative grid gap-8 py-6 sm:py-10 lg:min-h-[calc(100dvh-6rem)] lg:grid-cols-[1.05fr_1fr] lg:items-start lg:gap-16 lg:py-14 xl:gap-24">
        <LoginShowcase looks={looks} start={start} />
        <div className="mx-auto w-full max-w-[440px]">
          <Suspense>
            <LoginPanel keep={keep} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
