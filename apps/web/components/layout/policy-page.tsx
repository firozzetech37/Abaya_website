'use client';

import { Link } from '@/components/i18n/navigation';
import { Alert } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';
import { type PolicyPage, type PolicySlug } from '@/content/strings';


export function PolicyPageView({ slug }: { slug: PolicySlug }) {
  const { policies, policyPages, footer } = useStrings();
  const navOrder: { slug: PolicySlug; label: string }[] = [
    { slug: 'returns-and-alterations', label: footer.returns },
    { slug: 'shipping', label: footer.shipping },
    { slug: 'privacy', label: footer.privacy },
    { slug: 'terms', label: footer.terms },
    { slug: 'grievance', label: footer.grievance },
  ];
  const page: PolicyPage = policyPages[slug];
  return (
    <div className="container py-10 sm:py-14">
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <nav aria-label={policies.onThisPage} className="-mx-4 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:px-0">
          <ul className="flex gap-2 lg:sticky lg:top-24 lg:flex-col lg:gap-1">
            {navOrder.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/policies/${p.slug}`}
                  aria-current={p.slug === slug ? 'page' : undefined}
                  className="flex min-h-11 items-center whitespace-nowrap rounded-full border border-border px-4 text-sm hover:border-neutral-400 aria-[current=page]:border-primary aria-[current=page]:bg-accent-50 aria-[current=page]:text-accent-900 lg:rounded-md lg:border-transparent"
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="max-w-3xl">
          <h1 className="font-display text-4xl font-semibold sm:text-5xl">{page.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {policies.lastUpdated}: {page.updated}
          </p>
          <Alert tone="warning" className="mt-6">
            {policies.placeholderNotice}
          </Alert>
          <div className="prose-policy mt-6">
            <p>{page.intro}</p>
            {page.sections.map((s) => (
              <section key={s.heading}>
                <h2>{s.heading}</h2>
                {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
                {s.list && (
                  <ul>
                    {s.list.map((li) => (
                      <li key={li}>{li}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
