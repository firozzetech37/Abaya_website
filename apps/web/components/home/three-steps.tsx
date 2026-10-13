import { Package, Ruler, Shirt } from 'lucide-react';
import type { CSSProperties } from 'react';
import { EyebrowStar } from '@/components/ornament/geometric';
import { dictionaryFor, type Locale } from '@/content/i18n';

const icons = [Shirt, Ruler, Package];
const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as CSSProperties;

/** Choose · Measure · Receive: the whole idea in one strip under the hero. */
export function ThreeSteps({ locale }: { locale: Locale }) {
  const { home } = dictionaryFor(locale);
  return (
    <section aria-label={home.stepsEyebrow} className="relative border-y border-border bg-surface">
      <ol className="container grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0 rtl:sm:divide-x-reverse">
        {home.steps3.map((step, i) => {
          const Icon = icons[i] ?? Shirt;
          return (
            <li key={step.title} data-reveal style={delay(i * 120)} className="group flex items-start gap-4 py-7 sm:px-8 sm:first:ps-0 sm:last:pe-0">
              <span className="relative flex h-14 w-11 shrink-0 items-center justify-center rounded-t-full bg-mauve-100 text-rose-700 transition-colors duration-500 group-hover:bg-accent-700 group-hover:text-white">
                <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
                <span className="absolute -end-2 -top-2 flex size-6 items-center justify-center rounded-full border border-gold-300 bg-background font-display text-xs font-semibold text-accent-800">
                  {i + 1}
                </span>
              </span>
              <div>
                <p className="flex items-center gap-2 font-display text-xl font-semibold">
                  {step.title}
                  <EyebrowStar className="size-2.5 opacity-70" />
                </p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{step.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
