'use client';

import type {
  OverviewJobDto,
  OverviewJobState,
  OverviewPersonDto,
  WorkshopOverviewDto,
} from '@abaya/contracts';
import { AlarmClock, CircleHelp, Play, RotateCcw, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Thumb } from '@/components/safe-image';
import { EmptyState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { strings } from '@/content/strings';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { STATION_ICONS } from './stations';

const w = strings.workshop;
const t = strings.production.team;

type StationFilter = 'all' | OverviewPersonDto['station'];
type StateFilter = 'all' | 'started' | 'waiting' | 'overdue';
const STATIONS: OverviewPersonDto['station'][] = [
  'pattern',
  'cutting',
  'stitching',
  'qc',
  'finishing',
];

const STATE_STYLE: Record<OverviewJobState, string> = {
  started: 'bg-emerald-50 text-emerald-800',
  held: 'bg-amber-50 text-amber-800',
  waiting: 'bg-sky-50 text-sky-800',
  upcoming: 'bg-neutral-100 text-neutral-600',
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
        active
          ? 'border-accent-700 bg-accent-700 text-white'
          : 'border-border bg-surface text-neutral-700 hover:bg-neutral-50',
      )}
    >
      {children}
    </button>
  );
}

/** One job line inside a person's card. */
function JobLine({ job }: { job: OverviewJobDto & { state: OverviewJobState } }) {
  return (
    <li>
      <Link
        href={`/workshop/item/${job.id}`}
        className="flex items-center gap-2.5 rounded-md p-1.5 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <Thumb
          src={job.primaryImageUrl}
          alt=""
          fallbackText={job.designName}
          className="h-10 w-8 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{job.designName}</p>
          <p className="truncate text-xs text-muted">
            <span className="font-mono">{job.orderNumber}</span>
            {job.state === 'started' && job.startedAt
              ? ` · ${w.startedAgo(formatRelative(job.startedAt))}`
              : ''}
            {job.state === 'upcoming' && job.station
              ? ` · ${w.atStation(w.stations[job.station].name)}`
              : ''}
            {job.dueDate ? ` · ${w.due(formatDate(job.dueDate))}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              STATE_STYLE[job.state],
            )}
          >
            {w.jobState[job.state]}
          </span>
          {job.isOverdue ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-danger">
              <AlarmClock className="size-3" aria-hidden /> {w.overdue}
            </span>
          ) : job.isRework ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-red-700">
              <RotateCcw className="size-3" aria-hidden /> {w.rework}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function PersonCard({
  person,
  jobs,
}: {
  person: OverviewPersonDto;
  jobs: OverviewPersonDto['jobs'];
}) {
  const Icon = STATION_ICONS[person.station];
  const active = jobs.filter((j) => j.state !== 'upcoming').length;
  const overdue = jobs.filter((j) => j.isOverdue).length;
  const working = jobs.some((j) => j.state === 'started');
  return (
    <Card className={cn('flex h-full flex-col', overdue > 0 && 'border-red-200')}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
          <Icon className="size-4" aria-hidden />
          {working ? (
            <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-surface">
              <Play className="size-2 fill-white text-white" aria-hidden />
            </span>
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{person.name ?? '—'}</p>
          <p className="text-xs text-muted">
            {t.stations[person.station]} · {w.jobsCount(active, jobs.length - active)}
          </p>
        </div>
        {overdue > 0 ? <Badge tone="danger">{w.overdueCount(overdue)}</Badge> : null}
      </div>
      <ul className="space-y-0.5 p-2">
        {jobs.map((j) => (
          <JobLine key={`${j.id}-${j.state}`} job={j} />
        ))}
      </ul>
    </Card>
  );
}

/** Managers: every team member with their jobs, filterable by station and state, plus who is free. */
export function TeamAtWork({ data }: { data: WorkshopOverviewDto }) {
  const [station, setStation] = React.useState<StationFilter>('all');
  const [state, setState] = React.useState<StateFilter>('all');

  const matches = (j: OverviewPersonDto['jobs'][number]) =>
    state === 'all'
      ? true
      : state === 'overdue'
        ? j.isOverdue
        : state === 'started'
          ? j.state === 'started'
          : j.state === 'waiting';
  const people = data.people
    .filter((p) => station === 'all' || p.station === station)
    .map((p) => ({ person: p, jobs: p.jobs.filter(matches) }))
    .filter((p) => p.jobs.length > 0);
  const idle = data.idle.filter((p) => station === 'all' || p.station === station);

  return (
    <Card>
      <CardHeader className="flex-col sm:flex-row">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-accent-700" aria-hidden /> {w.teamAtWork}
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted">{w.teamAtWorkHint}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          <Chip active={station === 'all'} onClick={() => setStation('all')}>
            {w.filterAll}
          </Chip>
          {STATIONS.map((s) => (
            <Chip key={s} active={station === s} onClick={() => setStation(s)}>
              {t.short[s]}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-border" aria-hidden />
          {(['all', 'started', 'waiting', 'overdue'] as const).map((s) => (
            <Chip key={s} active={state === s} onClick={() => setState(s)}>
              {w.stateFilter[s]}
            </Chip>
          ))}
        </div>

        {people.length === 0 ? (
          <EmptyState title={w.nobodyWorking} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {people.map(({ person, jobs }) => (
              <li key={`${person.station}:${person.id}`}>
                <PersonCard person={person} jobs={jobs} />
              </li>
            ))}
          </ul>
        )}

        {idle.length > 0 ? (
          <div className="rounded-lg bg-neutral-50 px-3 py-2.5">
            <p className="mb-1.5 text-xs font-medium text-muted">{w.idle}</p>
            <div className="flex flex-wrap gap-1.5">
              {idle.map((p) => (
                <Badge key={`${p.station}:${p.id}`}>
                  {p.name ?? '—'} · {t.short[p.station]}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AttentionRow({
  job,
  href,
  detail,
  tone,
}: {
  job: OverviewJobDto;
  href: string;
  detail: React.ReactNode;
  tone: 'amber' | 'red' | 'neutral';
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2.5 rounded-md p-1.5 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <Thumb
          src={job.primaryImageUrl}
          alt=""
          fallbackText={job.designName}
          className="h-10 w-8 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {job.designName}{' '}
            <span className="font-mono text-xs font-normal text-muted">{job.orderNumber}</span>
          </p>
          <p
            className={cn(
              'line-clamp-1 text-xs',
              tone === 'amber' ? 'text-amber-900' : tone === 'red' ? 'text-danger' : 'text-muted',
            )}
          >
            {detail}
          </p>
        </div>
      </Link>
    </li>
  );
}

/** Managers: questions to answer, late jobs and abayas without a full team. */
export function NeedsAttention({ data }: { data: WorkshopOverviewDto }) {
  const groups = [
    {
      key: 'hold',
      title: w.onHoldTitle,
      icon: CircleHelp,
      iconClass: 'text-amber-700',
      rows: data.onHold.map((j) => (
        <AttentionRow
          key={j.id}
          job={j}
          href={`/workshop/item/${j.id}`}
          tone="amber"
          detail={j.holdReason ?? w.heldReason}
        />
      )),
    },
    {
      key: 'overdue',
      title: w.overdueTitle,
      icon: AlarmClock,
      iconClass: 'text-danger',
      rows: data.overdue.map((j) => (
        <AttentionRow
          key={j.id}
          job={j}
          href={`/workshop/item/${j.id}`}
          tone="red"
          detail={`${w.due(formatDate(j.dueDate))}${j.station ? ` · ${w.atStation(w.stations[j.station].name)}` : ''}`}
        />
      )),
    },
    {
      key: 'team',
      title: w.teamMissingTitle,
      icon: Users,
      iconClass: 'text-accent-700',
      rows: data.teamMissing.map((j) => (
        <AttentionRow
          key={j.id}
          job={j}
          href={`/orders/${j.orderId}#item-${j.id}`}
          tone="neutral"
          detail={w.missingPeople(j.missing.map((m) => t.short[m]).join(', '))}
        />
      )),
    },
  ].filter((g) => g.rows.length > 0);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{w.attention}</CardTitle>
          <p className="mt-0.5 text-xs text-muted">{w.attentionHint}</p>
        </div>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">{w.attentionEmpty}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {groups.map((g) => (
              <section key={g.key} className="min-w-0">
                <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <g.icon className={cn('size-3.5', g.iconClass)} aria-hidden /> {g.title} (
                  {g.rows.length})
                </h3>
                <ul className="space-y-0.5">{g.rows}</ul>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
