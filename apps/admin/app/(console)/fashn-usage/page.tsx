'use client';

import { type FashnUsageJobDto, fashnUsageQuery, type FashnUsageUserDto } from '@abaya/contracts';
import { ArrowDown, ArrowUp, CalendarDays, Coins, Download, ImageOff, Lock, Search, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { EmptyState, ErrorState, ForbiddenState, TableSkeleton } from '@/components/states';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { strings } from '@/content/strings';
import { useCurrentUser } from '@/lib/current-user';
import {
  type AudienceFilter,
  currentRange,
  downloadCsv,
  filterRows,
  nextSort,
  type RangePreset,
  type Sort,
  type SortKey,
  sortRows,
  todayInIndia,
  usageCsv,
} from '@/lib/fashn-usage';
import { formatDate, formatDateTime, formatRelative, humanize } from '@/lib/format';
import { useFashnUsage, useFashnUsageJobs, useFashnUsageSummary } from '@/lib/queries/fashn-usage';
import { cn } from '@/lib/utils';

const t = strings.fashnUsage;

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: t.colPerson },
  { key: 'previews', label: t.colPreviews, numeric: true },
  { key: 'tryOns', label: t.colTryOns, numeric: true },
  { key: 'studioJobs', label: t.colStudio, numeric: true },
  { key: 'failed', label: t.colFailed, numeric: true },
  { key: 'remakes', label: t.colRemakes, numeric: true },
  { key: 'credits', label: t.colCredits, numeric: true },
  { key: 'lastUsedAt', label: t.colLastUsed },
];

const displayName = (r: Pick<FashnUsageUserDto, 'name' | 'email'>) => r.name ?? r.email ?? t.deletedUser;

