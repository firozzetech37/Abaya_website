'use client';

import { stationsForRoles, type WorkshopStationSummary } from '@abaya/contracts';
import {
  AlarmClock,
  ArrowDown,
  ArrowRight,
  CircleHelp,
  Inbox,
  Play,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { EmptyState, ErrorState } from '@/components/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { QueueCard } from '@/components/workshop/queue-card';
import { STATION_ICONS } from '@/components/workshop/stations';
import { NeedsAttention, TeamAtWork } from '@/components/workshop/team-at-work';
import { strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import { useMyWorkshopJobs, useWorkshopOverview, useWorkshopSummary } from '@/lib/queries/workshop';
import { cn } from '@/lib/utils';

const w = strings.workshop;

/** One station in the production line: jobs here, and what needs attention. */
function StationStep({
  index,
  counts,
  station,
}: {
  index: number;
  counts?: WorkshopStationSummary;
  station: WorkshopStationSummary['station'];
}) {
  const Icon = STATION_ICONS[station];
  const attention = (counts?.overdue ?? 0) + (counts?.onHold ?? 0) > 0;
  return (
    <Link
      href={`/workshop/${station}`}
      className={cn(
        'group flex h-full flex-col rounded-xl border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
        attention ? 'border-amber-300' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {w.step(index + 1)}
        </span>
      </div>
      <p className="mt-3 font-semibold">{w.stations[station].name}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{w.stations[station].description}</p>
      <div className="mt-auto pt-4">
        {counts ? (
          <>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{counts.waiting}</p>
            <p className="text-xs text-muted">{w.waitingHere(counts.waiting)}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {counts.mine > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 font-medium text-accent-800">
                  <UserRound className="size-3" aria-hidden /> {counts.mine}{' '}
                  {w.counts.mine.toLowerCase()}
                </span>
              ) : null}
              {counts.overdue > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
                  <AlarmClock className="size-3" aria-hidden /> {counts.overdue}{' '}
                  {w.counts.overdue.toLowerCase()}
                </span>
              ) : null}
              {counts.onHold > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                  <CircleHelp className="size-3" aria-hidden /> {counts.onHold}{' '}
                  {w.counts.onHold.toLowerCase()}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <Skeleton className="h-12 w-20" />
        )}
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent-700">
        {w.open}{' '}
        <ArrowRight
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}

/**
 * /workshop: totals, the stations as a production line (in order, left to right), then for
 * managers who is working on what (and what needs attention), for everyone else their own
 * jobs right now. People with one station go straight to it.
 */
export default function WorkshopHome() {
  const me = useCurrentUser();
  const router = useRouter();
  const stations = stationsForRoles(me.roles);
  const manager = me.can('manageProduction');
  const summary = useWorkshopSummary(stations.length > 1);
  const overview = useWorkshopOverview(manager);
  const mine = useMyWorkshopJobs(stations.length > 1 && !manager ? stations : []);

  const only = stations.length === 1 ? stations[0] : null;
  React.useEffect(() => {
    if (only) router.replace(`/workshop/${only}`);
  }, [only, router]);
  if (only) return null;

  const total = (k: 'waiting' | 'mine' | 'overdue' | 'onHold') =>
    summary.data ? summary.data.reduce((n, s) => n + s[k], 0) : <Skeleton className="h-9 w-12" />;
  const myJobs = [...mine.items].sort(
    (a, b) =>
      Number(b.isOverdue) - Number(a.isOverdue) ||
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
  );

  return (
    <>
      <PageHeader title={w.greeting(me.name)} subtitle={w.homeSubtitle} />

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label={w.totals.waiting}
              value={total('waiting')}
              icon={<Inbox className="size-4" />}
              tone="accent"
            />
            {manager ? (
              <StatTile
                label={w.inProgress}
                value={overview.data ? overview.data.inProgress : <Skeleton className="h-9 w-12" />}
                icon={<Play className="size-4" />}
              />
            ) : (
              <StatTile
                label={w.totals.mine}
                value={total('mine')}
                icon={<UserRound className="size-4" />}
              />
            )}
            <StatTile
              label={w.totals.overdue}
              value={total('overdue')}
              icon={<AlarmClock className="size-4" />}
              tone="danger"
            />
            <StatTile
              label={w.totals.onHold}
              value={total('onHold')}
              icon={<CircleHelp className="size-4" />}
              tone="warning"
            />
          </div>

          <section aria-labelledby="line-title">
            <div className="mb-3">
              <h2 id="line-title" className="font-display text-xl font-semibold">
                {w.line}
              </h2>
              <p className="text-sm text-muted">{w.lineHint}</p>
            </div>
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              {stations.map((station, i) => (
                <li key={station} className="relative">
                  <StationStep
                    index={i}
                    station={station}
                    counts={summary.data?.find((s) => s.station === station)}
                  />
                  {/* Flow arrows: down on phones, right on the widest screens. */}
                  {i < stations.length - 1 ? (
                    <>
                      <ArrowDown
                        className="mx-auto mt-2 size-4 text-neutral-400 sm:hidden"
                        aria-hidden
                      />
                      <ArrowRight
                        className="absolute -right-3 top-1/2 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-background text-neutral-400 2xl:block"
                        aria-hidden
                      />
                    </>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          {manager ? (
            overview.isError ? (
              <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
            ) : overview.isPending ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : (
              <>
                <NeedsAttention data={overview.data} />
                <TeamAtWork data={overview.data} />
              </>
            )
          ) : (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{w.myJobs}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted">{w.myJobsHint}</p>
                </div>
              </CardHeader>
              <CardContent>
                {mine.error ? (
                  <ErrorState error={mine.error} onRetry={mine.refetch} />
                ) : mine.isPending ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-32 rounded-xl" />
                    ))}
                  </div>
                ) : myJobs.length === 0 ? (
                  <EmptyState title={w.myJobsEmpty} />
                ) : (
                  <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {myJobs.map((item) => (
                      <li key={item.id}>
                        <QueueCard item={item} meId={me.id} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
