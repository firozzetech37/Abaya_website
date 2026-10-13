'use client';

import { Link, useSearchParams } from '@/components/i18n/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStrings } from '@/components/i18n/locale-provider';

export function CheckoutSuccess() {
  const { checkout: t } = useStrings();
  const order = useSearchParams().get('order');
  const safeOrder = order && /^[A-Z0-9-]{3,40}$/i.test(order) ? order : null;
  return (
    <div className="container flex max-w-xl flex-col items-center py-16 text-center sm:py-24">
      <span className="flex size-16 items-center justify-center rounded-full bg-accent-50 text-accent-700">
        <CheckCircle2 className="size-8" aria-hidden />
      </span>
      <h1 className="mt-6 font-display text-4xl font-semibold sm:text-5xl">{t.successTitle}</h1>
      {safeOrder && <p className="mt-3 font-medium text-accent-800">{t.successOrder(safeOrder)}</p>}
      <p className="mt-4 leading-relaxed text-neutral-600">{t.successBody}</p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        {safeOrder && (
          <Button asChild size="lg">
            <Link href={`/orders/${encodeURIComponent(safeOrder)}`}>{t.viewOrder}</Link>
          </Button>
        )}
        <Button asChild size="lg" variant="secondary">
          <Link href="/abayas">{t.continueShopping}</Link>
        </Button>
      </div>
    </div>
  );
}
