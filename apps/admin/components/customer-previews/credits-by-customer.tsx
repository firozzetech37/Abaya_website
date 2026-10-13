'use client';

import type { FashnUsageUserDto } from '@abaya/contracts';
import { ArrowDown, ArrowRight, ArrowUp, Coins } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ErrorState, TableSkeleton } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { strings } from '@/content/strings';
import { currentRange, nextSort, type Sort, type SortKey, sortRows, websiteRows } from '@/lib/fashn-usage';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useFashnUsage } from '@/lib/queries/fashn-usage';
import { cn } from '@/lib/utils';

const t = strings.customerPreviews;

type Period = keyof typeof t.periods;
const PERIODS = Object.keys(t.periods) as Period[];
/** Rows shown before "Show all". */
const FIRST_ROWS = 10;

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: t.colCustomer },
  { key: 'previews', label: t.colPreviews, numeric: true },
  { key: 'tryOns', label: t.colTryOns, numeric: true },
  { key: 'websiteFailed', label: t.colFailed, numeric: true },
  { key: 'websiteRemakes', label: t.colRemakes, numeric: true },
  { key: 'websiteCredits', label: t.colCredits, numeric: true },
  { key: 'websiteLastUsedAt', label: t.colLastUsed },
];

export const customerName = (r: Pick<FashnUsageUserDto, 'name' | 'email'>) => r.name ?? r.email ?? t.deletedUser;

/**
 * Website FASHN credits per customer (previews and try-ons only; Studio jobs are on the FASHN
 * usage page). Clicking a customer filters the picture grid below to their previews.
 */
export function CreditsByCustomer({
  selectedUserId,
  onSelect,
}: {
  selectedUserId: string | null;
  onSelect: (row: FashnUsageUserDto | null) => void;
}) {
  const [period, setPeriod] = useState<Period>('today');
  const [sort, setSort] = useState<Sort>({ key: 'websiteCredits', desc: true });
  const [showAll, setShowAll] = useState(false);
  const range = useMemo(() => currentRange(period), [period]);
  const report = useFashnUsage(range);
  const rows = useMemo(() => sortRows(websiteRows(report.data?.users ?? []), sort), [report.data, sort]);
  const visible = showAll ? rows : rows.slice(0, FIRST_ROWS);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Coins className="size-4 text-accent-700" aria-hidden /> {t.byCustomerTitle}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{t.byCustomerHint}</p>
          {report.data ? (
            <p className="mt-1 text-sm font-medium text-foreground">{t.byCustomerTotal(report.data.totals.website, rows.length)}</p>
          ) : null}
        </div>
        <div role="group" aria-label={t.periodLabel} className="inline-flex shrink-0 rounded-lg border border-border bg-neutral-50 p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => {
                setPeriod(p);
                setShowAll(false);
              }}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                period === p ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground',
              )}
            >
              {t.periods[p]}
            </button>
          ))}
        </div>
      </div>

      {report.isPending ? (
        <TableSkeleton rows={3} cols={7} />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} className="m-4" />
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">{t.byCustomerEmpty}</p>
      ) : (
        <div className={cn('transition-opacity', report.isPlaceholderData && 'opacity-60')}>
          <Table>
            <THead>
              <TR>
                {COLUMNS.map((c) => (
                  <SortHeader key={c.key} column={c} sort={sort} onSort={(key) => setSort((cur) => nextSort(cur, key))} />
                ))}
              </TR>
            </THead>
            <TBody>
              {visible.map((r) => {
                const selected = r.userId === selectedUserId;
                return (
                  <TR
                    key={r.userId}
                    className={cn('cursor-pointer hover:bg-neutral-50', selected && 'bg-accent-50 hover:bg-accent-50')}
                    onClick={() => onSelect(selected ? null : r)}
                  >
                    <TD className="min-w-56">
                      <button
                        type="button"
                        aria-pressed={selected}
                        aria-label={t.showPreviewsOf(customerName(r))}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(selected ? null : r);
                        }}
                        className="block max-w-full text-left focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      >
                        <span className={cn('flex items-center gap-1.5 truncate font-medium', !r.name && !r.email && 'italic text-muted')}>
                          {customerName(r)}
                          {r.audience === 'STAFF' ? <Badge tone="indigo">{t.staffBadge}</Badge> : null}
                        </span>
                        {r.name && r.email ? <span className="block truncate text-xs text-muted">{r.email}</span> : null}
                      </button>
                    </TD>
                    <Num value={r.previews} />
                    <Num value={r.tryOns} />
                    <Num value={r.websiteFailed} tone="text-amber-700" />
                    <Num value={r.websiteRemakes} />
                    <TD className="text-right font-semibold tabular-nums text-foreground">{r.websiteCredits}</TD>
                    <TD className="whitespace-nowrap text-muted" title={r.websiteLastUsedAt ? formatDateTime(r.websiteLastUsedAt) : undefined}>
                      {r.websiteLastUsedAt ? formatRelative(r.websiteLastUsedAt) : '—'}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        {rows.length > FIRST_ROWS ? (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? t.showFewer : t.showAll(rows.length)}
          </Button>
        ) : (
          <span />
        )}
        <Link
          href="/fashn-usage"
          className="inline-flex items-center gap-1 rounded text-sm font-medium text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          {t.allUsage} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

function SortHeader({ column, sort, onSort }: { column: (typeof COLUMNS)[number]; sort: Sort; onSort: (key: SortKey) => void }) {
  const active = sort.key === column.key;
  const Arrow = sort.desc ? ArrowDown : ArrowUp;
  return (
    <TH className={cn(column.numeric && 'text-right')} aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(column.key)}
        aria-label={t.sortBy(column.label)}
        className={cn(
          'inline-flex items-center gap-1 rounded uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
          active && 'text-foreground',
        )}
      >
        {column.label}
        {active ? <Arrow className="size-3" aria-hidden /> : null}
      </button>
    </TH>
  );
}

function Num({ value, tone }: { value: number; tone?: string }) {
  return <TD className={cn('text-right tabular-nums', value === 0 ? 'text-neutral-400' : tone)}>{value}</TD>;
}
