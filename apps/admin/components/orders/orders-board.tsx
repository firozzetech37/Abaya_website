'use client';

import { isPaymentNotCompleted, PRODUCTION_STAGES, type ProductionStage } from '@abaya/contracts';
import { AlarmClock, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { ErrorState } from '@/components/states';
import { STAGE_DOT } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { STAGE_LABELS, strings } from '@/content/strings';
import { formatDate, isPast } from '@/lib/format';
import { type OrderListParams, useOrdersBoard } from '@/lib/queries/orders';
import { cn } from '@/lib/utils';

const o = strings.orders;

interface BoardCard {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  itemId: string;
  designName: string;
  makerName: string | null;
  /** Who has the job at its current station. */
  withName: string | null;
  teamComplete: boolean;
  dueDate: string | null;
  stage: ProductionStage;
  paid: boolean;
}

const FINISHED: ProductionStage[] = ['SHIPPED', 'DELIVERED', 'CANCELLED'];

/** Production order, with queries on hold next to where work stopped; the old ASSIGNED stage only if used. */
const BOARD_STAGES: ProductionStage[] = [
  'PLACED',
  'SPEC_APPROVED',
  'PATTERN',
  'ON_HOLD',
  'CUTTING',
  'STITCHING',
  'QC',
  'FINISHING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'REMAKE',
  'CANCELLED',
  'ASSIGNED',
];

/** Kanban of order ITEMS by production stage (each abaya moves on its own). */
export function OrdersBoard({ params }: { params: OrderListParams }) {
  const query = useOrdersBoard(params);
  const scroller = React.useRef<HTMLDivElement>(null);

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isPending) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {PRODUCTION_STAGES.slice(0, 6).map((s) => (
          <Skeleton key={s} className="h-80 w-64 shrink-0" />
        ))}
      </div>
    );
  }

  const cards: BoardCard[] = query.data.pages.flatMap((p) =>
    // Checkouts that were never paid never entered production: not on the board.
    p.items.filter((order) => !isPaymentNotCompleted(order)).flatMap((order) =>
      order.items.map((item) => ({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        itemId: item.id,
        designName: item.designName,
        makerName: item.makerName,
        withName: item.withName,
        teamComplete: item.teamComplete,
        paid: order.status === 'PAID',
        dueDate: item.dueDate,
        // An unpaid checkout that was cancelled (or a fully refunded order) keeps its items at
        // PLACED in the database; on the board they belong with the cancelled ones.
        stage:
          order.status === 'CANCELLED' || order.status === 'REFUNDED' ? 'CANCELLED' : item.stage,
      })),
    ),
  );
  const byStage = new Map<ProductionStage, BoardCard[]>(PRODUCTION_STAGES.map((s) => [s, []]));
  for (const c of cards) byStage.get(c.stage)?.push(c);

  const stages = BOARD_STAGES.filter((s) => s !== 'ASSIGNED' || (byStage.get(s)?.length ?? 0) > 0);
  const scrollBy = (dir: 1 | -1) =>
    scroller.current?.scrollBy({ left: dir * 480, behavior: 'smooth' });
  const jumpTo = (stage: ProductionStage) =>
    document
      .getElementById(`board-${stage}`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });

  return (
    <div className="space-y-3">
      {/* Every stage at a glance, with counts; click to jump to its column. */}
      <nav aria-label={o.allStages} className="flex flex-wrap gap-1.5">
        {stages.map((stage) => {
          const n = byStage.get(stage)?.length ?? 0;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => jumpTo(stage)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                n > 0
                  ? 'border-border bg-surface text-foreground hover:bg-neutral-50'
                  : 'border-transparent bg-neutral-100 text-muted hover:bg-neutral-200',
              )}
            >
              <span className={cn('size-2 rounded-full', STAGE_DOT[stage])} aria-hidden />
              {STAGE_LABELS[stage]}
              <span className="tabular-nums">{n}</span>
            </button>
          );
        })}
      </nav>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{o.boardHint}</p>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="size-8"
            aria-label={o.scrollLeft}
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="size-8"
            aria-label={o.scrollRight}
            onClick={() => scrollBy(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div
        ref={scroller}
        className="flex snap-x gap-3 overflow-x-auto pb-3 [scrollbar-color:theme(colors.neutral.300)_transparent]"
        role="list"
        aria-label={o.board}
      >
        {stages.map((stage) => {
          const col = byStage.get(stage) ?? [];
          col.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
          return (
            <section
              key={stage}
              id={`board-${stage}`}
              role="listitem"
              aria-label={`${STAGE_LABELS[stage]}: ${col.length}`}
              className={cn(
                'flex max-h-[72vh] w-56 shrink-0 snap-start flex-col rounded-lg border border-border bg-neutral-100/70',
                FINISHED.includes(stage) && 'opacity-80',
              )}
            >
              <header className="flex items-center justify-between px-3 py-2">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-700">
                  <span className={cn('size-2 rounded-full', STAGE_DOT[stage])} aria-hidden />
                  {STAGE_LABELS[stage]}
                </span>
                <span className="rounded-full bg-surface px-2 text-xs tabular-nums text-muted">
                  {col.length}
                </span>
              </header>
              <ul className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {col.length === 0 ? (
                  <li className="px-1 py-4 text-center text-xs text-muted">{o.emptyColumn}</li>
                ) : null}
                {col.map((c) => {
                  const late = c.dueDate && !FINISHED.includes(c.stage) && isPast(c.dueDate);
                  return (
                    <li key={c.itemId}>
                      <Link
                        href={`/orders/${c.orderId}#item-${c.itemId}`}
                        className={cn(
                          'block rounded-md border bg-surface p-2.5 shadow-sm transition-colors hover:border-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                          late ? 'border-red-200' : 'border-border',
                        )}
                      >
                        <p className="truncate text-sm font-medium">{c.designName}</p>
                        <p className="mt-0.5 flex justify-between gap-2 text-xs text-muted">
                          <span className="font-mono">{c.orderNumber}</span>
                          <span className="truncate">{c.customerName ?? ''}</span>
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                          {c.paid && !c.teamComplete && !FINISHED.includes(c.stage) ? (
                            <span className="inline-flex items-center gap-1 truncate font-medium text-amber-700">
                              <Users className="size-3 shrink-0" aria-hidden />{' '}
                              {strings.production.team.incomplete}
                            </span>
                          ) : (
                            <span className="truncate text-neutral-600">
                              {c.withName
                                ? strings.production.team.withNow(c.withName)
                                : (c.makerName ?? o.unassigned)}
                            </span>
                          )}
                          {c.dueDate ? (
                            <span
                              className={cn(
                                'inline-flex shrink-0 items-center gap-1 tabular-nums',
                                late ? 'font-medium text-danger' : 'text-muted',
                              )}
                            >
                              {late ? <AlarmClock className="size-3" aria-label={o.late} /> : null}
                              {formatDate(c.dueDate)}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {query.hasNextPage ? (
        <div className="text-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void query.fetchNextPage()}
            loading={query.isFetchingNextPage}
          >
            {strings.common.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
