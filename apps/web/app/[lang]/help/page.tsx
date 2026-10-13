import { Mail } from 'lucide-react';
import type { Metadata } from 'next';
import { Link } from '@/components/i18n/navigation';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { EyebrowStar } from '@/components/ornament/geometric';
import { alternatesFor, stringsFor } from '@/content/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { locale, strings: { help } } = await stringsFor(params);
  return {
  title: help.metaTitle,
  description: help.metaDescription,
  alternates: alternatesFor(locale, '/help'),
  openGraph: { title: help.metaTitle, description: help.metaDescription },
};
}

export default async function HelpPage({ params }: { params: Promise<{ lang: string }> }) {
  const { footer, help } = (await stringsFor(params)).strings;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: help.sections.flatMap((s) =>
      s.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    ),
  };
  return (
    <div className="container max-w-3xl py-10 sm:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <EyebrowStar className="mb-3 size-5" />
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">{help.title}</h1>
      <p className="mt-3 text-neutral-600">{help.intro}</p>

      <nav aria-label={help.title} className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 scrollbar-none">
        {help.sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="flex min-h-10 shrink-0 items-center rounded-full border border-border px-4 text-sm hover:border-neutral-400">
            {s.title}
          </a>
        ))}
      </nav>

      {help.sections.map((s) => (
        <section key={s.id} id={s.id} className="mt-10 scroll-mt-24">
          <h2 className="font-display text-2xl font-semibold">{s.title}</h2>
          <Accordion type="multiple" className="mt-2">
            {s.faqs.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}

      <section id="contact" className="mt-12 scroll-mt-24 rounded-xl bg-sand-50 p-6">
        <h2 className="font-display text-2xl font-semibold">{help.contactTitle}</h2>
        <p className="mt-2 text-sm text-neutral-600">{help.contactBody}</p>
        <a href={`mailto:${help.contactEmail}`} className="mt-4 inline-flex min-h-11 items-center gap-2 font-medium text-accent-800 underline underline-offset-2">
          <Mail className="size-4" aria-hidden />
          {help.contactEmail}
        </a>
        <p className="text-sm text-muted">{help.contactHours}</p>
        <p className="mt-4 text-sm">
          <Link href="/policies/returns-and-alterations" className="text-accent-700 underline underline-offset-2">
            {footer.returns}
          </Link>
          {' · '}
          <Link href="/policies/grievance" className="text-accent-700 underline underline-offset-2">
            {footer.grievance}
          </Link>
        </p>
      </section>
    </div>
  );
}