/** FASHN credits per person, for the catalog manager and super admin (the API checks the role too). */
export default function FashnUsagePage() {
  const me = useCurrentUser();
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [custom, setCustom] = useState(() => {
    const today = todayInIndia();
    return { from: `${today.slice(0, 8)}01`, to: today };
  });
  const [audience, setAudience] = useState<AudienceFilter>('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>({ key: 'credits', desc: true });
  const [openUser, setOpenUser] = useState<FashnUsageUserDto | null>(null);

  const range = useMemo(() => currentRange(preset, custom), [preset, custom]);
  const rangeCheck = fashnUsageQuery.safeParse(range);
  const summary = useFashnUsageSummary();
  const report = useFashnUsage(range, rangeCheck.success);
  const rows = useMemo(
    () => sortRows(filterRows(report.data?.users ?? [], audience, search), sort),
    [report.data, audience, search, sort],
  );

  if (!me.can('manageCatalog')) return <ForbiddenState />;
  const s = summary.data;
  const filtered = audience !== 'ALL' || search.trim() !== '';

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={rows.length === 0}
            onClick={() => downloadCsv(usageCsv(rows), `fashn-usage-${range.from}-to-${range.to}.csv`)}
          >
            <Download className="size-4" aria-hidden /> {t.exportCsv}
          </Button>
        }
      />
      {s && !s.live ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.testMode}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t.today}
          value={s?.today.total ?? '—'}
          icon={<Coins className="size-4" />}
          tone={s && s.today.website >= s.websiteDailyLimit ? 'danger' : 'accent'}
          hint={s ? t.websiteLimit(s.today.website, s.websiteDailyLimit) : undefined}
        />
        <StatTile
          label={t.last7Days}
          value={s?.last7Days.total ?? '—'}
          icon={<CalendarDays className="size-4" />}
          hint={s ? t.split(s.last7Days.website, s.last7Days.studio) : undefined}
        />
        <StatTile
          label={t.thisMonth}
          value={s?.thisMonth.total ?? '—'}
          icon={<CalendarDays className="size-4" />}
          hint={s ? t.split(s.thisMonth.website, s.thisMonth.studio) : undefined}
        />
        <StatTile
          label={t.balance}
          value={s ? (s.balance ?? t.balanceUnknown) : '—'}
          icon={<Wallet className="size-4" />}
          hint={s ? t.staffLimit(s.staffDailyLimit) : t.balanceHint}
        />
      </div>

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
          <div className="space-y-1">
            <Label htmlFor="usage-range">{t.range}</Label>
            <NativeSelect id="usage-range" value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)}>
              {(Object.keys(t.presets) as RangePreset[]).map((p) => (
                <option key={p} value={p}>
                  {t.presets[p]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="usage-audience">{t.audience}</Label>
            <NativeSelect id="usage-audience" value={audience} onChange={(e) => setAudience(e.target.value as AudienceFilter)}>
              {(Object.keys(t.audiences) as AudienceFilter[]).map((a) => (
                <option key={a} value={a}>
                  {t.audiences[a]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="usage-search">{t.search}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input id="usage-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
          </div>
        </div>
        {preset === 'custom' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
            <div className="space-y-1">
              <Label htmlFor="usage-from">{t.from}</Label>
              <Input id="usage-from" type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="usage-to">{t.to}</Label>
              <Input id="usage-to" type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          </div>
        ) : null}
        {!rangeCheck.success ? (
          <p role="alert" className="text-sm text-danger">
            {rangeCheck.error.issues[0]?.message}
          </p>
        ) : report.data ? (
          <p className="text-sm text-muted">
            {t.rangeTotal(report.data.totals.total, report.data.totals.website, report.data.totals.studio)} · {t.people(rows.length)}
          </p>
        ) : null}
      </Card>

      {!rangeCheck.success ? null : report.isPending ? (
        <Card>
          <TableSkeleton cols={8} />
        </Card>
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Coins className="size-5" />} title={filtered ? t.emptyFiltered : t.empty} body={t.emptyHint} />
        </Card>
      ) : (
        <Card className={cn('overflow-hidden transition-opacity', report.isPlaceholderData && 'opacity-60')}>
          <Table>
            <THead>
              <TR>
                {COLUMNS.map((c) => (
                  <SortHeader key={c.key} column={c} sort={sort} onSort={(key) => setSort((cur) => nextSort(cur, key))} />
                ))}
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.userId} className="cursor-pointer hover:bg-neutral-50" onClick={() => setOpenUser(r)}>
                  <TD className="min-w-56">
                    <button
                      type="button"
                      className="block max-w-full text-left focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      aria-label={t.viewJobs(displayName(r))}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenUser(r);
                      }}
                    >
                      <span className={cn('block truncate font-medium', !r.name && !r.email && 'italic text-muted')}>{displayName(r)}</span>
                      {r.name && r.email ? <span className="block truncate text-xs text-muted">{r.email}</span> : null}
                    </button>
                    <Badge tone={r.audience === 'STAFF' ? 'indigo' : 'neutral'} className="mt-1">
                      {r.audience === 'STAFF' ? `${t.staff} · ${r.roles.filter((x) => x !== 'CUSTOMER').map(humanize).join(', ')}` : t.customer}
                    </Badge>
                  </TD>
                  <Num value={r.previews} />
                  <Num value={r.tryOns} />
                  <Num value={r.studioJobs} />
                  <Num value={r.failed} tone={r.failed > 0 ? 'text-amber-700' : undefined} />
                  <Num value={r.remakes} />
                  <TD className="text-right font-semibold tabular-nums text-foreground">{r.credits}</TD>
                  <TD className="whitespace-nowrap text-muted" title={formatDateTime(r.lastUsedAt)}>
                    {formatRelative(r.lastUsedAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <JobsDialog user={openUser} range={range} onClose={() => setOpenUser(null)} />
    </div>
  );
}

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: (typeof COLUMNS)[number];
  sort: Sort;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === column.key;
  const Arrow = sort.desc ? ArrowDown : ArrowUp;
  return (
    <TH
      className={cn(column.numeric && 'text-right')}
      aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={cn(
          'inline-flex items-center gap-1 rounded uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
          active && 'text-foreground',
        )}
        aria-label={t.sortBy(column.label)}
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

const STATUS_TONE: Record<FashnUsageJobDto['status'], BadgeTone> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  DONE: 'success',
  FAILED: 'danger',
};

function JobsDialog({ user, range, onClose }: { user: FashnUsageUserDto | null; range: { from: string; to: string }; onClose: () => void }) {
  const jobs = useFashnUsageJobs(user?.userId ?? null, range);
  const name = user ? displayName(user) : '';
  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t.jobsTitle(name)}</DialogTitle>
          <DialogDescription>{t.jobsSubtitle(formatDate(range.from), formatDate(range.to))}</DialogDescription>
        </DialogHeader>
        <DialogBody className="overflow-y-auto">
          {jobs.isPending ? (
            <TableSkeleton rows={4} cols={3} />
          ) : jobs.isError ? (
            <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
          ) : jobs.data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{t.jobsEmpty}</p>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {jobs.data.items.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 py-2.5">
                    <Thumb job={j} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">
                        {t.sources[j.source]}
                        {j.kind ? ` · ${humanize(j.kind)}` : ''}
                        {j.view && j.view !== j.kind ? ` · ${humanize(j.view)}` : ''}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {j.designName ?? t.noDesign} · {formatDateTime(j.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={STATUS_TONE[j.status]}>{t.statuses[j.status]}</Badge>
                      <span className="text-xs tabular-nums text-muted">
                        {t.credits(j.credits)}
                        {j.remakes > 0 ? ` · ${t.remade}` : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {jobs.data.more ? <p className="pt-3 text-xs text-muted">{t.jobsMore(jobs.data.items.length)}</p> : null}
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function Thumb({ job }: { job: FashnUsageJobDto }) {
  const box = 'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-100 text-muted';
  if (job.source === 'TRYON') {
    return (
      <span className={box} title={t.privatePhoto}>
        <Lock className="size-4" aria-hidden />
        <span className="sr-only">{t.privatePhoto}</span>
      </span>
    );
  }
  if (!job.thumbnailUrl) {
    return (
      <span className={box} title={t.noPicture}>
        <ImageOff className="size-4" aria-hidden />
        <span className="sr-only">{t.noPicture}</span>
      </span>
    );
  }
  return (
    <span className={box}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
      <img src={job.thumbnailUrl} alt={job.designName ?? t.sources[job.source]} className="size-full object-cover" loading="lazy" />
    </span>
  );
}
