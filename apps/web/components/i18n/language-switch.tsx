'use client';

import { Languages } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { localizePath } from '@/content/i18n';
import { cn } from '@/lib/utils';
import { useLocale, useStrings } from './locale-provider';
import { usePathname } from './navigation';

/**
 * The same page in the other language (English ⇄ العربية). A full page load, so the
 * direction, fonts and text switch together.
 */
export function LanguageSwitch({ className, variant = 'header' }: { className?: string; variant?: 'header' | 'menu' }) {
  const locale = useLocale();
  const { nav } = useStrings();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const other = locale === 'ar' ? 'en' : 'ar';
  const href = `${localizePath(other, pathname)}${query ? `?${query}` : ''}`;
  return (
    <a
      href={href}
      hrefLang={other}
      lang={other}
      aria-label={nav.switchLanguageLabel}
      className={cn(
        variant === 'header'
          ? 'inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium text-neutral-800 transition-colors duration-300 hover:border-gold-400 hover:bg-gold-50 hover:text-accent-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
          : 'inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-base text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300',
        className,
      )}
    >
      <Languages className="size-4 shrink-0" aria-hidden />
      {variant === 'header' ? (
        <>
          <span className="sm:hidden">{nav.switchLanguageShort}</span>
          <span className="hidden sm:inline">{nav.switchLanguage}</span>
        </>
      ) : (
        nav.switchLanguage
      )}
    </a>
  );
}
