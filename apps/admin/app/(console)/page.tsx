'use client';

import { PRODUCTION_STAGES } from '@abaya/contracts';
import { AlarmClock, ArrowRight, CalendarClock, ClipboardCheck, IndianRupee, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { ErrorState } from '@/components/states';
import { STAGE_DOT } from '@/components/status-badges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { STAGE_LABELS, strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatMoney } from '@/lib/format';
import { useDashboard } from '@/lib/queries/me';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const me = useCurrentUser();
  const { data, isPending, isError, error, refetch } = useDashboard();
  const canOrders = me.can('viewOrders');
  const canReview = me.can('manageCatalog');

  return (
    <>
      <PageHeader title={strings.dashboard.title} subtitle={strings.dashboard.subtitle} />
      {isError ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px]" />
          ))}
          <Skeleton className="h-64 sm:col-span-2 xl:col-span-5" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile label={strings.dashboard.revenueToday} value={formatMoney(data.revenueTodayInPaise)} icon={<IndianRupee className="size-4" />} tone="accent" />
            <StatTile
              label={strings.dashboard.ordersToday}
              value={data.ordersToday}
              icon={<ShoppingBag className="size-4" />}
              href={canOrders ? '/orders' : undefined}
            />
            <StatTile
              label={strings.dashboard.dueSoon}
              value={data.itemsDueSoon}
              icon={<CalendarClock className="size-4" />}
              tone={data.itemsDueSoon > 0 ? 'warning' : 'neutral'}
              href={canOrders ? '/orders' : undefined}
            />
            <StatTile
              label={strings.dashboard.late}
              value={data.lateItems}
              icon={<AlarmClock className="size-4" />}
              tone={data.lateItems > 0 ? 'danger' : 'neutral'}
              href={canOrders ? '/orders' : undefined}
            />
            <StatTile
              label={strings.dashboard.awaitingReview}
              value={data.designsAwaitingReview}
              icon={<ClipboardCheck className="size-4" />}
              tone={data.designsAwaitingReview > 0 ? 'accent' : 'neutral'}
              href={canReview ? '/designs?status=IN_REVIEW' : undefined}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{strings.dashboard.itemsByStage}</CardTitle>
              {canOrders ? (
                <Link href="/orders" className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline">
                  {strings.dashboard.viewOrders} <ArrowRight className="size-3" aria-hidden />
                </Link>
              ) : null}
            </CardHeader>
            <CardContent>
              {Object.values(data.itemsByStage).every((n) => !n) ? (
                <p className="text-sm text-muted">{strings.dashboard.noItems}</p>
              ) : (
                <StageBars counts={data.itemsByStage} linkable={canOrders} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function StageBars({ counts, linkable }: { counts: Partial<Record<(typeof PRODUCTION_STAGES)[number], number>>; linkable: boolean }) {
  const max = Math.max(1, ...Object.values(counts).map((n) => n ?? 0));
  return (
    <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
      {PRODUCTION_STAGES.map((stage) => {
        const n = counts[stage] ?? 0;
        const row = (
          <div className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 rounded-md px-1 py-1 text-sm">
            <span className="flex items-center gap-2 text-neutral-700">
              <span className={cn('size-2 rounded-full', STAGE_DOT[stage])} aria-hidden />
              {STAGE_LABELS[stage]}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
              <span className={cn('block h-full rounded-full', STAGE_DOT[stage])} style={{ width: `${(n / max) * 100}%` }} />
            </span>
            <span className="text-right font-medium tabular-nums">{n}</span>
          </div>
        );
        return (
          <li key={stage}>
            {linkable ? (
              <Link href={`/orders?view=table&stage=${stage}`} className="block rounded-md hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
