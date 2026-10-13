'use client';

import {
  stationsForRoles,
  WORKSHOP_STATIONS,
  type WorkshopDoneItemDto,
  type WorkshopStation,
} from '@abaya/contracts';
import {
  AlarmClock,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Inbox,
  ListChecks,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Thumb } from '@/components/safe-image';
import { StatTile } from '@/components/stat-tile';
import { StageBadge } from '@/components/status-badges';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EarningsCard } from '@/components/workshop/earnings-card';
import { QueueCard } from '@/components/workshop/queue-card';
import { STATION_ICONS } from '@/components/workshop/stations';
import { STYLE_LABELS, strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { formatRelative } from '@/lib/format';
import {
  type QueueView,
  useWorkshopDone,
  useWorkshopQueue,
  useWorkshopSummary,
} from '@/lib/queries/workshop';
import { cn } from '@/lib/utils';

const w = strings.workshop;
type View = QueueView | 'done';
const VIEWS: View[] = ['all', 'mine', 'overdue', 'on-hold', 'done'];
const GUIDE_KEY = 'workshop-guide-hidden';

/** The station's checklist of what a job needs, collapsible (remembered per browser). */
function Guide({ station }: { station: WorkshopStation }) {
  // The workshop renders only after sign-in on the client, so storage is available here.
  const [open, setOpen] = React.useState(() => {
    try {
      return localStorage.getItem(`${GUIDE_KEY}:${station}`) !== '1';
    } catch {
      return true; // storage blocked: keep it open
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(`${GUIDE_KEY}:${station}`, o ? '1' : '0');
      } catch {
        // Not remembered; fine.
      }
      return !o;
    });
  };
  const steps = w.guide[station] ?? [];
  return (
    <Card>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <ListChecks className="size-4 text-accent-700" aria-hidden />
        <span className="flex-1 text-sm font-semibold">{w.guideTitle}</span>
        <span className="text-xs text-muted">{open ? w.guideHide : w.guideShow}</span>
        <ChevronDown
          className={cn('size-4 text-muted transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? (
        <ol className="grid gap-2 border-t border-border px-4 py-3 sm:grid-cols-2">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-2.5 text-sm">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-50 text-[11px] font-semibold text-accent-700">
                {i + 1}
              </span>
              <span className="text-neutral-700">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}

/** A job finished here: where it is now, when and by whom. */
function DoneCard({ item }: { item: WorkshopDoneItemDto }) {
  const body = (
    <div className="flex gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <Thumb
        src={item.primaryImageUrl}
        alt=""
        fallbackText={item.designName}
        className="h-20 w-[60px]"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
            <CheckCircle2 className="size-3.5" aria-hidden />{' '}
            {w.doneAt(formatRelative(item.doneAt))}
          </span>
          {item.doneBy?.name ? (
            <span className="text-muted">{w.doneBy(item.doneBy.name)}</span>
          ) : null}
        </div>
        <p className="line-clamp-1 font-semibold leading-tight">{item.designName}</p>
        <p className="text-xs text-muted">
          {STYLE_LABELS[item.style]} · {w.size(item.sizeBandCode)} ·{' '}
          <span className="font-mono">{item.orderNumber}</span>
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          {w.nowAt}: <StageBadge stage={item.stage} />
        </div>
        {item.note ? <p className="line-clamp-2 text-xs text-neutral-600">{item.note}</p> : null}
      </div>
    </div>
  );
  return item.canOpen ? (
    <Link
      href={`/workshop/item/${item.id}`}
      className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function Grid({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <ul className={cn('grid gap-3 md:grid-cols-2 xl:grid-cols-3', dim && 'opacity-60')}>
      {children}
    </ul>
  );
}

function LoadingGrid() {
  return (
    <Grid>
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i}>
          <Skeleton className="h-40 rounded-xl" />
        </li>
      ))}
    </Grid>
  );
}

function StationQueue({ station }: { station: WorkshopStation }) {
  const me = useCurrentUser();
  const { params, set } = useUrlState();
  const view = (VIEWS as string[]).includes(params.get('view') ?? '')
    ? (params.get('view') as View)
    : 'all';
  const queue = useWorkshopQueue(station, view === 'done' ? 'all' : view);
  const done = useWorkshopDone(station);
  const summary = useWorkshopSummary();
  const counts = summary.data?.find((s) => s.station === station);
  const Icon = STATION_ICONS[station];

  if (!stationsForRoles(me.roles).includes(station)) return <ForbiddenState />;

  const count = (n: number | undefined) =>
    n === undefined ? <Skeleton className="h-9 w-10" /> : n;
  const refresh = () => {
    void queue.refetch();
    void done.refetch();
    void summary.refetch();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
              <Icon className="size-5" aria-hidden />
            </span>
            {w.stations[station].name}
          </span>
        }
        subtitle={w.stations[station].description}
        actions={
          <Button variant="secondary" size="sm" onClick={refresh} disabled={queue.isFetching}>
            <RefreshCw className={cn(queue.isFetching && 'animate-spin')} /> {w.refresh}
          </Button>
        }
        className="mb-0"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile
          label={w.counts.waiting}
          value={count(counts?.waiting)}
          icon={<Inbox className="size-4" />}
          tone="accent"
          href={`/workshop/${station}`}
        />
        <StatTile
          label={w.counts.mine}
          value={count(counts?.mine)}
          icon={<UserRound className="size-4" />}
          href={`/workshop/${station}?view=mine`}
        />
        <StatTile
          label={w.counts.overdue}
          value={count(counts?.overdue)}
          icon={<AlarmClock className="size-4" />}
          tone="danger"
          href={`/workshop/${station}?view=overdue`}
        />
        <StatTile
          label={w.counts.onHold}
          value={count(counts?.onHold)}
          icon={<CircleHelp className="size-4" />}
          tone="warning"
          href={`/workshop/${station}?view=on-hold`}
        />
        <StatTile
          label={w.doneCount}
          value={count(done.data?.length)}
          icon={<CheckCircle2 className="size-4" />}
          href={`/workshop/${station}?view=done`}
        />
      </div>

      {station === 'stitching' && me.roles.includes('MAKER') ? <EarningsCard /> : null}

      <Guide key={station} station={station} />

      <div
        role="tablist"
        aria-label={w.stations[station].name}
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1"
      >
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => set({ view: v === 'all' ? null : v })}
            className={cn(
              'h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
              view === v
                ? 'border-accent-700 bg-accent-700 text-white'
                : 'border-border bg-surface text-neutral-700 hover:bg-neutral-50',
            )}
          >
            {v === 'done' ? w.doneTab : w.views[v]}
          </button>
        ))}
      </div>

      {view === 'done' ? (
        done.isError ? (
          <ErrorState error={done.error} onRetry={() => void done.refetch()} />
        ) : done.isPending ? (
          <LoadingGrid />
        ) : done.data.length === 0 ? (
          <EmptyState title={w.doneEmpty} body={w.doneHint} />
        ) : (
          <Grid>
            {done.data.map((item) => (
              <li key={item.id}>
                <DoneCard item={item} />
              </li>
            ))}
          </Grid>
        )
      ) : queue.isError ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : queue.isPending ? (
        <LoadingGrid />
      ) : queue.data.length === 0 ? (
        <EmptyState title={view === 'all' ? w.emptyQueue : w.emptyView} />
      ) : (
        <Grid dim={queue.isPlaceholderData}>
          {queue.data.map((item) => (
            <li key={item.id}>
              <QueueCard item={item} meId={me.id} detailed />
            </li>
          ))}
        </Grid>
      )}
    </div>
  );
}

export default function StationPage() {
  const { station } = useParams<{ station: string }>();
  if (!(WORKSHOP_STATIONS as readonly string[]).includes(station)) notFound();
  return (
    <React.Suspense fallback={<Skeleton className="h-64" />}>
      <StationQueue station={station as WorkshopStation} />
    </React.Suspense>
  );
}
