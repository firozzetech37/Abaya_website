'use client';

import { ArrowRight } from 'lucide-react';
import { Link } from '@/components/i18n/navigation';
import { useStrings } from '@/components/i18n/locale-provider';
import { MashrabiyaPattern } from '@/components/ornament/geometric';
import { cn } from '@/lib/utils';

/** A wide boutique banner between rows of designs (alternating messages), so long pages breathe. */
export function EditorialBreak({ index, className }: { index: number; className?: string }) {
  const { catalog } = useStrings();
  const b = catalog.breaks[index % catalog.breaks.length]!;
  return (
    <aside className={cn('relative isolate overflow-hidden rounded-[2rem] bg-accent-950 px-6 py-10 text-white sm:px-12 sm:py-14', className)}>
      <MashrabiyaPattern className="-z-10 text-gold-300/[0.09]" size={64} />
      <span aria-hidden className="absolute -end-16 -top-24 -z-10 size-72 rounded-full bg-accent-700/40 blur-3xl" />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.28em] text-gold-300">{b.eyebrow}</p>
          <p className="font-display text-3xl leading-tight sm:text-4xl">{b.title}</p>
          <p className="mt-3 text-sm leading-relaxed text-white/75 sm:text-base">{b.body}</p>
        </div>
        <Link
          href={b.href}
          className="group inline-flex h-12 shrink-0 items-center gap-2 self-start rounded-full bg-gold-300 px-6 text-sm font-medium text-accent-950 transition-colors hover:bg-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200 focus-visible:ring-offset-2 focus-visible:ring-offset-accent-950 sm:self-auto"
        >
          {b.cta}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" aria-hidden />
        </Link>
      </div>
    </aside>
  );
}
