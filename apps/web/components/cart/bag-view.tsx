'use client';


import { ShoppingBag } from 'lucide-react';
import { Link } from '@/components/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, Skeleton } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/queries/cart';
import { CartItemRow } from './cart-item-row';
import { loginHref } from '@/lib/utils';
import { useMoney } from '@/lib/currency';

export function BagView() {
  const money = useMoney();
  const { auth, bag: t, common } = useStrings();
  const { status } = useAuth();
  const cart = useCart();

  return (
    <div className="container max-w-5xl py-10 sm:py-14">
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">{t.title}</h1>
      <div className="mt-8">
        {status === 'loading' || (status === 'authenticated' && cart.isPending) ? (
          <div className="space-y-4">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : status !== 'authenticated' ? (
          <EmptyState
            icon={<ShoppingBag className="size-5" aria-hidden />}
            title={t.loginTitle}
            body={status === 'unconfigured' ? auth.notConfigured : t.loginBody}
            action={
              status === 'anonymous' && (
                <Button asChild>
                  <Link href={loginHref('/bag')}>{t.loginCta}</Link>
                </Button>
              )
            }
          />
        ) : cart.isError || !cart.data ? (
          <Alert tone="danger" title={errorMessage(cart.error)} action={<Button size="sm" variant="secondary" onClick={() => void cart.refetch()}>{common.retry}</Button>} />
        ) : cart.data.items.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="size-5" aria-hidden />}
            title={t.empty}
            action={
              <Button asChild>
                <Link href="/abayas">{t.emptyCta}</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
            <ul className="divide-y divide-border border-y border-border">
              {cart.data.items.map((item) => (
                <CartItemRow key={item.id} item={item} />
              ))}
            </ul>
            <aside className="h-fit rounded-xl border border-border bg-sand-50 p-5 lg:sticky lg:top-24">
              <dl className="flex items-baseline justify-between">
                <dt className="font-medium">{t.subtotal}</dt>
                <dd className="font-display text-3xl font-semibold tabular-nums">{money(cart.data.subtotalInPaise)}</dd>
              </dl>
              <p className="mt-2 text-xs text-muted">{t.shippingNote}</p>
              {!cart.data.canCheckout && (
                <Alert tone="warning" className="mt-4">
                  {t.cannotCheckout}
                </Alert>
              )}
              {cart.data.canCheckout ? (
                <Button asChild size="lg" className="mt-5 w-full">
                  <Link href="/checkout">{t.checkout}</Link>
                </Button>
              ) : (
                <Button size="lg" className="mt-5 w-full" disabled>
                  {t.checkout}
                </Button>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
