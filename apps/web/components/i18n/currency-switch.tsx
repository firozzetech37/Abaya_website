'use client';

import type { Currency } from '@abaya/contracts';
import { useCurrency, useGeoCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { useStrings } from './locale-provider';

const SYMBOL: Record<Currency, string> = { INR: '₹', AED: 'د.إ', SAR: 'ر.س' };

/**
 * Rupees ⇄ the visitor's Gulf currency for every price on the site (display only; the charge is
 * always in INR). Two options keep the header small: riyals for Saudi visitors, dirhams otherwise.
 */
export function CurrencySwitch({ className, variant = 'header' }: { className?: string; variant?: 'header' | 'menu' }) {
  const { currency, setCurrency } = useCurrency();
  const geo = useGeoCurrency();
  const local: Currency = currency !== 'INR' ? currency : geo === 'SAR' ? 'SAR' : 'AED';
  const options: Currency[] = ['INR', local];
  const { nav, currencyNames } = useStrings();
  return (
    <div
      role="radiogroup"
      aria-label={nav.currencyLabel}
      className={cn(
        'inline-flex h-9 items-center rounded-full border p-0.5 text-xs font-medium',
        variant === 'header' ? 'border-border text-neutral-700' : 'border-white/25 text-white',
        className,
      )}
    >
      {options.map((c) => {
        const on = c === currency;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setCurrency(c)}
            className={cn(
              'inline-flex h-full items-center gap-1 rounded-full px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
              on ? (variant === 'header' ? 'bg-primary text-white' : 'bg-white text-accent-900') : 'hover:bg-gold-50 hover:text-accent-900',
              variant === 'menu' && !on && 'hover:bg-white/10 hover:text-white',
            )}
          >
            <span aria-hidden>{SYMBOL[c]}</span>
            {currencyNames[c]}
          </button>
        );
      })}
    </div>
  );
}
