'use client';

import { BellRing, Download } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { downloadCsv } from '@/lib/fashn-usage';
import { formatDateTime } from '@/lib/format';
import { useOrderingWaitlist } from '@/lib/queries/waitlist';

const t = strings.waitlist;

const cell = (v: string | null) => {
  const s = v ?? '';
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Customers who asked to be told when ordering opens (website "Notify me"). */
export default function WaitlistPage() {
  const me = useCurrentUser();
  const list = useOrderingWaitlist();
  if (!me.can('viewWaitlist')) return <ForbiddenState />;
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  const exportCsv = () =>
    downloadCsv(
      [
        [t.colName, t.colEmail, t.colPhone, t.colJoined].join(','),
        ...rows.map((r) => [r.name, r.email, r.phone, r.joinedAt].map(cell).join(',')),
      ].join('\r\n') + '\r\n',
      'ordering-waitlist.csv',
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <Button variant="secondary" size="sm" disabled={rows.length === 0} onClick={exportCsv}>
            <Download className="size-4" aria-hidden /> {t.exportCsv}
          </Button>
        }
      />
      {list.isPending ? (
        <Card>
          <TableSkeleton cols={4} />
        </Card>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<BellRing className="size-5" />} title={t.empty} body={t.emptyHint} />
        </Card>
      ) : (
        <>
          <p className="text-sm font-medium">{t.total(total)}</p>
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TR>
                  <TH>{t.colName}</TH>
                  <TH>{t.colEmail}</TH>
                  <TH>{t.colPhone}</TH>
                  <TH>{t.colJoined}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.userId}>
                    <TD className={r.name ? 'font-medium' : 'italic text-muted'}>{r.name ?? t.noName}</TD>
                    <TD>{r.email ?? '—'}</TD>
                    <TD className="tabular-nums">{r.phone ?? '—'}</TD>
                    <TD className="whitespace-nowrap text-muted">{formatDateTime(r.joinedAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          {list.hasNextPage ? (
            <div className="text-center">
              <Button variant="secondary" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                {t.loadMore}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
