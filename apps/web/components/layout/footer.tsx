import { CurrencyNote } from '@/components/i18n/currency-note';
import { Link } from '@/components/i18n/navigation';
import { dictionaryFor, type Locale } from '@/content/i18n';
import { getCollections } from '@/lib/server-api';
import { ArabesqueBorder, StarPattern } from '@/components/ornament/geometric';
import { BrandMark } from './brand-mark';

/** Server component (loads the collections); the layout passes the page's language. */
export async function Footer({ locale }: { locale: Locale }) {
  const { brand, footer } = dictionaryFor(locale);
  const staticGroups = [
    {
      title: footer.helpHeading,
      links: [
        { href: '/help', label: footer.faqs },
        { href: '/help#measurements', label: footer.sizing },
        { href: '/help#contact', label: footer.contact },
      ],
    },
    {
      title: footer.policiesHeading,
      links: [
        { href: '/policies/returns-and-alterations', label: footer.returns },
        { href: '/policies/shipping', label: footer.shipping },
        { href: '/policies/privacy', label: footer.privacy },
        { href: '/policies/terms', label: footer.terms },
        { href: '/policies/grievance', label: footer.grievance },
      ],
    },
  ];
  const collections = await getCollections(locale);
  const groups = [
    {
      title: footer.shopHeading,
      links: [
        { href: '/abayas', label: footer.allAbayas },
        ...(collections.ok
          ? collections.data.map((c) => ({ href: `/collections/${c.slug}`, label: c.name }))
          : []),
      ],
    },
    ...staticGroups,
  ];
  return (
    <footer className="relative mt-20 overflow-hidden bg-accent-950 text-accent-50">
      <div aria-hidden className="bg-weave absolute inset-0" />
      <StarPattern size={84} className="text-gold-300/[0.06]" />
      {/* An arabesque vine along the top, like the band above a carved screen */}
      <div aria-hidden className="absolute inset-x-0 top-0 [mask-image:linear-gradient(90deg,transparent,black_20%,black_80%,transparent)]">
        <ArabesqueBorder className="h-5 text-gold-400/70" />
      </div>
      <div
        aria-hidden
        className="absolute -left-40 -top-40 size-[480px] rounded-full bg-accent-800/50 blur-3xl"
      />
      <div className="container relative grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Link
            href="/"
            className="inline-flex items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
          >
            <BrandMark className="h-10 text-accent-200" />
            <span className="font-display text-3xl font-semibold text-white">{brand.name}</span>
          </Link>
          <p className="mt-5 text-sm leading-relaxed text-accent-100/75">{footer.about}</p>
          <CurrencyNote className="mt-3 text-xs leading-relaxed text-accent-100/60" />
        </div>
        {groups.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent-300">
              {g.title}
            </h2>
            <ul className="mt-4 space-y-1">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="group inline-flex min-h-9 items-center gap-2 text-sm text-accent-50/80 transition-colors duration-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
                  >
                    <span
                      className="h-px w-0 bg-accent-300 transition-all duration-300 group-hover:w-3"
                      aria-hidden
                    />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      {/* Oversized wordmark, cropped by the bottom bar */}
      <p
        aria-hidden
        className="container relative select-none whitespace-nowrap font-display text-[17vw] font-semibold leading-[0.8] text-white/[0.04] lg:text-[11rem]"
      >
        {brand.name}
      </p>
      <div className="relative border-t border-white/10">
        <div className="container flex flex-col gap-1 py-6 text-xs text-accent-100/60 sm:flex-row sm:justify-between">
          <div className="space-y-1">
            <p>{footer.copyright(new Date().getFullYear())}</p>
            <p>{footer.imageNotice}</p>
          </div>
          <p>{footer.prices}</p>
        </div>
      </div>
    </footer>
  );
}
