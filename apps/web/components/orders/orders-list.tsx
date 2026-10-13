'use client';


import { ChevronRight, Package } from 'lucide-react';
import { Link } from '@/components/i18n/navigation';
import { DesignImage } from '@/components/design/design-image';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, Skeleton } from '@/components/ui/misc';
import { useStrings } from '@/components/i18n/locale-provider';
import { errorMessage } from '@/lib/api-client';
import { useOrders } from '@/lib/queries/orders';
import { formatDate } from '@/lib/utils';
import { OrderStatusChip } from './status-chip';
import { useMoney } from '@/lib/currency';

export function OrdersList() {
  const money = useMoney();
  const { catalog, common, orders: t } = useStrings();
  const query = useOrders();
  const list = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="container max-w-3xl py-10 sm:py-14">
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">{t.title}</h1>
      <div className="mt-8">
        {query.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : query.isError ? (
          <Alert tone="danger" title={errorMessage(query.error)} action={<Button size="sm" variant="secondary" onClick={() => void query.refetch()}>{common.retry}</Button>} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Package className="size-5" aria-hidden />}
            title={t.empty}
            action={
              <Button asChild>
                <Link href="/abayas">{t.emptyCta}</Link>
              </Button>
            }
          />
        ) : (
          <>
            <ul className="space-y-3">
              {list.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/orders/${encodeURIComponent(o.orderNumber)}`}
                    className="flex items-center gap-4 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:p-4"
                  >
                    <DesignImage src={o.primaryImageUrl} alt="" name={o.orderNumber.slice(-1)} sizes="80px" className="aspect-[3/4] w-16 shrink-0 rounded-md sm:w-20" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{t.orderNumber(o.orderNumber)}</p>
                        <OrderStatusChip status={o.status} stage={o.headlineStage} />
                      </div>
                      <p className="mt-1 text-sm text-neutral-600">
                        {o.placedAt ? t.placedOn(formatDate(o.placedAt)) : t.createdOn(formatDate(o.createdAt))} · {t.items(o.itemCount)}
                      </p>
                      <p className="mt-0.5 text-sm font-medium tabular-nums">{money(o.totalInPaise)}</p>
                    </div>
                    <ChevronRight className="rtl:-scale-x-100 size-5 shrink-0 text-neutral-400" aria-hidden />
                    <span className="sr-only">{t.view}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {query.hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                  {catalog.loadMore}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
