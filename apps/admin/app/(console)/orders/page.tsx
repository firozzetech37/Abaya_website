'use client';

import { ORDER_STATUSES, type OrderStatus, PRODUCTION_STAGES, type ProductionStage } from '@abaya/contracts';
import { Columns3, Search, TableIcon } from 'lucide-react';
import * as React from 'react';
import { OrdersBoard } from '@/components/orders/orders-board';
import { OrdersTable } from '@/components/orders/orders-table';
import { PageHeader } from '@/components/page-header';
import { ForbiddenState, TableSkeleton } from '@/components/states';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { ORDER_STATUS_LABELS, STAGE_LABELS, strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { useDebounced } from '@/lib/hooks/use-debounced';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { cn } from '@/lib/utils';

const o = strings.orders;

function pick<T extends string>(values: readonly T[], v: string | null): T | undefined {
  return values.includes(v as T) ? (v as T) : undefined;
}

function OrdersView() {
  const me = useCurrentUser();
  const { params, set } = useUrlState();
  const view = params.get('view') === 'table' ? 'table' : 'board';
  const status = pick<OrderStatus>(ORDER_STATUSES, params.get('status'));
  const stage = pick<ProductionStage>(PRODUCTION_STAGES, params.get('stage'));
  const [search, setSearch] = React.useState(params.get('q') ?? '');
  const q = useDebounced(search.trim(), 350);

  React.useEffect(() => {
    if ((params.get('q') ?? '') !== q) set({ q });
  }, [q, params, set]);

  if (!me.can('viewOrders')) return <ForbiddenState />;
  const filters = { status, stage, q: q || undefined };

  return (
    <>
      <PageHeader
        title={o.title}
        subtitle={o.subtitle}
        actions={
          <div className="flex rounded-md border border-border bg-surface p-0.5" role="group" aria-label={strings.common.view}>
            {(['board', 'table'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => set({ view: v === 'table' ? 'table' : null })}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                  view === v ? 'bg-neutral-100 text-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                {v === 'board' ? <Columns3 className="size-4" aria-hidden /> : <TableIcon className="size-4" aria-hidden />}
                {v === 'board' ? o.board : o.table}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            data-page-search
            type="search"
            aria-label={o.searchPlaceholder}
            placeholder={`${o.searchPlaceholder}  ( / )`}
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <NativeSelect aria-label={o.statusFilter} value={status ?? ''} onChange={(e) => set({ status: e.target.value || null })} className="w-44">
          <option value="">{o.statusFilter}: {strings.common.all}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label={o.stageFilter} value={stage ?? ''} onChange={(e) => set({ stage: e.target.value || null })} className="w-44">
          <option value="">{o.stageFilter}: {strings.common.all}</option>
          {PRODUCTION_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </div>

      {view === 'board' ? (
        <OrdersBoard params={filters} />
      ) : (
        <Card>
          <OrdersTable key={JSON.stringify(filters)} params={filters} />
        </Card>
      )}
    </>
  );
}

export default function OrdersPage() {
  return (
    <React.Suspense fallback={<TableSkeleton />}>
      <OrdersView />
    </React.Suspense>
  );
}
