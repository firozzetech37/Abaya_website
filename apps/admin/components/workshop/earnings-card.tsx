'use client';

import { Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { strings } from '@/content/strings';
import { formatDate, formatMoney } from '@/lib/format';
import { useTailorEarnings } from '@/lib/queries/workshop';

const st = strings.workshop.stitching;

/** Stitching queue, tailors only: what is waiting to be paid and what was paid. */
export function EarningsCard() {
  const earnings = useTailorEarnings();
  if (earnings.isError) return null;
  if (earnings.isPending) return <Skeleton className="h-28 rounded-xl" />;
  const e = earnings.data;
  const totals = [
    [st.pending, e.pendingInPaise],
    [st.paidMonth, e.paidThisMonthInPaise],
    [st.paidTotal, e.paidTotalInPaise],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-accent-700" aria-hidden /> {st.earnings}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-3 gap-2">
          {totals.map(([label, paise]) => (
            <div key={label} className="rounded-lg bg-neutral-50 p-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums sm:text-lg">{formatMoney(paise)}</dd>
            </div>
          ))}
        </dl>
        {e.recent.length === 0 ? (
          <p className="text-sm text-muted">{st.noEarnings}</p>
        ) : (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-accent-700">
              {st.recent}
            </summary>
            <ul className="mt-2 divide-y divide-border text-sm">
              {e.recent.map((r, i) => (
                <li
                  key={`${r.createdAt}-${i}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 truncate">
                    {r.designName ?? '—'}
                    {r.orderNumber ? (
                      <span className="ml-1 font-mono text-xs text-muted">{r.orderNumber}</span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums">{formatMoney(r.amountInPaise)}</span>
                    <Badge tone={r.status === 'PAID' ? 'success' : 'neutral'}>
                      {r.status === 'PAID' ? `${st.paid} ${formatDate(r.paidAt)}` : st.due}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
