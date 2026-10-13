'use client';

import { CalendarCheck, Download, IndianRupee } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { formatDateTime, formatMoney, initials } from '@/lib/format';
import { useAdminDownloads, useDownloadsSummary } from '@/lib/queries/downloads';

const t = strings.downloads;

/** HD design downloads sold (separate from abaya orders). */
export default function DownloadsPage() {
  const me = useCurrentUser();
  const summary = useDownloadsSummary();
  const list = useAdminDownloads();
  if (!me.can('viewDownloads')) return <ForbiddenState />;
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label={t.paidCount} value={summary.data?.paidCount ?? '—'} icon={<Download className="size-4" />} tone="accent" />
        <StatTile label={t.revenue} value={summary.data ? formatMoney(summary.data.revenueInPaise) : '—'} icon={<IndianRupee className="size-4" />} />
        <StatTile label={t.today} value={summary.data?.paidToday ?? '—'} icon={<CalendarCheck className="size-4" />} />
      </div>

      <Card className="overflow-hidden">
        {list.isPending ? (
          <TableSkeleton />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Download className="size-5" />} title={t.empty} body={t.emptyHint} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>{t.colDesign}</TH>
                  <TH>{t.colCustomer}</TH>
                  <TH className="text-right">{t.colPrice}</TH>
                  <TH>{t.colPaid}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/designs/${r.design.id}`} className="font-medium hover:text-accent-700 hover:underline">
                        {r.design.name}
                      </Link>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-50 text-[11px] font-semibold text-accent-800">
                          {initials(r.customer.name ?? r.customer.email)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate">{r.customer.name ?? '—'}</span>
                          <span className="block truncate text-xs text-muted">{r.customer.email}</span>
                        </span>
                      </div>
                    </TD>
                    <TD className="text-right tabular-nums">{formatMoney(r.priceInPaise)}</TD>
                    <TD className="whitespace-nowrap text-muted">{formatDateTime(r.paidAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        {list.hasNextPage ? (
          <div className="border-t border-border p-3 text-center">
            <Button variant="secondary" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              {t.loadMore}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
