'use client';

import { useStrings } from '@/components/i18n/locale-provider';
import { useCurrency } from '@/lib/currency';

/** The footer's reminder that AED / SAR prices are a reference and the charge is in INR; nothing in INR. */
export function CurrencyNote({ className }: { className?: string }) {
  const { currency } = useCurrency();
  const { footer } = useStrings();
  if (currency === 'INR') return null;
  return <p className={className}>{footer.currencyNote(currency)}</p>;
}
